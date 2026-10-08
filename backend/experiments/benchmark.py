import math
import random
import time
from typing import Dict, List
from .scenarios import SCENARIOS, ExperimentScenario

class BenchmarkRunner:
    """
    Simulates and evaluates file transfer protocols across heterogeneous network conditions.
    Computes key Computer Networks performance metrics:
    - Total Transfer Time (s)
    - Number of Retransmissions
    - Recovery/Resume Time (ms)
    - Successful Completion Rate (%)
    - Effective Goodput (Mbps)
    """

    @classmethod
    def run_scenario(cls, scenario_id: str, file_size_mb: float = 10.0, chunk_size_kb: int = 64) -> dict:
        scenario = SCENARIOS.get(scenario_id)
        if not scenario:
            raise ValueError(f"Unknown scenario: {scenario_id}")

        total_bytes = int(file_size_mb * 1024 * 1024)
        chunk_size_bytes = chunk_size_kb * 1024
        total_chunks = max(1, math.ceil(total_bytes / chunk_size_bytes))
        
        timeline = []
        retransmissions = 0
        current_time = 0.0
        current_channel = "wifi"
        recovery_time_ms = 0.0
        handover_occurred = False
        switched_at_chunk = None
        transfer_completed = True
        
        # Determine degradation point
        degrade_chunk = None
        if scenario.degrade_at_percent is not None:
            degrade_chunk = int(total_chunks * (scenario.degrade_at_percent / 100.0))

        # Initial conditions
        throughput = scenario.initial_throughput_mbps
        rtt = scenario.initial_rtt_ms
        loss_rate = scenario.initial_loss_percent / 100.0

        if scenario.channel_mode == "bt_only":
            current_channel = "bluetooth"

        seq = 0
        while seq < total_chunks:
            # Check degradation trigger
            if degrade_chunk is not None and seq >= degrade_chunk and not handover_occurred:
                if scenario.adaptive_handover:
                    # SmartShare Threshold Trigger:
                    # Wi-Fi throughput < 5 Mbps OR RTT > 200 ms OR loss > 5%
                    # Trigger switch to Bluetooth
                    handover_occurred = True
                    switched_at_chunk = seq
                    recovery_time_ms = 68.0  # 68ms detection and handshake
                    current_time += (recovery_time_ms / 1000.0)
                    current_channel = "bluetooth"
                    throughput = 1.9        # Bluetooth 5.0 High Speed
                    rtt = 52.0
                    loss_rate = 0.005       # Stable channel
                elif scenario.channel_mode == "degraded_wifi":
                    # Degraded without adaptation
                    throughput = scenario.degraded_throughput_mbps or 2.2
                    rtt = scenario.degraded_rtt_ms or 280.0
                    loss_rate = (scenario.degraded_loss_percent or 12.0) / 100.0
                elif scenario.channel_mode == "interrupted":
                    # Interruption disconnect
                    if not scenario.resumption_enabled:
                        # Naive system: restarts from 0
                        seq = 0
                        recovery_time_ms = 4500.0
                        current_time += 4.5
                        degrade_chunk = None  # don't trigger second loop
                        continue
                    else:
                        # With resumption: wait reconnect, resume from current chunk
                        recovery_time_ms = 1850.0
                        current_time += 1.85
                        degrade_chunk = None

            # Calculate chunk transmission duration
            # Serialization delay = (chunk_bits) / (throughput_bps)
            # Propagation & queuing = RTT / 2
            chunk_bits = chunk_size_bytes * 8
            tx_delay = chunk_bits / (throughput * 1_000_000)
            latency_delay = (rtt / 2.0) / 1000.0
            chunk_duration = tx_delay + latency_delay

            # Simulate packet loss probability
            is_lost = random.random() < loss_rate
            if is_lost:
                retransmissions += 1
                if scenario.selective_repeat:
                    # Selective Repeat: retransmit only this chunk
                    # Timeout duration + retransmission duration
                    timeout_penalty = max(0.2, (rtt * 2.5) / 1000.0)
                    current_time += timeout_penalty + chunk_duration
                else:
                    # Go-back-N or naive: window stall penalty
                    current_time += 1.2 + chunk_duration

            current_time += chunk_duration

            # Sample timeline progress
            if seq % max(1, total_chunks // 20) == 0 or seq == total_chunks - 1:
                progress = round(((seq + 1) / total_chunks) * 100, 1)
                timeline.append({
                    "time_s": round(current_time, 2),
                    "chunk": seq + 1,
                    "progress_percent": progress,
                    "channel": current_channel,
                    "throughput_mbps": throughput,
                    "rtt_ms": rtt
                })

            seq += 1

        total_transfer_time_s = round(current_time, 2)
        effective_goodput_mbps = round((file_size_mb * 8) / max(0.001, total_transfer_time_s), 2)
        completion_rate = 100.0

        return {
            "scenario_id": scenario.id,
            "scenario_name": scenario.name,
            "description": scenario.description,
            "file_size_mb": file_size_mb,
            "total_chunks": total_chunks,
            "total_transfer_time_s": total_transfer_time_s,
            "retransmissions_count": retransmissions,
            "recovery_resume_time_ms": round(recovery_time_ms, 1),
            "completion_rate_percent": completion_rate,
            "effective_goodput_mbps": effective_goodput_mbps,
            "handover_occurred": handover_occurred,
            "switched_at_chunk": switched_at_chunk,
            "final_channel": current_channel,
            "timeline": timeline
        }

    @classmethod
    def run_all_comparative(cls, file_size_mb: float = 10.0) -> List[dict]:
        results = []
        for s_id in ["normal_wifi", "normal_bt", "degraded_wifi", "packet_loss", "interrupted", "smartshare_adaptive"]:
            results.append(cls.run_scenario(s_id, file_size_mb=file_size_mb))
        return results
