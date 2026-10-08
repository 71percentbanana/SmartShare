from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class ExperimentScenario:
    id: str
    name: str
    description: str
    channel_mode: str         # "wifi_only", "bt_only", "degraded_wifi", "packet_loss", "interrupted", "smartshare_adaptive"
    file_size_mb: float       # file size for test
    initial_throughput_mbps: float
    initial_rtt_ms: float
    initial_loss_percent: float
    degrade_at_percent: Optional[float] = None
    degraded_throughput_mbps: Optional[float] = None
    degraded_rtt_ms: Optional[float] = None
    degraded_loss_percent: Optional[float] = None
    adaptive_handover: bool = False
    resumption_enabled: bool = True
    selective_repeat: bool = True

SCENARIOS: Dict[str, ExperimentScenario] = {
    "normal_wifi": ExperimentScenario(
        id="normal_wifi",
        name="Normal Wi-Fi Transfer",
        description="High-speed transfer over healthy 5GHz Wi-Fi (45 Mbps, 20ms RTT, minimal loss).",
        channel_mode="wifi_only",
        file_size_mb=10.0,
        initial_throughput_mbps=45.0,
        initial_rtt_ms=20.0,
        initial_loss_percent=0.2,
        adaptive_handover=False,
        resumption_enabled=True,
        selective_repeat=True
    ),
    "normal_bt": ExperimentScenario(
        id="normal_bt",
        name="Normal Bluetooth Transfer",
        description="Direct peer transfer over Bluetooth 5.0 High Speed (1.8 Mbps, 50ms RTT, stable).",
        channel_mode="bt_only",
        file_size_mb=10.0,
        initial_throughput_mbps=1.8,
        initial_rtt_ms=50.0,
        initial_loss_percent=0.4,
        adaptive_handover=False,
        resumption_enabled=True,
        selective_repeat=True
    ),
    "degraded_wifi": ExperimentScenario(
        id="degraded_wifi",
        name="Degraded Wi-Fi (No Adaptation)",
        description="Wi-Fi signal suffers interference at 50% (drops to 2.2 Mbps, 280ms RTT, 12% loss). Without adaptation, transfer suffers repeated retransmissions.",
        channel_mode="degraded_wifi",
        file_size_mb=10.0,
        initial_throughput_mbps=45.0,
        initial_rtt_ms=20.0,
        initial_loss_percent=0.2,
        degrade_at_percent=50.0,
        degraded_throughput_mbps=2.2,
        degraded_rtt_ms=280.0,
        degraded_loss_percent=12.0,
        adaptive_handover=False,
        resumption_enabled=False,
        selective_repeat=True
    ),
    "packet_loss": ExperimentScenario(
        id="packet_loss",
        name="Severe Packet Loss Stress (15% Loss)",
        description="Tests Selective Retransmission under 15% random packet drop. Selective Repeat only retransmits lost chunks instead of restarting entire window.",
        channel_mode="packet_loss",
        file_size_mb=10.0,
        initial_throughput_mbps=20.0,
        initial_rtt_ms=45.0,
        initial_loss_percent=15.0,
        adaptive_handover=False,
        resumption_enabled=True,
        selective_repeat=True
    ),
    "interrupted": ExperimentScenario(
        id="interrupted",
        name="Interrupted Transfer (Disconnect at 60%)",
        description="Wi-Fi connection abruptly drops at 60%. Evaluates resumption from last checkpoint vs naive re-transfer from 0%.",
        channel_mode="interrupted",
        file_size_mb=10.0,
        initial_throughput_mbps=45.0,
        initial_rtt_ms=20.0,
        initial_loss_percent=0.2,
        degrade_at_percent=60.0,
        adaptive_handover=False,
        resumption_enabled=True,
        selective_repeat=True
    ),
    "smartshare_adaptive": ExperimentScenario(
        id="smartshare_adaptive",
        name="SmartShare Adaptive Transfer (Proposed)",
        description="Starts on fast Wi-Fi. At 55%, Wi-Fi degrades below 5 Mbps and RTT exceeds 200 ms. SmartShare automatically detects degradation, switches to Bluetooth, and resumes from Chunk 88 without restarting.",
        channel_mode="smartshare_adaptive",
        file_size_mb=10.0,
        initial_throughput_mbps=45.0,
        initial_rtt_ms=20.0,
        initial_loss_percent=0.2,
        degrade_at_percent=55.0,
        degraded_throughput_mbps=2.2,
        degraded_rtt_ms=280.0,
        degraded_loss_percent=12.0,
        adaptive_handover=True,
        resumption_enabled=True,
        selective_repeat=True
    ),
}
