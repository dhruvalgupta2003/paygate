"""Starlette / FastAPI ASGI middleware.

All real logic lives in :class:`paygate.proxy.core.CoreProxy`; this file is
a thin adapter that converts an ASGI request into a ``PayGateRequest`` and
returns a proper ASGI response.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, MutableMapping

from paygate.proxy.core import CoreProxy, CoreProxyDeps
from paygate.types import PayGateRequest, PayGateResponse

ASGIScope = MutableMapping[str, Any]
ASGIReceive = Callable[[], Awaitable[MutableMapping[str, Any]]]
ASGISend = Callable[[MutableMapping[str, Any]], Awaitable[None]]


class PayGateMiddleware:
    """Starlette-compatible ASGI middleware."""

    def __init__(self, app: Any, **deps: Any) -> None:
        self.app = app
        self.proxy = CoreProxy(CoreProxyDeps(**deps))

    async def __call__(
        self,
        scope: ASGIScope,
        receive: ASGIReceive,
        send: ASGISend,
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        body_chunks: list[bytes] = []
        more = True
        while more:
            msg = await receive()
            if msg["type"] != "http.request":
                continue
            body_chunks.append(msg.get("body", b"") or b"")
            more = bool(msg.get("more_body", False))

        raw_body = b"".join(body_chunks)
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        query = _parse_query(scope.get("query_string", b""))

        pg_req = PayGateRequest(
            method=scope["method"],
            url=scope.get("raw_path", scope["path"].encode()).decode("latin-1"),
            path=scope["path"],
            query=query,
            headers=headers,
            ip=(scope.get("client") or (None, None))[0],
            body=raw_body if raw_body else None,
        )

        result = await self.proxy.handle(pg_req)
        response = result.response

        # When PayGate intercepts (402/429/etc.), return its response and
        # don't call the inner app.  Otherwise, forward to the inner app so
        # the user's route handler runs.
        if response.status == 402 or response.status >= 400:
            await _send_response(send, response)
            return

        async def inner_receive() -> MutableMapping[str, Any]:
            return {"type": "http.request", "body": raw_body, "more_body": False}

        await self.app(scope, inner_receive, send)


async def _send_response(send: ASGISend, response: PayGateResponse) -> None:
    body = response.body if response.body is not None else b""
    if isinstance(body, str):
        body = body.encode("utf-8")
    headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in response.headers.items()]
    await send(
        {
            "type": "http.response.start",
            "status": response.status,
            "headers": headers,
        }
    )
    await send({"type": "http.response.body", "body": body, "more_body": False})


def _parse_query(qs: bytes) -> dict[str, str]:
    if not qs:
        return {}
    out: dict[str, str] = {}
    for pair in qs.decode("latin-1").split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            out[k] = v
        elif pair:
            out[pair] = ""
    return out
