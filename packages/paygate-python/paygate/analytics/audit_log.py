"""Append-only hash-chained audit log.

Each record includes the SHA-256 of the previous row, giving tamper-evidence
at replay time. Mirrors ``packages/paygate-node/src/analytics/audit-log.ts``.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..utils.digest import canonical_json
from ..utils.logger import get_logger


@dataclass(frozen=True)
class AuditRecord:
    id: str
    at: str
    actor: str
    action: str
    target: str
    meta: dict[str, Any]
    prev: str
    hash: str


@dataclass
class _PendingRow:
    id: str
    at: str
    actor: str
    action: str
    target: str
    meta: dict[str, Any] = field(default_factory=dict)
    prev: str = "0" * 64


class AuditLogger:
    """Writes ``<YYYY-MM-DD>.ndjson`` files into ``dir``."""

    def __init__(self, *, dir: str | Path, logger: Any | None = None) -> None:
        self._dir = Path(dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        today = datetime.now(timezone.utc).date().isoformat()
        self._file_path = self._dir / f"{today}.ndjson"
        self._prev_hash = "0" * 64
        self._logger = logger or get_logger("paygate.audit")
        self._load_prev_hash()

    def _load_prev_hash(self) -> None:
        if not self._file_path.exists():
            return
        try:
            with self._file_path.open("r", encoding="utf-8") as fh:
                last_hash: str | None = None
                for line in fh:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        row = json.loads(stripped)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(row, dict) and isinstance(row.get("hash"), str):
                        last_hash = row["hash"]
                if last_hash is not None:
                    self._prev_hash = last_hash
        except OSError as err:
            self._logger.warn(
                "could not recover audit prev hash; starting fresh",
                err=str(err),
            )

    def append(
        self,
        *,
        actor: str,
        action: str,
        target: str,
        meta: dict[str, Any] | None = None,
    ) -> AuditRecord:
        base = _PendingRow(
            id=str(uuid.uuid4()),
            at=datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            actor=actor,
            action=action,
            target=target,
            meta=dict(meta) if meta is not None else {},
            prev=self._prev_hash,
        )
        payload = asdict(base)
        hasher = hashlib.sha256()
        hasher.update(self._prev_hash.encode("utf-8"))
        hasher.update(b"|")
        hasher.update(canonical_json(payload).encode("utf-8"))
        row_hash = hasher.hexdigest()
        record = AuditRecord(**payload, hash=row_hash)
        try:
            with self._file_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(asdict(record)) + "\n")
        except OSError as err:
            self._logger.error("audit write failed", err=str(err))
            raise
        self._prev_hash = row_hash
        return record

    @staticmethod
    def verify(file_path: str | Path) -> dict[str, Any]:
        """Re-derive the hash chain from disk. Returns a dict with either
        ``{"ok": True, "rows": int}`` or ``{"ok": False, "brokenAt": int}``.
        """
        path = Path(file_path)
        prev = "0" * 64
        rows = 0
        with path.open("r", encoding="utf-8") as fh:
            for idx, line in enumerate(fh):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    row = json.loads(stripped)
                except json.JSONDecodeError:
                    return {"ok": False, "brokenAt": idx}
                base_payload = {
                    "id": row.get("id"),
                    "at": row.get("at"),
                    "actor": row.get("actor"),
                    "action": row.get("action"),
                    "target": row.get("target"),
                    "meta": row.get("meta", {}),
                    "prev": row.get("prev"),
                }
                hasher = hashlib.sha256()
                hasher.update(prev.encode("utf-8"))
                hasher.update(b"|")
                hasher.update(canonical_json(base_payload).encode("utf-8"))
                expected = hasher.hexdigest()
                if expected != row.get("hash") or row.get("prev") != prev:
                    return {"ok": False, "brokenAt": idx}
                prev = row["hash"]
                rows += 1
        return {"ok": True, "rows": rows}


__all__ = ["AuditLogger", "AuditRecord"]
