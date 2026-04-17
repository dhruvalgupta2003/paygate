"""Prometheus metrics mirroring the TS ``analytics/metrics.ts`` surface.

Metric names and labels are intentionally identical to the TypeScript SDK so
that dashboards and alert rules work without modification.
"""

from __future__ import annotations

from dataclasses import dataclass

from prometheus_client import CollectorRegistry, Counter, Histogram, generate_latest


registry = CollectorRegistry()


@dataclass(frozen=True)
class _Metrics:
    requests_total: Counter
    http_duration_seconds: Histogram
    verify_duration_seconds: Histogram
    settle_duration_seconds: Histogram
    verify_failures_total: Counter
    replay_rejects_total: Counter
    rate_limit_drops_total: Counter
    rpc_failures_total: Counter
    cache_hits_total: Counter
    cache_misses_total: Counter
    upstream_duration_seconds: Histogram
    upstream_failures_total: Counter
    audit_write_failures_total: Counter
    webhook_delivery_seconds: Histogram
    webhook_delivery_failures_total: Counter


metrics = _Metrics(
    requests_total=Counter(
        "paygate_requests_total",
        "Total HTTP requests handled, by outcome.",
        labelnames=("endpoint", "outcome"),
        registry=registry,
    ),
    http_duration_seconds=Histogram(
        "paygate_http_duration_seconds",
        "End-to-end request latency.",
        labelnames=("route", "status"),
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
        registry=registry,
    ),
    verify_duration_seconds=Histogram(
        "paygate_verify_duration_seconds",
        "Chain verify latency.",
        labelnames=("chain", "mode"),
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5),
        registry=registry,
    ),
    settle_duration_seconds=Histogram(
        "paygate_settle_duration_seconds",
        "Settle latency.",
        labelnames=("chain", "mode"),
        buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
        registry=registry,
    ),
    verify_failures_total=Counter(
        "paygate_verify_failures_total",
        "Verification failures, by reason.",
        labelnames=("chain", "reason"),
        registry=registry,
    ),
    replay_rejects_total=Counter(
        "paygate_replay_rejects_total",
        "Replay attempts.",
        registry=registry,
    ),
    rate_limit_drops_total=Counter(
        "paygate_rate_limit_drops_total",
        "Rate-limit drops.",
        labelnames=("scope",),
        registry=registry,
    ),
    rpc_failures_total=Counter(
        "paygate_rpc_failures_total",
        "RPC errors.",
        labelnames=("chain", "provider", "status"),
        registry=registry,
    ),
    cache_hits_total=Counter(
        "paygate_cache_hits_total",
        "Cache hits.",
        labelnames=("kind",),
        registry=registry,
    ),
    cache_misses_total=Counter(
        "paygate_cache_misses_total",
        "Cache misses.",
        labelnames=("kind",),
        registry=registry,
    ),
    upstream_duration_seconds=Histogram(
        "paygate_upstream_duration_seconds",
        "Upstream latency.",
        labelnames=("endpoint", "status"),
        buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
        registry=registry,
    ),
    upstream_failures_total=Counter(
        "paygate_upstream_failures_total",
        "Upstream errors.",
        labelnames=("endpoint", "status"),
        registry=registry,
    ),
    audit_write_failures_total=Counter(
        "paygate_audit_write_failures_total",
        "Audit write failures.",
        registry=registry,
    ),
    webhook_delivery_seconds=Histogram(
        "paygate_webhook_delivery_seconds",
        "Webhook delivery latency.",
        labelnames=("event",),
        buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
        registry=registry,
    ),
    webhook_delivery_failures_total=Counter(
        "paygate_webhook_delivery_failures_total",
        "Webhook failures.",
        labelnames=("event", "status"),
        registry=registry,
    ),
)


def collect_metrics_text() -> str:
    """Render the Prometheus exposition format for the ``/metrics`` endpoint."""
    return generate_latest(registry).decode("utf-8")


__all__ = ["collect_metrics_text", "metrics", "registry"]
