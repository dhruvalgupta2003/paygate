"""SolanaAdapter — USDC-on-Solana (mainnet + devnet) payment verification.

Uses ``solders`` for transaction decoding and signature verification (ed25519
via the nacl primitives embedded in solders). ``solana-py`` is used for the
read path (``get_transaction``).

Mirrors ``packages/paygate-node/src/chains/solana.ts``.
"""

from __future__ import annotations

import base64
from typing import Any, Literal

from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from ..constants import SOLANA_PROGRAMS, USDC_ADDRESSES, ChainIdLiteral
from ..errors import ErrorCode, PayGateError
from ..proxy.handshake import decode_payment_header, is_solana_auth
from ..types import (
    PaymentRequirements,
    PriceSpec,
    RequirementOpts,
    SettlementProof,
    SolanaPaymentAuth,
    VerifyFail,
    VerifyOk,
    VerifyResult,
)
from ..utils.digest import digest_requirements
from ..utils.nonce import epoch_seconds, generate_nonce


SolanaChainLiteral = Literal["solana", "solana-devnet"]

# Canonical offset of the associated-token-account (ATA) derivation. This
# mirrors what the TypeScript SDK computes via ``getAssociatedTokenAddressSync``.
_ATA_PROGRAM_ID = Pubkey.from_string(SOLANA_PROGRAMS["ASSOCIATED_TOKEN"])


def _derive_ata(mint: Pubkey, owner: Pubkey, token_program: Pubkey) -> Pubkey:
    seeds = [bytes(owner), bytes(token_program), bytes(mint)]
    address, _ = Pubkey.find_program_address(seeds, _ATA_PROGRAM_ID)
    return address


