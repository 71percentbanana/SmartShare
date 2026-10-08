import time
from dataclasses import dataclass, asdict
from typing import List, Optional

@dataclass
class NetworkMetrics:
    channel: str              # "wifi" or "bluetooth"
    throughput_mbps: float    # Mega bits per second
    rtt_ms: float             # Round trip time in milliseconds
    packet_loss_percent: float # Packet loss percentage 0-100%
    jitter_ms: float          # Jitter in milliseconds
    bytes_transferred: int    # Cumulative bytes transferred
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()

    def to_dict(self) -> dict:
        return asdict(self)


class MetricsCollector:
    """Collects and aggregates rolling network measurements."""
    def __init__(self, window_size: int = 10):
        self.window_size = window_size
        self.history: List[NetworkMetrics] = []

    def record(self, metrics: NetworkMetrics):
        self.history.append(metrics)
        if len(self.history) > self.window_size:
            self.history.pop(0)

    def get_latest(self) -> Optional[NetworkMetrics]:
        return self.history[-1] if self.history else None

    def get_averages(self) -> dict:
        if not self.history:
            return {
                "throughput_mbps": 0.0,
                "rtt_ms": 0.0,
                "packet_loss_percent": 0.0,
                "jitter_ms": 0.0
            }
        count = len(self.history)
        return {
            "throughput_mbps": round(sum(m.throughput_mbps for m in self.history) / count, 2),
            "rtt_ms": round(sum(m.rtt_ms for m in self.history) / count, 1),
            "packet_loss_percent": round(sum(m.packet_loss_percent for m in self.history) / count, 2),
            "jitter_ms": round(sum(m.jitter_ms for m in self.history) / count, 1)
        }
