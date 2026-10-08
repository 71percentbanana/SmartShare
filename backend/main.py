import os
import time
import uuid
import socket
import json
import base64
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from transfer.chunk_manager import ChunkManager, Chunk, DEFAULT_CHUNK_SIZE
from transfer.checksum import ChecksumVerifier
from transfer.retransmission import RetransmissionManager
from transfer.resume import ResumeManager
from network.monitor import NetworkMonitor
from network.threshold_checker import ThresholdChecker, ThresholdConfig
from channel.channel_manager import ChannelManager
from experiments.benchmark import BenchmarkRunner
from experiments.scenarios import SCENARIOS

app = FastAPI(
    title="SmartShare API",
    description="Threshold-Based Adaptive File Transfer over Heterogeneous Networks",
    version="1.0.0"
)

# Enable CORS for local network and frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_HERE = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(_HERE, "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

# Limits for a publicly hosted instance (chunks are held in RAM until the file is assembled)
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_MB", "100")) * 1024 * 1024
RETENTION_SECONDS = int(os.environ.get("RETENTION_HOURS", "6")) * 3600

# Built frontend: ./static (Docker image) or ../frontend/dist (local build). Optional.
STATIC_DIR = next(
    (
        os.path.abspath(p)
        for p in (os.environ.get("STATIC_DIR"), os.path.join(_HERE, "static"), os.path.join(_HERE, "..", "frontend", "dist"))
        if p and os.path.isfile(os.path.join(p, "index.html"))
    ),
    None,
)

def get_local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

# Global State Stores
class TransferState:
    def __init__(self, transfer_id: str, file_name: str, file_size: int, chunk_size: int, expected_sha256: Optional[str] = None, transfer_mode: str = "with_wifi"):
        self.transfer_id = transfer_id
        self.file_name = file_name
        self.file_size = file_size
        self.chunk_size = chunk_size
        self.expected_sha256 = expected_sha256
        self.transfer_mode = transfer_mode  # "with_wifi" or "without_wifi"
        self.status = "transferring"  # "idle", "transferring", "paused", "completed", "degraded_switching"
        self.created_at = time.time()
        self.completed_at: Optional[float] = None
        
        self.chunk_manager = ChunkManager(transfer_id, file_name, file_size, chunk_size, expected_sha256)
        self.retransmission_manager = RetransmissionManager()
        self.resume_manager = ResumeManager(transfer_id, file_name, self.chunk_manager.total_chunks)
        self.channel_manager = ChannelManager()
        self.network_monitor = NetworkMonitor()
        self.total_bytes_received = 0

        if self.transfer_mode == "without_wifi":
            self.channel_manager.active_channel = "bluetooth"
            self.network_monitor.set_channel("bluetooth")
            self.network_monitor.set_simulation_profile("bluetooth")
            self.status_banner: str = "Direct Bluetooth-only transfer (Wi-Fi disabled)"
        else:
            self.channel_manager.active_channel = "wifi"
            self.network_monitor.set_channel("wifi")
            self.network_monitor.set_simulation_profile("normal_wifi")
            self.status_banner: str = "Transfer in progress over Wi-Fi (Adaptive mode)"

active_sessions: Dict[str, dict] = {}
active_transfers: Dict[str, TransferState] = {}
connected_websockets: Dict[str, List[WebSocket]] = {}


def purge_expired() -> None:
    """Drop old sessions/transfers and their stored files so a long-running host doesn't fill up."""
    cutoff = time.time() - RETENTION_SECONDS
    for tid in [t for t, s in active_transfers.items() if s.created_at < cutoff]:
        state = active_transfers.pop(tid)
        path = os.path.join(STORAGE_DIR, f"{tid}_{state.file_name}")
        if os.path.exists(path):
            os.remove(path)
    for sid in [s for s, d in active_sessions.items() if d["created_at"] < cutoff]:
        active_sessions.pop(sid, None)
        connected_websockets.pop(sid, None)

# ----------------- Request / Response Models -----------------

class CreateSessionRequest(BaseModel):
    device_name: Optional[str] = "Laptop (Sender)"

