"""`paygate audit` — verify / tail the hash-chained audit log."""

from __future__ import annotations

import pathlib

import typer

from paygate.analytics.audit_log import AuditLogger

audit_app = typer.Typer(no_args_is_help=True)


@audit_app.command("verify")
def verify(file: str = typer.Option(..., "--file")) -> None:
    result = AuditLogger.verify(pathlib.Path(file))
    if result.ok:
        typer.echo(f"OK — {result.rows} rows verified")
    else:
        typer.echo(f"BROKEN at row {result.broken_at}", err=True)
        raise typer.Exit(code=1)


@audit_app.command("tail")
def tail(
    file: str = typer.Option(..., "--file"),
    n: int = typer.Option(20, "-n", help="last N lines"),
) -> None:
    raw = pathlib.Path(file).read_text("utf-8").splitlines()
    for line in raw[-n:]:
        typer.echo(line)
