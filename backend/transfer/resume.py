import time
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

@dataclass
class ChannelSwitchEvent:
    timestamp: float
    from_channel: str
    to_channel: str
    at_chunk: int
    progress_percent: float
    reason: str
    recovery_time_ms: float

class ResumeManager:
    """
    Manages session state, checkpoints, and seamless resumption across channel switches.
    Demonstrates session continuity and handover in heterogeneous networks.
    """

    def __init__(self, transfer_id: str, file_name: str, total_chunks: int):
        self.transfer_id = transfer_id
        self.file_name = file_name
        self.total_chunks = total_chunks
        
        self.last_contiguous_chunk: int = -1
        self.checkpoint_timestamp: float = time.time()
        self.switch_events: List[ChannelSwitchEvent] = []
        self.switch_start_time: Optional[float] = None

    def update_checkpoint(self, last_contiguous_seq: int):
        """Updates the highest contiguous verified chunk sequence."""
        self.last_contiguous_chunk = last_contiguous_seq
        self.checkpoint_timestamp = time.time()

    def record_handover_start(self):
        """Marks the moment degradation triggers channel handover."""
        self.switch_start_time = time.time()

    def record_handover_complete(self, from_channel: str, to_channel: str, resume_seq: int, reason: str) -> ChannelSwitchEvent:
        """
        Marks completion of channel switch and resumption from resume_seq.
        Calculates recovery/resume time in milliseconds.
        """
        now = time.time()
        recovery_time = 0.0
        if self.switch_start_time is not None:
            recovery_time = round((now - self.switch_start_time) * 1000, 2)
            self.switch_start_time = None
        else:
            recovery_time = 45.0  # nominal handover delay in ms

        progress = round(((resume_seq + 1) / max(1, self.total_chunks)) * 100, 1)

        event = ChannelSwitchEvent(
            timestamp=now,
            from_channel=from_channel,
            to_channel=to_channel,
            at_chunk=resume_seq,
            progress_percent=progress,
            reason=reason,
            recovery_time_ms=recovery_time
        )
        self.switch_events.append(event)
        return event

    def get_resume_point(self, verified_seqs: List[int]) -> dict:
        """
        Determines exactly where to resume file transfer.
        Returns:
            resume_from_chunk: the next chunk needed (0-indexed)
            missing_chunks: list of all missing chunks
            skipped_chunks_count: count of already verified chunks that won't be retransmitted
        """
        verified_set = set(verified_seqs)
        missing = [seq for seq in range(self.total_chunks) if seq not in verified_set]
        next_chunk = missing[0] if missing else self.total_chunks

        return {
            "transfer_id": self.transfer_id,
            "resume_from_chunk": next_chunk,
            "last_contiguous_chunk": self.last_contiguous_chunk,
            "missing_chunks": missing,
            "already_transferred_count": len(verified_set),
            "total_chunks": self.total_chunks,
            "switch_history": [asdict(e) for e in self.switch_events]
        }
