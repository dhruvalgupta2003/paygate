"""`paygate config` — lint / print / explain / migrate."""

from __future__ import annotations

import json

import typer

from paygate.config import load_config

config_app = typer.Typer(no_args_is_help=True)


@config_app.command("lint")
def lint(path: str = typer.Option("./paygate.config.yml", "-c", "--config")) -> None:
    load_config(path)
    typer.echo(f"{path}: OK")


@config_app.command("print")
def print_cmd(path: str = typer.Option("./paygate.config.yml", "-c", "--config")) -> None:
    cfg = load_config(path)
    typer.echo(json.dumps(cfg.model_dump(mode="json"), indent=2))


@config_app.command("explain")
def explain(path: str = typer.Option("./paygate.config.yml", "-c", "--config")) -> None:
    cfg = load_config(path)
    typer.echo(f"project:  {cfg.project.name if cfg.project else '(unnamed)'}")
    typer.echo(f"endpoints: {len(cfg.endpoints)}")
    for ep in cfg.endpoints:
        methods = ",".join(ep.method or []) if ep.method else "ANY"
        price = ep.price_usdc or (ep.price.base_usdc if ep.price else "?")
        typer.echo(f"  {methods}  {ep.path}  {price} USDC")
    typer.echo(f"chain default: {cfg.defaults.chain}")
    typer.echo(f"facilitator:   {cfg.defaults.facilitator}")


@config_app.command("migrate")
def migrate(path: str = typer.Option("./paygate.config.yml", "-c", "--config")) -> None:
    typer.echo("no migrations pending for version 1")
