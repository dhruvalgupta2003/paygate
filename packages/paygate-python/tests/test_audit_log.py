from __future__ import annotations

import tempfile
from pathlib import Path

from paygate.analytics.audit_log import AuditLogger
from paygate.utils.logger import get_logger


def test_hash_chain_verifies() -> None:
    with tempfile.TemporaryDirectory() as d:
        al = AuditLogger(directory=Path(d), logger=get_logger("test"))
        al.append(actor="test", action="boot", target="proxy")
        al.append(actor="test", action="set_wallet", target="base")
        al.append(actor="test", action="reload", target="config")
        al.flush()

        files = list(Path(d).glob("*.ndjson"))
        assert len(files) == 1
        result = AuditLogger.verify(files[0])
        assert result.ok
        assert result.rows == 3
