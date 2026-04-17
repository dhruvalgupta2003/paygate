"""`paygate verify` — verify an on-chain transaction."""

from __future__ import annotations

import os

import typer

from paygate.utils.amount import usdc_to_micros

verify_app = typer.Typer(no_args_is_help=False, invoke_without_command=True)


@verify_app.callback(invoke_without_command=True)
def run(
    chain: str = typer.Option(..., "--chain"),
    tx: str = typer.Option(..., "--tx"),
    expected_amount: str | None = typer.Option(None, "--expected-amount"),
    expected_to: str | None = typer.Option(None, "--expected-to"),
) -> None:
    if chain in ("base", "base-sepolia"):
        _verify_evm(chain, tx, expected_amount, expected_to)
    elif chain in ("solana", "solana-devnet"):
        _verify_solana(chain, tx, expected_amount, expected_to)
    else:
        typer.echo(f"unknown chain: {chain}", err=True)
        raise typer.Exit(code=1)


def _verify_evm(chain: str, tx: str, expected_amount: str | None, expected_to: str | None) -> None:
    from web3 import HTTPProvider, Web3

    rpc = (
        os.environ.get("PAYGATE_BASE_RPC_URL", "https://mainnet.base.org")
        if chain == "base"
        else os.environ.get("PAYGATE_BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org")
    )
    w3 = Web3(HTTPProvider(rpc))
    receipt = w3.eth.get_transaction_receipt(tx)  # type: ignore[arg-type]
    typer.echo(f"status: {receipt.status}")
    typer.echo(f"block:  {receipt.blockNumber}")
    if expected_amount:
        typer.echo(f"expected amount: {expected_amount} ({usdc_to_micros(expected_amount)} micros)")
    if expected_to:
        typer.echo(f"expected to:     {expected_to}")


def _verify_solana(
    chain: str,
    tx: str,
    expected_amount: str | None,
    expected_to: str | None,
) -> None:
    from solana.rpc.api import Client

    rpc = (
        os.environ.get("PAYGATE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        if chain == "solana"
        else os.environ.get("PAYGATE_SOLANA_DEVNET_RPC_URL", "https://api.devnet.solana.com")
    )
    client = Client(rpc)
    res = client.get_transaction(tx, max_supported_transaction_version=0)  # type: ignore[arg-type]
    if not res.value:
        typer.echo("transaction not found yet")
        raise typer.Exit(code=1)
    typer.echo(f"slot: {res.value.slot}")
    if expected_amount:
        typer.echo(f"expected amount: {expected_amount} ({usdc_to_micros(expected_amount)} micros)")
    if expected_to:
        typer.echo(f"expected to:     {expected_to}")
