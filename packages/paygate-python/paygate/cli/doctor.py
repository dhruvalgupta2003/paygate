"""`paygate doctor` — check config + connectivity."""

from __future__ import annotations

import asyncio
import os

import httpx
import typer

from paygate.config import load_config
from paygate.constants import DEFAULT_FACILITATOR_URL

doctor_app = typer.Typer(no_args_is_help=False, invoke_without_command=True)


@doctor_app.callback(invoke_without_command=True)
def run(
    config: str = typer.Option("./paygate.config.yml", "-c", "--config"),
) -> None:
    results: list[tuple[str, bool, str]] = []
    try:
        cfg = load_config(config)
        results.append(("config loaded", True, ""))
    except Exception as e:
        results.append(("config loaded", False, str(e)))
        cfg = None  # type: ignore[assignment]

    if cfg is not None:
        if cfg.wallets.base:
            ok, detail = asyncio.run(_rpc_ok(os.environ.get("PAYGATE_BASE_RPC_URL", "https://mainnet.base.org"), "evm"))
            results.append(("base rpc", ok, detail))
        if cfg.wallets.solana:
            ok, detail = asyncio.run(_rpc_ok(os.environ.get("PAYGATE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"), "solana"))
            results.append(("solana rpc", ok, detail))

        if cfg.defaults.facilitator == "coinbase":
            ok, detail = asyncio.run(
                _facilitator_ok(cfg.advanced.facilitator_url or DEFAULT_FACILITATOR_URL)
            )
            results.append(("facilitator", ok, detail))

    pad = max(len(r[0]) for r in results) if results else 0
    ok_all = True
    for name, ok, detail in results:
        mark = "[ OK ]" if ok else "[FAIL]"
        typer.echo(f"{mark}  {name.ljust(pad)}  {detail}".rstrip())
        if not ok:
            ok_all = False
    raise typer.Exit(code=0 if ok_all else 1)


async def _rpc_ok(url: str, kind: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            if kind == "evm":
                r = await client.post(url, json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber"})
            else:
                r = await client.post(url, json={"jsonrpc": "2.0", "id": 1, "method": "getSlot"})
            if r.status_code >= 400:
                return False, f"HTTP {r.status_code}"
            return True, ""
    except Exception as e:
        return False, str(e)


async def _facilitator_ok(url: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(url.rstrip("/") + "/health")
            return r.status_code < 500, ""
    except Exception as e:
        return False, str(e)
