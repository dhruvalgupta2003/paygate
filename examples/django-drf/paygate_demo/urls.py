from __future__ import annotations

from django.urls import path

from app.views import ping_view, premium_view

urlpatterns = [
    path("api/v1/ping", ping_view),
    path("api/v1/premium/<slug:slug>", premium_view),
]
