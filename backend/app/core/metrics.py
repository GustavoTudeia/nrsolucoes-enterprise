from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Any


class MetricsRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._gauges: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._durations: dict[tuple[str, tuple[tuple[str, str], ...]], list[float]] = defaultdict(list)

    def _label_key(self, labels: dict[str, Any] | None = None) -> tuple[tuple[str, str], ...]:
        labels = labels or {}
        return tuple(sorted((str(k), str(v)) for k, v in labels.items()))

    def inc_counter(self, name: str, labels: dict[str, Any] | None = None, amount: float = 1.0) -> None:
        with self._lock:
            self._counters[(name, self._label_key(labels))] += amount

    def set_gauge(self, name: str, value: float, labels: dict[str, Any] | None = None) -> None:
        with self._lock:
            self._gauges[(name, self._label_key(labels))] = value

    def observe_duration(self, name: str, value_seconds: float, labels: dict[str, Any] | None = None) -> None:
        with self._lock:
            self._durations[(name, self._label_key(labels))].append(float(value_seconds))

    def render_prometheus(self) -> str:
        lines: list[str] = []
        with self._lock:
            for (name, labels), value in sorted(self._counters.items(), key=lambda x: x[0][0]):
                lines.append(self._format_metric(name, labels, value))
            for (name, labels), value in sorted(self._gauges.items(), key=lambda x: x[0][0]):
                lines.append(self._format_metric(name, labels, value))
            for (name, labels), values in sorted(self._durations.items(), key=lambda x: x[0][0]):
                count = len(values)
                total = sum(values)
                avg = total / count if count else 0.0
                base_name = f"{name}"
                lines.append(self._format_metric(f"{base_name}_count", labels, count))
                lines.append(self._format_metric(f"{base_name}_sum", labels, total))
                lines.append(self._format_metric(f"{base_name}_avg", labels, avg))
        return "\n".join(lines) + ("\n" if lines else "")

    @staticmethod
    def _format_metric(name: str, labels: tuple[tuple[str, str], ...], value: float) -> str:
        if labels:
            labels_text = ",".join(f'{k}="{v}"' for k, v in labels)
            return f"{name}{{{labels_text}}} {value}"
        return f"{name} {value}"


metrics_registry = MetricsRegistry()
metrics_registry.set_gauge("app_start_time_seconds", time.time())
