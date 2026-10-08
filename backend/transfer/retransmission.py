import time
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field

@dataclass
class RetransmissionRecord:
    seq_num: int
    attempt_count: int
    first_sent_time: float
    last_sent_time: float
    reason: str  # "checksum_mismatch", "timeout_loss", "manual_retry"

class RetransmissionManager:
    """
    Implements Selective Retransmission (Selective Repeat ARQ).
    Tracks unacknowledged chunks, manages timeout detection, and enqueues lost chunks.
    Demonstrates transport layer reliable data transfer principles.
    """

    def __init__(self, timeout_seconds: float = 2.0, max_attempts: int = 5):
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        
        # In-flight tracker: seq_num -> send_timestamp
        self.in_flight: Dict[int, float] = {}
        
        # Acknowledged sequences
        self.acknowledged: Set[int] = set()
        
        # Retransmission history and stats
        self.retransmission_history: Dict[int, RetransmissionRecord] = {}
        self.total_retransmissions: int = 0
        self.retransmission_queue: List[int] = []

    def mark_sent(self, seq_num: int):
        """Records when a chunk was dispatched."""
        now = time.time()
        self.in_flight[seq_num] = now

    def mark_acknowledged(self, seq_num: int):
        """Processes ACK for a successfully verified chunk."""
        self.in_flight.pop(seq_num, None)
        self.acknowledged.add(seq_num)
        if seq_num in self.retransmission_queue:
            self.retransmission_queue.remove(seq_num)

    def mark_corrupted(self, seq_num: int, reason: str = "checksum_mismatch") -> bool:
        """
        Processes NACK for a corrupted chunk. Enqueues for selective retransmission.
        Returns True if can be retransmitted, False if exceeded max attempts.
        """
        return self._queue_retransmission(seq_num, reason)

    def check_timeouts(self) -> List[int]:
        """
        Scans all in-flight chunks for timeouts (packet loss detection).
        Enqueues timed out chunks for retransmission.
        """
        now = time.time()
        timed_out = []
        for seq_num, sent_time in list(self.in_flight.items()):
            if (now - sent_time) > self.timeout_seconds:
                timed_out.append(seq_num)

        for seq in timed_out:
            self.in_flight.pop(seq, None)
            self._queue_retransmission(seq, "timeout_loss")

        return timed_out

    def _queue_retransmission(self, seq_num: int, reason: str) -> bool:
        now = time.time()
        if seq_num in self.retransmission_history:
            record = self.retransmission_history[seq_num]
            if record.attempt_count >= self.max_attempts:
                return False
            record.attempt_count += 1
            record.last_sent_time = now
            record.reason = reason
        else:
            self.retransmission_history[seq_num] = RetransmissionRecord(
                seq_num=seq_num,
                attempt_count=1,
                first_sent_time=now,
                last_sent_time=now,
                reason=reason
            )

        self.total_retransmissions += 1
        if seq_num not in self.retransmission_queue:
            self.retransmission_queue.append(seq_num)
        return True

    def get_next_retransmit(self) -> Optional[int]:
        """Pops the next chunk sequence that needs retransmission."""
        if self.retransmission_queue:
            return self.retransmission_queue.pop(0)
        return None

    def get_stats(self) -> dict:
        return {
            "total_retransmissions": self.total_retransmissions,
            "pending_retransmits": len(self.retransmission_queue),
            "in_flight_count": len(self.in_flight),
            "retried_chunks_count": len(self.retransmission_history),
            "retried_chunks": [
                {
                    "seq_num": r.seq_num,
                    "attempts": r.attempt_count,
                    "reason": r.reason
                }
                for r in self.retransmission_history.values()
            ]
        }
