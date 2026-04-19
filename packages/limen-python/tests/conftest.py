from __future__ import annotations

import pytest

pytest_plugins: list[str] = []


@pytest.fixture(autouse=True, scope="session")
def _asyncio_mode() -> None:
    """Force strict asyncio mode for pytest-asyncio."""
    return None