class InitTransferRequest(BaseModel):
    session_id: str
    file_name: str
    file_size: int
    chunk_size: Optional[int] = DEFAULT_CHUNK_SIZE
    expected_sha256: Optional[str] = None
    transfer_mode: Optional[str] = "with_wifi"  # "with_wifi" or "without_wifi"

class ChunkPayloadRequest(BaseModel):
    seq_num: int
    expected_checksum: str
    data_base64: str

class SwitchChannelRequest(BaseModel):
    target_channel: str # "wifi" or "bluetooth"
    current_chunk: Optional[int] = 0
    reason: Optional[str] = "Manual Switch"

class NetworkSimulateRequest(BaseModel):
    profile: str # "normal_wifi", "degraded_wifi", "bluetooth", "manual"
    throughput_mbps: Optional[float] = None
    rtt_ms: Optional[float] = None
    packet_loss_percent: Optional[float] = None

class ThresholdSettingsRequest(BaseModel):
    min_wifi_throughput_mbps: Optional[float] = None
    max_wifi_rtt_ms: Optional[float] = None
    max_wifi_packet_loss_percent: Optional[float] = None

# ----------------- Endpoints -----------------

def read_root():
    return {
        "project": "SmartShare – Threshold-Based Adaptive File Transfer over Heterogeneous Networks",
        "status": "online",
        "local_ip": get_local_ip()
    }

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/session")
def create_session(req: CreateSessionRequest):
    purge_expired()
    session_id = str(uuid.uuid4())[:8]
    local_ip = get_local_ip()
    
    # URL for mobile phone joining
    join_url = f"http://{local_ip}:5173/transfer?session={session_id}&role=receiver"
    
    session_data = {
        "session_id": session_id,
        "created_at": time.time(),
        "creator": req.device_name,
        "join_url": join_url,
        "local_ip": local_ip,
        "devices": [req.device_name],
        "active_transfer_id": None
    }
    active_sessions[session_id] = session_data
    return session_data

@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return active_sessions[session_id]

