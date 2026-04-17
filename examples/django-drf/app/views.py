from __future__ import annotations

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
def ping_view(request: Request) -> Response:
    return Response({"ok": True})


@api_view(["GET"])
def premium_view(request: Request, slug: str) -> Response:
    return Response({"slug": slug, "tier": "premium"})
