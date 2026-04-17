"""PayGate CLI entry point — ``paygate <subcommand>``."""

from __future__ import annotations

import typer

from paygate._version import __version__
from paygate.cli.audit import audit_app
from paygate.cli.config import config_app
from paygate.cli.doctor import doctor_app
from paygate.cli.keys import keys_app
from paygate.cli.start import start_app
from paygate.cli.verify import verify_app

app = typer.Typer(
    name="paygate",
    help="PayGate CLI — x402 paywall for AI agent traffic.",
    add_completion=False,
    rich_markup_mode=None,
    no_args_is_help=True,
)
app.add_typer(start_app, name="start")
app.add_typer(doctor_app, name="doctor")
app.add_typer(verify_app, name="verify")
app.add_typer(config_app, name="config")
app.add_typer(keys_app, name="keys")
app.add_typer(audit_app, name="audit")


@app.callback()
def _cb(
    version: bool = typer.Option(False, "--version", "-V", is_eager=True, help="print version and exit"),
) -> None:
    if version:
        typer.echo(__version__)
        raise typer.Exit()


def main() -> None:
    app()


__all__ = ["app", "main"]
