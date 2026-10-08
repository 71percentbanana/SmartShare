from dataclasses import dataclass, field
from typing import List, Optional
from .metrics import NetworkMetrics

@dataclass
class ThresholdConfig:
    min_wifi_throughput_mbps: float = 5.0   # Wi-Fi throughput threshold: below 5 Mbps is degraded
    max_wifi_rtt_ms: float = 200.0          # Wi-Fi RTT threshold: above 200 ms is degraded
    max_wifi_packet_loss_percent: float = 5.0 # Wi-Fi packet loss: above 5% is degraded

@dataclass
class ThresholdEvaluationResult:
    is_degraded: bool
    current_channel: str
    recommended_channel: str
    should_switch: bool
    reasons: List[str]
    summary_message: str

class ThresholdChecker:
    """
    Core Threshold Decision Engine.
    Evaluates network parameters against predefined threshold rules.
    NO AI or Machine Learning: purely deterministic rule-based decision logic.
    """

    def __init__(self, config: Optional[ThresholdConfig] = None):
        self.config = config or ThresholdConfig()

    def update_config(self, min_throughput: Optional[float] = None, max_rtt: Optional[float] = None, max_loss: Optional[float] = None):
        if min_throughput is not None:
            self.config.min_wifi_throughput_mbps = float(min_throughput)
        if max_rtt is not None:
            self.config.max_wifi_rtt_ms = float(max_rtt)
        if max_loss is not None:
            self.config.max_wifi_packet_loss_percent = float(max_loss)

    def evaluate(self, metrics: NetworkMetrics) -> ThresholdEvaluationResult:
        """
        Rule evaluation logic:
        If current channel is 'wifi':
            if throughput < min_throughput OR rtt > max_rtt OR packet_loss > max_loss:
                mark Wi-Fi as degraded -> trigger switch to 'bluetooth'
        If current channel is 'bluetooth':
            remains on bluetooth unless explicitly reset or wifi is verified restored.
        """
        reasons = []

        if metrics.channel.lower() == "wifi":
            if metrics.throughput_mbps < self.config.min_wifi_throughput_mbps:
                reasons.append(
                    f"Throughput ({metrics.throughput_mbps:.1f} Mbps) < {self.config.min_wifi_throughput_mbps:.1f} Mbps"
                )

            if metrics.rtt_ms > self.config.max_wifi_rtt_ms:
                reasons.append(
                    f"RTT ({metrics.rtt_ms:.0f} ms) > {self.config.max_wifi_rtt_ms:.0f} ms"
                )

            if metrics.packet_loss_percent > self.config.max_wifi_packet_loss_percent:
                reasons.append(
                    f"Packet Loss ({metrics.packet_loss_percent:.1f}%) > {self.config.max_wifi_packet_loss_percent:.1f}%"
                )

            is_degraded = len(reasons) > 0
            should_switch = is_degraded
            recommended_channel = "bluetooth" if is_degraded else "wifi"

            if is_degraded:
                summary_message = f"Wi-Fi degraded ({', '.join(reasons)}) – switching channel"
            else:
                summary_message = "Wi-Fi channel healthy – continuing transfer"

            return ThresholdEvaluationResult(
                is_degraded=is_degraded,
                current_channel="wifi",
                recommended_channel=recommended_channel,
                should_switch=should_switch,
                reasons=reasons,
                summary_message=summary_message
            )

        else:
            # Current channel is Bluetooth
            return ThresholdEvaluationResult(
                is_degraded=False,
                current_channel="bluetooth",
                recommended_channel="bluetooth",
                should_switch=False,
                reasons=[],
                summary_message="Bluetooth channel active – reliable low-bandwidth mode"
            )
