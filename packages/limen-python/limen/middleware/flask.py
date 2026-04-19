"""Flask / WSGI middleware.

Usage::

    from flask import Flask
    from limen.flask import limen_middleware

    app = Flask(__name__)
    app.wsgi_app = limen_middleware(app.wsgi_app, wallets={...}, endpoints=[...])
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Iterable

from limen.proxy.core import CoreProxy, CoreProxyDeps
from limen.types import LimenRequest, LimenResponse

WSGIEnviron = dict[str, Any]
WSGIStartResponse = Callable[[str, list[tuple[str, str]]], Any]
WSGIApp = Callable[[WSGIEnviron, WSGIStartResponse], Iterable[bytes]]


def limen_middleware(app: WSGIApp, **deps: Any) -> WSGIApp:
    """Wrap a WSGI app with Limen's 402 handshake."""
    proxy = CoreProxy(CoreProxyDeps(**deps))

    def wrapped(environ: WSGIEnviron, start_response: WSGIStartResponse) -> Iterable[bytes]:
        raw_body = environ["wsgi.input"].read() if environ.get("CONTENT_LENGTH") else b""
        headers = _extract_headers(environ)
        pg_req = LimenRequest(
            method=environ["REQUEST_METHOD"],
            url=environ.get("RAW_URI", environ.get("PATH_INFO", "/")),
            path=environ.get("PATH_INFO", "/"),
            query=_parse_qs(environ.get("QUERY_STRING", "")),
            headers=headers,
            ip=environ.get("REMOTE_ADDR"),
            body=raw_body if raw_body else None,
        )

        result = asyncio.run(proxy.handle(pg_req))
        response = result.response

        if response.status == 402 or response.status >= 400:
            return _send_wsgi(response, start_response)

        # Pass control to the inner app, but preserve the body we already
        # consumed so Flask can read it too.
        import io

        environ["wsgi.input"] = io.BytesIO(raw_body)
        return app(environ, start_response)

    return wrapped


def _send_wsgi(response: LimenResponse, start_response: WSGIStartResponse) -> list[bytes]:
    status = f"{response.status} {_phrase(response.status)}"
    headers = list(response.headers.items())
    body = response.body or b""
    if isinstance(body, str):
        body = body.encode("utf-8")
    start_response(status, headers)
    return [body]


def _extract_headers(environ: WSGIEnviron) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in environ.items():
        if k.startswith("HTTP_"):
            out[k[5:].replace("_", "-").lower()] = v
    if "CONTENT_TYPE" in environ:
        out["content-type"] = environ["CONTENT_TYPE"]
    if "CONTENT_LENGTH" in environ:
        out["content-length"] = environ["CONTENT_LENGTH"]
    return out


def _parse_qs(qs: str) -> dict[str, str]:
    if not qs:
        return {}
    out: dict[str, str] = {}
    for pair in qs.split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            out[k] = v
        elif pair:
            out[pair] = ""
    return out


def _phrase(status: int) -> str:
    return {
        200: "OK",
        202: "Accepted",
        400: "Bad Request",
        402: "Payment Required",
        429: "Too Many Requests",
        451: "Unavailable For Legal Reasons",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
        504: "Gateway Timeout",
    }.get(status, "")


__all__ = ["limen_middleware"]
