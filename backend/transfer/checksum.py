import zlib
import hashlib
from typing import Union

class ChecksumVerifier:
    """
    Computes and verifies checksums for chunks and complete files.
    Demonstrates error detection in Computer Networks using CRC32 and SHA-256.
    """

    @staticmethod
    def calculate_crc32(data: Union[bytes, bytearray]) -> str:
        """Computes 32-bit Cyclic Redundancy Check as an 8-character hex string."""
        crc = zlib.crc32(data) & 0xffffffff
        return f"{crc:08x}"

    @staticmethod
    def calculate_sha256(data: Union[bytes, bytearray]) -> str:
        """Computes SHA-256 cryptographic hash of data chunk or file."""
        return hashlib.sha256(data).hexdigest()

    @classmethod
    def verify_chunk(cls, data: Union[bytes, bytearray], expected_checksum: str, algorithm: str = "crc32") -> bool:
        """
        Verifies whether chunk data matches the expected checksum.
        Returns True if chunk is valid, False if corrupted.
        """
        if algorithm == "crc32":
            actual = cls.calculate_crc32(data)
            return actual.lower() == expected_checksum.lower()
        elif algorithm == "sha256":
            actual = cls.calculate_sha256(data)
            return actual.lower() == expected_checksum.lower()
        else:
            raise ValueError(f"Unsupported checksum algorithm: {algorithm}")
