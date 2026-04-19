"""`limen keys` — generate webhook secrets + admin keypairs."""

from __future__ import annotations

import base64
import secrets

import typer

keys_app = typer.Typer(no_args_is_help=True)


@keys_app.command("generate-webhook-secret")
def generate_webhook_secret() -> None:
    typer.echo(base64.b64encode(secrets.token_bytes(48)).decode())


@keys_app.command("generate-admin-keypair")
def generate_admin_keypair() -> None:
    from nacl.signing import SigningKey

    sk = SigningKey.generate()
    vk = sk.verify_key
    typer.echo(f"public:  {base64.b64encode(bytes(vk)).decode()}")
    typer.echo(f"private: {base64.b64encode(bytes(sk)).decode()}")


@keys_app.command("generate-evm-key")
def generate_evm_key() -> None:
    """Generate a fresh EVM (Base / Base Sepolia) signing key."""
    from eth_account import Account  # local import: heavy dep

    acct = Account.create()
    typer.echo(f"address:     {acct.address}")
    typer.echo(f"private_key: 0x{acct.key.hex()}")
    typer.echo("")
    typer.echo("# Treat the private key like a password.")
    typer.echo("# For testnet only: fund this address from")
    typer.echo("#   https://faucet.quicknode.com/base/sepolia   (gas)")
    typer.echo("#   https://faucet.circle.com/                  (USDC)")
