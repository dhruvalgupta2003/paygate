"""BaseAdapter — USDC-on-Base (and Base Sepolia) payment verification.

Uses ``web3.py`` for the read-only RPC calls and ``eth_account`` to recover
the EIP-712 typed-data signature for ``TransferWithAuthorization`` (EIP-3009).

Mirrors ``packages/paygate-node/src/chains/base.ts`` step for step.
"""

from __future__ import annotations

from typing import Any, Literal

from eth_account.messages import encode_typed_data
from eth_account import Account
from web3 import Web3

from ..constants import EIP712_DOMAIN, USDC_ADDRESSES, ChainIdLiteral
from ..errors import ErrorCode, PayGateError
from ..proxy.handshake import decode_payment_header, is_evm_auth
from ..types import (
    EvmPaymentAuth,
    PaymentRequirements,
    PriceSpec,
    RequirementOpts,
    SettlementProof,
    VerifyFail,
    VerifyOk,
    VerifyResult,
)
from ..utils.digest import digest_requirements
from ..utils.nonce import epoch_seconds, generate_nonce


EIP712_TYPES: dict[str, list[dict[str, str]]] = {
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ],
}

# Minimal USDC ABI — just the fields we need to read.
USDC_ABI: list[dict[str, Any]] = [
    {
        "name": "authorizationState",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "authorizer", "type": "address"},
            {"name": "nonce", "type": "bytes32"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
]


BaseChainLiteral = Literal["base", "base-sepolia"]


class BaseAdapter:
    """Chain adapter for Base / Base Sepolia."""

    id: ChainIdLiteral

    def __init__(
        self,
        *,
        chain_id: BaseChainLiteral,
        rpc_url: str,
        receiving_wallet: str,
        confirmations: int = 2,
        facilitator_url: str | None = None,
    ) -> None:
        if chain_id not in ("base", "base-sepolia"):
            raise PayGateError(
                code=ErrorCode.BAD_CONFIG,
                detail=f"unsupported base chain {chain_id!r}",
            )
        self.id = chain_id
        self._rpc_url = rpc_url
        self._web3 = Web3(Web3.HTTPProvider(rpc_url))
        self._usdc_address = Web3.to_checksum_address(USDC_ADDRESSES[chain_id])
        self._receiver = Web3.to_checksum_address(receiving_wallet)
        self._confirmations = confirmations
        self._facilitator_url = facilitator_url

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
        valid_until = epoch_seconds() + ttl

        base_payload: dict[str, Any] = {
            "scheme": "exact",
            "chain": self.id,
            "asset": self._usdc_address,
            "amount": spec.amount,
            "payTo": self._receiver,
            "validUntil": valid_until,
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
        digest = digest_requirements(almost)
        final: dict[str, Any] = {**almost, "digest": digest}
        return PaymentRequirements.model_validate(final)

    async def verify_payment(
        self, req: PaymentRequirements, x_payment: str
    ) -> VerifyResult:
        try:
            auth = decode_payment_header(x_payment)
        except PayGateError as err:
            return VerifyFail(code=err.code.value, detail=err.detail, retryable=err.retryable)

        if not is_evm_auth(auth):
            return VerifyFail(
                code=ErrorCode.CHAIN_MISMATCH.value,
                detail="non-evm auth for evm chain",
                retryable=False,
            )
        assert isinstance(auth, EvmPaymentAuth)

        if auth.chain != req.chain:
            return VerifyFail(
                code=ErrorCode.CHAIN_MISMATCH.value,
                detail=f"req={req.chain} auth={auth.chain}",
                retryable=False,
            )
        if Web3.to_checksum_address(auth.asset) != self._usdc_address:
            return VerifyFail(
                code=ErrorCode.ASSET_MISMATCH.value,
                detail="asset != canonical USDC",
                retryable=False,
            )
        if Web3.to_checksum_address(auth.payTo) != self._receiver:
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
        now_sec = epoch_seconds()
        if now_sec > req.validUntil:
            return VerifyFail(
                code=ErrorCode.EXPIRED_AUTHORIZATION.value,
                detail="requirements expired",
                retryable=True,
            )
        if not (auth.authorization.validAfter <= now_sec <= auth.authorization.validBefore):
            return VerifyFail(
                code=ErrorCode.EXPIRED_AUTHORIZATION.value,
                detail="EIP-3009 authorization is not currently valid",
                retryable=True,
            )

        required_value = int(req.amount)
        provided_value = int(auth.authorization.value)
        if provided_value < required_value:
            return VerifyFail(
                code=ErrorCode.AMOUNT_INSUFFICIENT.value,
                detail=f"required {required_value}, got {provided_value}",
                retryable=True,
            )
        if Web3.to_checksum_address(auth.authorization.to) != self._receiver:
            return VerifyFail(
                code=ErrorCode.RECIPIENT_MISMATCH.value,
                detail="authorization.to != receiver",
                retryable=False,
            )

        # Signature verification (I6).
        recovered = self._recover_typed_data(auth)
        if recovered is None or recovered.lower() != auth.authorization.from_.lower():
            return VerifyFail(
                code=ErrorCode.INVALID_SIGNATURE.value,
                detail="signature does not recover to from",
                retryable=False,
            )

        # Nonce state check (prevents double-submission of the on-chain auth).
        try:
            used = self._read_authorization_state(
                authorizer=auth.authorization.from_, nonce_hex=auth.authorization.nonce
            )
        except Exception as err:  # noqa: BLE001 — map to stable error
            return VerifyFail(
                code=ErrorCode.RPC_UNAVAILABLE.value,
                detail=f"rpc call failed: {err}",
                retryable=True,
            )
        if used:
            return VerifyFail(
                code=ErrorCode.NONCE_REUSED.value,
                detail="authorization nonce already consumed on-chain",
                retryable=False,
            )

        return VerifyOk(
            settledAmount=str(provided_value),
            payer=Web3.to_checksum_address(auth.authorization.from_),
            recipient=self._receiver,
            chain=self.id,
            asset=self._usdc_address,
            observedAt=now_sec,
        )

    async def confirm_payment(self, proof: SettlementProof) -> VerifyResult:
        try:
            receipt = self._web3.eth.get_transaction_receipt(proof.txHash)
        except Exception as err:  # noqa: BLE001
            return VerifyFail(
                code=ErrorCode.RPC_UNAVAILABLE.value,
                detail=f"rpc error: {err}",
                retryable=True,
            )
        if getattr(receipt, "status", 0) != 1:
            return VerifyFail(
                code=ErrorCode.SETTLEMENT_FAILED.value,
                detail="tx reverted",
                retryable=True,
            )
        to_addr = Web3.to_checksum_address(getattr(receipt, "to", "0x0") or "0x0")
        if to_addr != self._usdc_address:
            return VerifyFail(
                code=ErrorCode.ASSET_MISMATCH.value,
                detail="tx.to != USDC",
                retryable=False,
            )
        latest = self._web3.eth.block_number
        confirmations = int(latest - receipt["blockNumber"])  # type: ignore[index]
        if confirmations < self._confirmations:
            return VerifyFail(
                code=ErrorCode.SETTLEMENT_PENDING.value,
                detail=(
                    f"need {self._confirmations} confirmations, "
                    f"have {confirmations}"
                ),
                retryable=True,
            )
        return VerifyOk(
            settledAmount=proof.amount,
            payer=proof.payer,
            recipient=proof.recipient,
            chain=self.id,
            asset=self._usdc_address,
            observedAt=proof.observedAt,
        )

    async def submit_transfer_with_authorization(
        self, auth: EvmPaymentAuth, signer_wallet_client: Any
    ) -> str:
        """Direct-submission path. Requires a configured signer; usually the
        facilitator mode is the recommended production path."""
        raise PayGateError(
            code=ErrorCode.BAD_CONFIG,
            detail="direct-submission requires a configured signer; use facilitator mode",
            extra={"auth_nonce": auth.nonce, "signer": type(signer_wallet_client).__name__},
        )

    # --------------------------------------------------------------- helpers

    def _recover_typed_data(self, auth: EvmPaymentAuth) -> str | None:
        domain = EIP712_DOMAIN[self.id]
        structured: dict[str, Any] = {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                **EIP712_TYPES,
            },
            "primaryType": "TransferWithAuthorization",
            "domain": domain,
            "message": {
                "from": Web3.to_checksum_address(auth.authorization.from_),
                "to": Web3.to_checksum_address(auth.authorization.to),
                "value": int(auth.authorization.value),
                "validAfter": int(auth.authorization.validAfter),
                "validBefore": int(auth.authorization.validBefore),
                "nonce": bytes.fromhex(auth.authorization.nonce[2:]),
            },
        }
        try:
            encoded = encode_typed_data(full_message=structured)
            signature = _build_signature(auth)
            recovered = Account.recover_message(encoded, signature=signature)
        except Exception:  # noqa: BLE001 — treat as invalid signature
            return None
        return str(recovered)

    def _read_authorization_state(self, *, authorizer: str, nonce_hex: str) -> bool:
        contract = self._web3.eth.contract(address=self._usdc_address, abi=USDC_ABI)
        nonce_bytes = bytes.fromhex(nonce_hex[2:])
        if len(nonce_bytes) != 32:
            raise ValueError("authorization nonce must be bytes32")
        checksummed = Web3.to_checksum_address(authorizer)
        return bool(
            contract.functions.authorizationState(checksummed, nonce_bytes).call()
        )


def _build_signature(auth: EvmPaymentAuth) -> bytes:
    """Convert v/r/s to a flat 65-byte signature."""
    v = auth.authorization.v
    v_byte = v if v in (27, 28) else v + 27
    r_hex = auth.authorization.r[2:].rjust(64, "0")
    s_hex = auth.authorization.s[2:].rjust(64, "0")
    return bytes.fromhex(r_hex + s_hex + f"{v_byte:02x}")


__all__ = ["BaseAdapter"]
