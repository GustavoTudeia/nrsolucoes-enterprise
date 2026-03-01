from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

@dataclass(frozen=True)
class Entitlements:
    features: Dict[str, Any]
    limits: Dict[str, Any]

    def feature_enabled(self, key: str) -> bool:
        return bool(self.features.get(key))

    def limit_int(self, key: str, default: int | None = None) -> int | None:
        v = self.limits.get(key, default)
        if v is None:
            return None
        try:
            return int(v)
        except Exception:
            return default
