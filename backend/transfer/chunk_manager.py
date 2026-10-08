import os
import math
from typing import Dict, List, Optional, Set
from .checksum import ChecksumVerifier

DEFAULT_CHUNK_SIZE = 64 * 1024  # 64 KB default chunk size

class Chunk:
    def __init__(
        self,
        seq_num: int,
        total_chunks: int,
        offset: int,
        size: int,
        checksum: str,
        data: Optional[bytes] = None
    ):
        self.seq_num = seq_num
        self.total_chunks = total_chunks
        self.offset = offset
        self.size = size
        self.checksum = checksum
        self.data = data

    def to_dict(self, include_data: bool = False) -> dict:
        result = {
            "seq_num": self.seq_num,
            "total_chunks": self.total_chunks,
            "offset": self.offset,
            "size": self.size,
            "checksum": self.checksum,
        }
        if include_data and self.data is not None:
            import base64
            result["data"] = base64.b64encode(self.data).decode("utf-8")
        return result


class ChunkManager:
    """
    Handles chunk segmentation, verification, and reassembly.
    Demonstrates transport layer segmentation and reassembly.
    """

    def __init__(self, transfer_id: str, file_name: str, file_size: int, chunk_size: int = DEFAULT_CHUNK_SIZE, expected_sha256: Optional[str] = None):
        self.transfer_id = transfer_id
        self.file_name = file_name
        self.file_size = file_size
        self.chunk_size = chunk_size
        self.total_chunks = max(1, math.ceil(file_size / chunk_size)) if file_size > 0 else 1
        self.expected_sha256 = expected_sha256

        self.received_chunks: Dict[int, bytes] = {}
        self.chunk_checksums: Dict[int, str] = {}
        self.verified_seq_nums: Set[int] = set()
        self.corrupted_seq_nums: Set[int] = set()
        self.last_contiguous_seq: int = -1

    @classmethod
    def split_file(cls, file_path: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> List[Chunk]:
        """Splits an on-disk file into sequenced chunks with CRC32 checksums."""
        file_size = os.path.getsize(file_path)
        total_chunks = max(1, math.ceil(file_size / chunk_size))
        chunks = []

        with open(file_path, "rb") as f:
            for seq_num in range(total_chunks):
                offset = f.tell()
                data = f.read(chunk_size)
                checksum = ChecksumVerifier.calculate_crc32(data)
                chunks.append(Chunk(
                    seq_num=seq_num,
                    total_chunks=total_chunks,
                    offset=offset,
                    size=len(data),
                    checksum=checksum,
                    data=data
                ))
        return chunks

    @classmethod
    def split_bytes(cls, data: bytes, chunk_size: int = DEFAULT_CHUNK_SIZE) -> List[Chunk]:
        """Splits in-memory bytes into sequenced chunks."""
        file_size = len(data)
        total_chunks = max(1, math.ceil(file_size / chunk_size))
        chunks = []

        for seq_num in range(total_chunks):
            offset = seq_num * chunk_size
            chunk_data = data[offset : offset + chunk_size]
            checksum = ChecksumVerifier.calculate_crc32(chunk_data)
            chunks.append(Chunk(
                seq_num=seq_num,
                total_chunks=total_chunks,
                offset=offset,
                size=len(chunk_data),
                checksum=checksum,
                data=chunk_data
            ))
        return chunks

    def process_incoming_chunk(self, seq_num: int, chunk_data: bytes, expected_checksum: str) -> bool:
        """
        Receives an incoming chunk, computes CRC32, and verifies integrity.
        Returns True if valid and stored, False if corrupted.
        """
        is_valid = ChecksumVerifier.verify_chunk(chunk_data, expected_checksum, algorithm="crc32")
        self.chunk_checksums[seq_num] = expected_checksum

        if is_valid:
            self.received_chunks[seq_num] = chunk_data
            self.verified_seq_nums.add(seq_num)
            self.corrupted_seq_nums.discard(seq_num)
            self._update_contiguous_seq()
            return True
        else:
            self.corrupted_seq_nums.add(seq_num)
            return False

    def _update_contiguous_seq(self):
        """Finds the highest sequence number received where all 0..seq are present."""
        seq = 0
        while seq in self.verified_seq_nums:
            seq += 1
        self.last_contiguous_seq = seq - 1

    def get_missing_sequences(self) -> List[int]:
        """Returns list of sequence numbers that have not been successfully verified."""
        return [s for s in range(self.total_chunks) if s not in self.verified_seq_nums]

    def get_progress_percentage(self) -> float:
        if self.total_chunks == 0:
            return 100.0
        return round((len(self.verified_seq_nums) / self.total_chunks) * 100, 2)

    def is_complete(self) -> bool:
        return len(self.verified_seq_nums) == self.total_chunks

    def reassemble(self, output_path: str) -> bool:
        """Reassembles received chunks in sequence order into output file."""
        if not self.is_complete():
            return False

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            for seq_num in range(self.total_chunks):
                f.write(self.received_chunks[seq_num])
        return True
