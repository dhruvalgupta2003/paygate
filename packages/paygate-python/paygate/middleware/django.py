"""Django middleware.

Add to ``MIDDLEWARE`` and configure via ``settings.PAYGATE``::

    MIDDLEWARE = [
        "paygate.django.PayGateMiddleware",
        # ...
    ]

    PAYGATE = {
        "wallets": {"base": os.environ["PAYGATE_WALLET_BASE"]},
        "endpoints": [{"path": "/api/v1/*", "price_usdc": "0.001"}],
        "redis_url": os.environ.get("REDIS_URL"),
    }
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

try:
    from django.conf import settings
    from django.http import HttpRequest, HttpResponse
except ImportError as e:
    raise ImportError(
        "paygate.django requires Django. Install it with `pip install paygate[django]`."
    ) from e

from paygate.proxy.core import CoreProxy, CoreProxyDeps
from paygate.types import PayGateRequest


class PayGateMiddleware:
    """Per-request Django middleware.

    Reads configuration from ``settings.PAYGATE`` at import time.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        deps_kwargs: dict[str, Any] = getattr(settings, "PAYGATE", {})
        self.proxy = CoreProxy(CoreProxyDeps(**deps_kwargs))

    def __call__(self, request: HttpRequest) -> HttpResponse:
        pg_req = PayGateRequest(
            method=request.method or "GET",
            url=request.get_full_path(),
            path=request.path,
            query={k: v for k, v in request.GET.items()},
            headers={k.lower(): v for k, v in request.headers.items()},
            ip=request.META.get("REMOTE_ADDR"),
            body=request.body if request.body else None,
        )
        result = asyncio.run(self.proxy.handle(pg_req))
        response = result.response

        if response.status == 402 or response.status >= 400:
            body = response.body or b""
            if isinstance(body, str):
                body = body.encode("utf-8")
            http_response = HttpResponse(body, status=response.status)
            for k, v in response.headers.items():
                http_response[k] = v
            return http_response

        return self.get_response(request)


__all__ = ["PayGateMiddleware"]
