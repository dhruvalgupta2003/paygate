"""`paygate start` — run the proxy against an upstream API."""

from __future__ import annotations

import os

import typer
import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware

from paygate.config import load_config
from paygate.middleware.starlette import PayGateMiddleware
from paygate.utils.logger import get_logger

start_app = typer.Typer(no_args_is_help=False, invoke_without_command=True)


@start_app.callback(invoke_without_command=True)
def run(
    config: str = typer.Option("./paygate.config.yml", "-c", "--config"),
    upstream: str = typer.Option(
        None,
        "-u",
        "--upstream",
        help="upstream URL to proxy (default: $PAYGATE_UPSTREAM_URL)",
    ),
    host: str = typer.Option("0.0.0.0", "-H", "--host"),
    port: int = typer.Option(4021, "-p", "--port"),
    dry_run: bool = typer.Option(False, "--dry-run", help="validate config and exit"),
    dev: bool = typer.Option(False, "--dev", help="skip on-chain verify"),
) -> None:
    """Run the PayGate proxy."""
    log = get_logger(__name__)
    cfg = load_config(config)
    log.info("config loaded", path=config, endpoints=len(cfg.endpoints))

    if dry_run:
        typer.echo(f"{config}: OK")
        return

    target = upstream or os.environ.get("PAYGATE_UPSTREAM_URL")
    if not target:
        raise typer.BadParameter("upstream URL is required (--upstream or PAYGATE_UPSTREAM_URL)")

    app = Starlette(
        middleware=[
            Middleware(
                PayGateMiddleware,
                config=cfg,
                upstream=target,
                redis_url=os.environ.get("PAYGATE_REDIS_URL"),
                dev_mode=dev,
            )
        ]
    )

    uvicorn.run(app, host=host, port=port, log_level="info")