@app.post("/api/transfer/init")
def init_transfer(req: InitTransferRequest):
    if req.session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    transfer_mode = req.transfer_mode or "with_wifi"
    if transfer_mode not in ("with_wifi", "without_wifi"):
        raise HTTPException(status_code=400, detail="transfer_mode must be 'with_wifi' or 'without_wifi'")
    chunk_size = req.chunk_size or DEFAULT_CHUNK_SIZE
    if chunk_size <= 0 or req.file_size < 0:
        raise HTTPException(status_code=400, detail="Invalid file_size or chunk_size")
    if req.file_size > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Limit is {MAX_FILE_BYTES // (1024 * 1024)} MB")
    purge_expired()
    # Keep only the final path component so a client can't write outside storage/
    file_name = os.path.basename(req.file_name.replace("\\", "/")) or "file.bin"

    transfer_id = str(uuid.uuid4())[:8]
    state = TransferState(
        transfer_id=transfer_id,
        file_name=file_name,
        file_size=req.file_size,
        chunk_size=chunk_size,
        expected_sha256=req.expected_sha256,
        transfer_mode=transfer_mode
    )
    active_transfers[transfer_id] = state
    active_sessions[req.session_id]["active_transfer_id"] = transfer_id

    return {
        "transfer_id": transfer_id,
        "session_id": req.session_id,
        "file_name": file_name,
        "file_size": req.file_size,
        "chunk_size": chunk_size,
        "total_chunks": state.chunk_manager.total_chunks,
        "status": state.status,
        "channel": state.channel_manager.active_channel,
        "transfer_mode": state.transfer_mode
    }

@app.get("/api/transfer/{transfer_id}/status")
def get_transfer_status(transfer_id: str):
    if transfer_id not in active_transfers:
        raise HTTPException(status_code=404, detail="Transfer not found")

    state = active_transfers[transfer_id]
    metrics = state.network_monitor.sample_metrics(current_bytes_transferred=state.total_bytes_received)
    eval_result = state.network_monitor.evaluate_current(metrics)

    # Automatic threshold check & handover trigger only for With Wi-Fi mode
    if state.transfer_mode == "with_wifi" and state.status == "transferring" and state.channel_manager.active_channel == "wifi" and eval_result.should_switch:
        # Trigger adaptive handover
        last_seq = state.chunk_manager.last_contiguous_seq
        handover = state.channel_manager.execute_handover("bluetooth", last_seq, eval_result.summary_message)
        state.network_monitor.set_channel("bluetooth")
        state.network_monitor.set_simulation_profile("bluetooth")
        state.resume_manager.record_handover_complete("wifi", "bluetooth", last_seq + 1, eval_result.summary_message)
        state.status_banner = f"Wi-Fi degraded ({', '.join(eval_result.reasons)}) – switched to Bluetooth! Resuming from Chunk {last_seq + 1}"

    return {
        "transfer_id": transfer_id,
        "file_name": state.file_name,
        "file_size": state.file_size,
        "chunk_size": state.chunk_size,
        "total_chunks": state.chunk_manager.total_chunks,
        "completed_chunks": len(state.chunk_manager.verified_seq_nums),
        "last_contiguous_chunk": state.chunk_manager.last_contiguous_seq,
        "missing_chunks_count": len(state.chunk_manager.get_missing_sequences()),
        "progress_percent": state.chunk_manager.get_progress_percentage(),
        "status": state.status,
        "status_banner": state.status_banner,
        "transfer_mode": state.transfer_mode,
        "active_channel": state.channel_manager.active_channel,
        "channel_info": state.channel_manager.get_channel_info(),
        "network_metrics": metrics.to_dict(),
        "retransmission_stats": state.retransmission_manager.get_stats(),
        "resume_info": state.resume_manager.get_resume_point(list(state.chunk_manager.verified_seq_nums)),
        "is_complete": state.chunk_manager.is_complete()
    }

@app.post("/api/transfer/{transfer_id}/chunk")
async def receive_chunk(transfer_id: str, payload: ChunkPayloadRequest):
    if transfer_id not in active_transfers:
        raise HTTPException(status_code=404, detail="Transfer not found")

    state = active_transfers[transfer_id]

    if not 0 <= payload.seq_num < state.chunk_manager.total_chunks:
        raise HTTPException(status_code=400, detail="seq_num out of range")

    # If on Bluetooth channel, emulate BT bandwidth throttling
    if state.channel_manager.active_channel == "bluetooth":
        await state.channel_manager.bt_manager.throttle_delay(state.chunk_size)

    # Decode chunk data
    try:
        chunk_bytes = base64.b64decode(payload.data_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid base64 chunk data")

    # Verify Checksum (CRC32)
    is_valid = state.chunk_manager.process_incoming_chunk(
        seq_num=payload.seq_num,
        chunk_data=chunk_bytes,
        expected_checksum=payload.expected_checksum
    )

    if is_valid:
        state.retransmission_manager.mark_acknowledged(payload.seq_num)
        state.total_bytes_received += len(chunk_bytes)
        state.resume_manager.update_checkpoint(state.chunk_manager.last_contiguous_seq)
        
        # Check if entire file completed
        if state.chunk_manager.is_complete():
            state.status = "completed"
            state.completed_at = time.time()
            state.status_banner = "Transfer completed successfully! File reassembled and verified."
            
            # Save assembled file to storage
            out_path = os.path.join(STORAGE_DIR, f"{transfer_id}_{state.file_name}")
            state.chunk_manager.reassemble(out_path)

        return {
            "status": "ack",
            "seq_num": payload.seq_num,
            "is_valid": True,
            "progress_percent": state.chunk_manager.get_progress_percentage(),
            "completed": state.chunk_manager.is_complete()
        }
    else:
        # Corrupted chunk -> Selective Retransmission NACK
        state.retransmission_manager.mark_corrupted(payload.seq_num, "checksum_mismatch")
        return JSONResponse(
            status_code=422,
            content={
                "status": "nack",
                "seq_num": payload.seq_num,
                "is_valid": False,
                "message": f"CRC32 mismatch on chunk {payload.seq_num}. Scheduled for selective retransmission."
            }
        )

@app.post("/api/transfer/{transfer_id}/resume")
def resume_transfer(transfer_id: str):
    if transfer_id not in active_transfers:
        raise HTTPException(status_code=404, detail="Transfer not found")

    state = active_transfers[transfer_id]
    resume_point = state.resume_manager.get_resume_point(list(state.chunk_manager.verified_seq_nums))
    state.status = "transferring"
    # A fresh start also goes through this endpoint; only call it a resume when chunks are already verified.
    if resume_point["already_transferred_count"] > 0:
        state.status_banner = f"Resumed transfer from Chunk {resume_point['resume_from_chunk']}"
    
    return {
        "status": "resumed",
        "transfer_id": transfer_id,
        "resume_from_chunk": resume_point["resume_from_chunk"],
        "missing_chunks": resume_point["missing_chunks"],
        "already_verified_count": resume_point["already_transferred_count"],
        "total_chunks": resume_point["total_chunks"]
    }

@app.get("/api/network/status")
def get_network_status(transfer_id: Optional[str] = None):
    if transfer_id and transfer_id in active_transfers:
        state = active_transfers[transfer_id]
        metrics = state.network_monitor.sample_metrics(current_bytes_transferred=state.total_bytes_received)
        evaluation = state.network_monitor.evaluate_current(metrics)
        thresholds = state.network_monitor.checker.config
    else:
        # Standalone monitor
        dummy_monitor = NetworkMonitor()
        metrics = dummy_monitor.sample_metrics()
        evaluation = dummy_monitor.evaluate_current(metrics)
        thresholds = dummy_monitor.checker.config

    return {
        "metrics": metrics.to_dict(),
        "thresholds": {
            "min_wifi_throughput_mbps": thresholds.min_wifi_throughput_mbps,
            "max_wifi_rtt_ms": thresholds.max_wifi_rtt_ms,
            "max_wifi_packet_loss_percent": thresholds.max_wifi_packet_loss_percent
        },
        "evaluation": {
            "is_degraded": evaluation.is_degraded,
            "current_channel": evaluation.current_channel,
            "recommended_channel": evaluation.recommended_channel,
            "should_switch": evaluation.should_switch,
            "reasons": evaluation.reasons,
            "summary_message": evaluation.summary_message
        }
    }

@app.post("/api/channel/switch")
def switch_channel(req: SwitchChannelRequest, transfer_id: Optional[str] = None):
    if req.target_channel.lower() not in ("wifi", "bluetooth"):
        raise HTTPException(status_code=400, detail="target_channel must be 'wifi' or 'bluetooth'")
    if transfer_id and transfer_id in active_transfers:
        state = active_transfers[transfer_id]
        if state.transfer_mode == "without_wifi" and req.target_channel.lower() != "bluetooth":
            raise HTTPException(status_code=409, detail="Wi-Fi is disabled in Bluetooth-only mode")
        res = state.channel_manager.switch_channel_manual(req.target_channel, req.current_chunk or state.chunk_manager.last_contiguous_seq)
        state.network_monitor.set_channel(req.target_channel)
        state.network_monitor.set_simulation_profile(req.target_channel)
        state.status_banner = f"Channel switched to {req.target_channel.upper()} – resuming from Chunk {res.get('resume_chunk', req.current_chunk)}"
        return res
    return {
        "status": "switched",
        "active_channel": req.target_channel,
        "reason": req.reason
    }

@app.post("/api/network/simulate")
def simulate_network(req: NetworkSimulateRequest, transfer_id: Optional[str] = None):
    """Dynamically triggers network conditions (normal Wi-Fi, degraded Wi-Fi, Bluetooth, or custom)."""
    if transfer_id and transfer_id in active_transfers:
        state = active_transfers[transfer_id]
        if state.transfer_mode == "without_wifi" and req.profile != "bluetooth":
            raise HTTPException(status_code=409, detail="Only the Bluetooth profile applies in Bluetooth-only mode")
        monitor = state.network_monitor
    else:
        monitor = NetworkMonitor()

    monitor.set_simulation_profile(
        req.profile,
        throughput_mbps=req.throughput_mbps,
        rtt_ms=req.rtt_ms,
        packet_loss_percent=req.packet_loss_percent
    )
    return {
        "status": "simulation_profile_updated",
        "profile": req.profile,
        "manual_params": {
            "throughput": req.throughput_mbps,
            "rtt": req.rtt_ms,
            "loss": req.packet_loss_percent
        }
    }

@app.post("/api/threshold/config")
def update_thresholds(req: ThresholdSettingsRequest, transfer_id: Optional[str] = None):
    if transfer_id and transfer_id in active_transfers:
        checker = active_transfers[transfer_id].network_monitor.checker
        checker.update_config(req.min_wifi_throughput_mbps, req.max_wifi_rtt_ms, req.max_wifi_packet_loss_percent)
    return {"status": "thresholds_updated"}

@app.get("/api/transfer/{transfer_id}/download")
def download_file(transfer_id: str):
    if transfer_id not in active_transfers:
        raise HTTPException(status_code=404, detail="Transfer not found")

    state = active_transfers[transfer_id]
    file_path = os.path.join(STORAGE_DIR, f"{transfer_id}_{state.file_name}")
    if not os.path.exists(file_path):
        # Attempt reassembly
        state.chunk_manager.reassemble(file_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="File reassembly incomplete")

    return FileResponse(file_path, filename=state.file_name, media_type="application/octet-stream")

# ----------------- Benchmark / Experiments API -----------------

@app.get("/api/experiments/scenarios")
def get_scenarios():
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "channel_mode": s.channel_mode,
            "file_size_mb": s.file_size_mb,
            "initial_throughput_mbps": s.initial_throughput_mbps,
            "initial_rtt_ms": s.initial_rtt_ms,
            "initial_loss_percent": s.initial_loss_percent,
            "degrade_at_percent": s.degrade_at_percent,
            "adaptive_handover": s.adaptive_handover
        }
        for s in SCENARIOS.values()
    ]

