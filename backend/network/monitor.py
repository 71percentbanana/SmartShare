import time
import random
from typing import Optional, Dict
from .metrics import NetworkMetrics, MetricsCollector
from .threshold_checker import ThresholdChecker, ThresholdConfig, ThresholdEvaluationResult

class NetworkMonitor:
    """
    Monitors ongoing transfer network performance and evaluates channel conditions.
    Supports both real metric sampling (bytes/time, ping-pong RTT) and controlled simulation profiles.
    """

    def __init__(self, threshold_checker: Optional[ThresholdChecker] = None):
        self.collector = MetricsCollector(window_size=15)
        self.checker = threshold_checker or ThresholdChecker()
        self.simulation_mode: str = "normal_wifi"  # "normal_wifi", "degraded_wifi", "bluetooth", "manual"
        
        # Manual simulated parameters when in simulation mode
        self.manual_override: Dict[str, float] = {
            "throughput_mbps": 42.0,
            "rtt_ms": 24.0,
            "packet_loss_percent": 0.2
        }

        # Measurement tracking
        self.last_bytes: int = 0
        self.last_sample_time: float = time.time()
        self.current_channel: str = "wifi"

    def set_channel(self, channel: str):
        self.current_channel = channel.lower()

    def set_simulation_profile(self, profile: str, **kwargs):
        """
        Available profiles:
        - 'normal_wifi': 40-50 Mbps, 15-30ms RTT, 0.1-0.5% loss
        - 'degraded_wifi': 2-4 Mbps (<5), 220-350ms RTT (>200), 7-15% loss (>5%)
        - 'bluetooth': 1.5-2.2 Mbps, 45-65ms RTT, 0.2-1.0% loss
        - 'manual': user-provided throughput, rtt, loss values
        """
        if profile == "wifi":
            profile = "normal_wifi"
        self.simulation_mode = profile
        if profile == "manual":
            for k in ["throughput_mbps", "rtt_ms", "packet_loss_percent"]:
                if k in kwargs and kwargs[k] is not None:
                    self.manual_override[k] = float(kwargs[k])

    def sample_metrics(self, current_bytes_transferred: int = 0, measured_rtt: Optional[float] = None) -> NetworkMetrics:
        """
        Generates or samples active metrics based on profile and traffic.
        """
        now = time.time()
        time_delta = max(0.001, now - self.last_sample_time)
        bytes_delta = max(0, current_bytes_transferred - self.last_bytes)

        if self.simulation_mode == "normal_wifi":
            throughput = round(random.uniform(38.0, 52.0), 2)
            rtt = round(random.uniform(16.0, 32.0), 1)
            loss = round(random.uniform(0.1, 0.8), 2)
            jitter = round(random.uniform(1.0, 4.0), 1)

        elif self.simulation_mode == "degraded_wifi":
            # Breaches thresholds (<5 Mbps, >200ms RTT, >5% loss)
            throughput = round(random.uniform(1.8, 3.8), 2)
            rtt = round(random.uniform(215.0, 340.0), 1)
            loss = round(random.uniform(6.5, 14.0), 2)
            jitter = round(random.uniform(18.0, 45.0), 1)

        elif self.simulation_mode == "bluetooth":
            # Bluetooth 5.0 High Speed profile: steady ~1.8 Mbps, ~50ms RTT, ~0.5% loss
            throughput = round(random.uniform(1.4, 2.1), 2)
            rtt = round(random.uniform(42.0, 68.0), 1)
            loss = round(random.uniform(0.2, 1.2), 2)
            jitter = round(random.uniform(4.0, 9.0), 1)

        elif self.simulation_mode == "manual":
            throughput = self.manual_override.get("throughput_mbps", 40.0)
            rtt = self.manual_override.get("rtt_ms", 25.0)
            loss = self.manual_override.get("packet_loss_percent", 0.5)
            jitter = 3.0

        else:
            # Measure actual physical throughput if possible
            throughput = round((bytes_delta * 8) / (time_delta * 1_000_000), 2)
            rtt = measured_rtt if measured_rtt is not None else 25.0
            loss = 0.0
            jitter = 2.0

        self.last_bytes = current_bytes_transferred
        self.last_sample_time = now

        metrics = NetworkMetrics(
            channel=self.current_channel,
            throughput_mbps=throughput,
            rtt_ms=rtt,
            packet_loss_percent=loss,
            jitter_ms=jitter,
            bytes_transferred=current_bytes_transferred,
            timestamp=now
        )
        self.collector.record(metrics)
        return metrics

    def evaluate_current(self, metrics: Optional[NetworkMetrics] = None) -> ThresholdEvaluationResult:
        if metrics is None:
            metrics = self.collector.get_latest() or self.sample_metrics()
        return self.checker.evaluate(metrics)