class SolanaAdapter:
    """Chain adapter for Solana / Solana devnet."""

    id: ChainIdLiteral

    def __init__(
        self,
        *,
        chain_id: SolanaChainLiteral,
        rpc_url: str,
        receiving_wallet: str,
        commitment: str = "confirmed",
        facilitator_url: str | None = None,
    ) -> None:
        if chain_id not in ("solana", "solana-devnet"):
            raise PayGateError(
                code=ErrorCode.BAD_CONFIG,
                detail=f"unsupported solana chain {chain_id!r}",
            )
        self.id = chain_id
        self._rpc_url = rpc_url
        self._commitment = commitment
        self._mint = Pubkey.from_string(USDC_ADDRESSES[chain_id])
        self._receiver = Pubkey.from_string(receiving_wallet)
        self._token_program = Pubkey.from_string(SOLANA_PROGRAMS["TOKEN"])
        self._receiver_ata = _derive_ata(
            mint=self._mint, owner=self._receiver, token_program=self._token_program
        )
        self._facilitator_url = facilitator_url
        self._client: Any | None = None  # lazy — avoids a hard dep during unit tests

    # ------------------------------------------------------------------ API

    def build_payment_requirements(
        self, spec: PriceSpec, opts: RequirementOpts
    ) -> PaymentRequirements:
        if spec.chain != self.id:
            raise PayGateError(
                code=ErrorCode.CHAIN_MISMATCH,
                detail=f"adapter {self.id} cannot serve chain {spec.chain}",
            )
        ttl = opts.validUntilSeconds or 300
        base_payload: dict[str, Any] = {
            "scheme": "exact",
            "chain": self.id,
            "asset": str(self._mint),
            "amount": spec.amount,
            "payTo": str(self._receiver),
            "validUntil": epoch_seconds() + ttl,
        }
        if self._facilitator_url is not None:
            base_payload["facilitator"] = self._facilitator_url
        if opts.description is not None:
            base_payload["description"] = opts.description
        if opts.operator is not None:
            base_payload["operator"] = opts.operator.model_dump(exclude_none=True)

        partial_digest = digest_requirements({**base_payload, "nonce": ""})
        nonce = generate_nonce(partial_digest)
        almost = {**base_payload, "nonce": nonce}
        final = {**almost, "digest": digest_requirements(almost)}
        return PaymentRequirements.model_validate(final)

    async def verify_payment(
        self, req: PaymentRequirements, x_payment: str
    ) -> VerifyResult:
        try:
            auth = decode_payment_header(x_payment)
        except PayGateError as err:
            return VerifyFail(code=err.code.value, detail=err.detail, retryable=err.retryable)
        if not is_solana_auth(auth):
            return VerifyFail(
                code=ErrorCode.CHAIN_MISMATCH.value,
                detail="non-solana auth",
                retryable=False,
            )
        assert isinstance(auth, SolanaPaymentAuth)

        if auth.chain != req.chain:
            return VerifyFail(
                code=ErrorCode.CHAIN_MISMATCH.value,
                detail=f"req={req.chain} auth={auth.chain}",
                retryable=False,
            )
        if auth.mint != str(self._mint):
            return VerifyFail(
                code=ErrorCode.ASSET_MISMATCH.value,
                detail="mint != canonical USDC",
                retryable=False,
            )
        if auth.payTo != str(self._receiver):
            return VerifyFail(
                code=ErrorCode.RECIPIENT_MISMATCH.value,
                detail="payTo != configured wallet",
                retryable=False,
            )
        if auth.nonce != req.nonce:
            return VerifyFail(
                code=ErrorCode.DIGEST_MISMATCH.value,
                detail="nonce mismatch",
                retryable=False,
            )
        if epoch_seconds() > req.validUntil:
            return VerifyFail(
                code=ErrorCode.EXPIRED_AUTHORIZATION.value,
                detail="requirements expired",
                retryable=True,
            )

        try:
            tx = VersionedTransaction.from_bytes(base64.b64decode(auth.transaction))
        except Exception as err:  # noqa: BLE001
            return VerifyFail(
                code=ErrorCode.INVALID_PAYMENT_HEADER.value,
                detail=f"bad tx base64: {err}",
                retryable=False,
            )

        if not self._verify_signatures(tx):
            return VerifyFail(
                code=ErrorCode.INVALID_SIGNATURE.value,
                detail="signature failed verification",
                retryable=False,
            )

        inspection = self._inspect_instructions(tx)
        if not inspection["ok"]:
            return VerifyFail(
                code=inspection.get("code") or ErrorCode.INVALID_SIGNATURE.value,
                detail=inspection["detail"],
                retryable=bool(inspection.get("retryable", False)),
            )

        if int(inspection["amount"]) < int(req.amount):
            return VerifyFail(
                code=ErrorCode.AMOUNT_INSUFFICIENT.value,
                detail=f"required {req.amount}, got {inspection['amount']}",
                retryable=True,
            )

        return VerifyOk(
            settledAmount=str(inspection["amount"]),
            payer=inspection["payer"],
            recipient=str(self._receiver),
            chain=self.id,
            asset=str(self._mint),
            observedAt=epoch_seconds(),
        )

    async def confirm_payment(self, proof: SettlementProof) -> VerifyResult:
        client = self._get_client()
        try:
            res = await client.get_transaction(  # type: ignore[attr-defined]
                proof.txHash,
                commitment=self._commitment,
                max_supported_transaction_version=0,
            )
        except Exception as err:  # noqa: BLE001
            return VerifyFail(
                code=ErrorCode.RPC_UNAVAILABLE.value,
                detail=f"rpc error: {err}",
                retryable=True,
            )
        value = getattr(res, "value", None)
        if value is None:
            return VerifyFail(
                code=ErrorCode.SETTLEMENT_PENDING.value,
                detail="transaction not visible at required commitment yet",
                retryable=True,
            )
        meta = getattr(value, "transaction", None)
        err_field = getattr(getattr(meta, "meta", None), "err", None)
        if err_field is not None:
            return VerifyFail(
                code=ErrorCode.SETTLEMENT_FAILED.value,
                detail=f"tx error: {err_field}",
                retryable=True,
            )
        return VerifyOk(
            settledAmount=proof.amount,
            payer=proof.payer,
            recipient=proof.recipient,
            chain=self.id,
            asset=str(self._mint),
            observedAt=proof.observedAt,
        )

    # --------------------------------------------------------------- helpers

    def _get_client(self) -> Any:
        if self._client is None:
            from solana.rpc.async_api import AsyncClient

            self._client = AsyncClient(self._rpc_url, commitment=self._commitment)
        return self._client

    def _verify_signatures(self, tx: VersionedTransaction) -> bool:
        try:
            message = tx.message
            signatures = tx.signatures
            required = message.header.num_required_signatures
            if len(signatures) < required:
                return False
            msg_bytes = bytes(message)
            for idx in range(required):
                signer = message.account_keys[idx]
                sig = signatures[idx]
                if not sig.verify(bytes(signer), msg_bytes):
                    return False
        except Exception:  # noqa: BLE001 — any failure means invalid
            return False
        return True

    def _inspect_instructions(self, tx: VersionedTransaction) -> dict[str, Any]:
        try:
            message = tx.message
            accounts = list(message.account_keys)
            if not accounts:
                return {"ok": False, "detail": "transaction has no accounts"}
            payer = accounts[0]

            amount: int | None = None
            memo_matched = False
            for compiled in message.instructions:
                program_id = accounts[compiled.program_id_index]
                program_str = str(program_id)
                if program_str == SOLANA_PROGRAMS["MEMO_V2"]:
                    memo_matched = True
                    continue
                if program_str in (
                    SOLANA_PROGRAMS["TOKEN"],
                    SOLANA_PROGRAMS["TOKEN_2022"],
                ):
                    parsed = _parse_token_transfer(
                        data=bytes(compiled.data),
                        account_indices=list(compiled.accounts),
                        accounts=accounts,
                    )
                    if parsed is None:
                        continue
                    dest, parsed_amount = parsed
                    if str(dest) != str(self._receiver_ata):
                        return {
                            "ok": False,
                            "code": ErrorCode.RECIPIENT_MISMATCH.value,
                            "detail": "destination ATA != configured receiver ATA",
                        }
                    amount = parsed_amount
                    continue
                if program_str in (
                    SOLANA_PROGRAMS["COMPUTE_BUDGET"],
                    SOLANA_PROGRAMS["ASSOCIATED_TOKEN"],
                ):
                    continue
                return {
                    "ok": False,
                    "code": ErrorCode.INVALID_SIGNATURE.value,
                    "detail": f"transaction references disallowed program {program_str}",
                }

            if not memo_matched:
                return {"ok": False, "detail": "transaction missing memo instruction"}
            if amount is None:
                return {
                    "ok": False,
                    "detail": "transaction missing USDC transfer instruction",
                }
            return {"ok": True, "amount": str(amount), "payer": str(payer)}
        except Exception as err:  # noqa: BLE001
            return {"ok": False, "detail": f"instruction inspection failed: {err}"}


def _parse_token_transfer(
    *, data: bytes, account_indices: list[int], accounts: list[Pubkey]
) -> tuple[Pubkey, int] | None:
    """Parse an SPL token transfer instruction.

    Returns ``(destination, amount)`` for the canonical ``Transfer`` (op 3,
    9 bytes) or ``TransferChecked`` (op 12, >=10 bytes) layouts. Returns
    ``None`` when the instruction is not one of those.
    """
    if len(data) < 9:
        return None
    op = data[0]
    if op == 3 and len(data) == 9:
        amount = int.from_bytes(data[1:9], "little", signed=False)
        if len(account_indices) < 2:
            return None
        dest_idx = account_indices[1]
        if dest_idx >= len(accounts):
            return None
        return accounts[dest_idx], amount
    if op == 12 and len(data) >= 10:
        amount = int.from_bytes(data[1:9], "little", signed=False)
        if len(account_indices) < 3:
            return None
        dest_idx = account_indices[2]
        if dest_idx >= len(accounts):
            return None
        return accounts[dest_idx], amount
    return None


__all__ = ["SolanaAdapter"]