@app.post("/api/experiments/run")
def run_experiment(scenario_id: Optional[str] = None, file_size_mb: float = 10.0):
    if scenario_id:
        result = BenchmarkRunner.run_scenario(scenario_id, file_size_mb=file_size_mb)
        return {"scenario": result}
    else:
        results = BenchmarkRunner.run_all_comparative(file_size_mb=file_size_mb)
        return {"all_scenarios": results}

# ----------------- WebSocket Signaling & Relay -----------------

@app.websocket("/ws/{session_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, client_id: str):
    await websocket.accept()
    if session_id not in connected_websockets:
        connected_websockets[session_id] = []
    connected_websockets[session_id].append(websocket)

    # Broadcast device join
    if session_id in active_sessions:
        if client_id not in active_sessions[session_id]["devices"]:
            active_sessions[session_id]["devices"].append(client_id)

    try:
        # Notify peers
        for peer in connected_websockets[session_id]:
            if peer != websocket:
                await peer.send_json({
                    "type": "peer_joined",
                    "client_id": client_id,
                    "devices": active_sessions.get(session_id, {}).get("devices", [])
                })

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # Broadcast message (signaling SDP, ICE candidates, or chunk relay) to other peers in session
            for peer in connected_websockets[session_id]:
                if peer != websocket:
                    await peer.send_text(data)

    except WebSocketDisconnect:
        connected_websockets[session_id].remove(websocket)
        if session_id in active_sessions and client_id in active_sessions[session_id]["devices"]:
            active_sessions[session_id]["devices"].remove(client_id)

# ----------------- Frontend (single-origin hosting) -----------------

if STATIC_DIR:
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith(("api/", "ws/")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.realpath(os.path.join(STATIC_DIR, full_path))
        if full_path and candidate.startswith(STATIC_DIR + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
        # A missing file (anything with an extension) is a real 404; only app routes get the shell
        if "." in full_path.rsplit("/", 1)[-1]:
            raise HTTPException(status_code=404, detail="Not found")
        # Client-side routes such as /transfer?session=... fall back to the app shell
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    app.get("/")(read_root)

if __name__ == "__main__":
    import uvicorn
    # Hosts like Railway provide PORT; locally default to 8000 with auto-reload.
    hosted = "PORT" in os.environ
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=not hosted)
