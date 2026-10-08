import {
  SessionResponse,
  TransferStatusResponse,
  BenchmarkScenario,
  BenchmarkResult,
  ThresholdConfig
} from '../types';

// Same-origin: in dev the Vite proxy forwards /api to the backend; when hosted, the backend serves this app itself.
const API_BASE = '';

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found');
  }
}

export async function createSession(deviceName: string = 'Laptop (Sender)'): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_name: deviceName })
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/api/session/${sessionId}`);
  if (res.status === 404) throw new SessionNotFoundError();
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function initTransfer(
  sessionId: string,
  fileName: string,
  fileSize: number,
  chunkSize: number = 65536,
  expectedSha256?: string,
  transferMode: 'with_wifi' | 'without_wifi' = 'with_wifi'
): Promise<{ transfer_id: string; total_chunks: number; chunk_size: number; transfer_mode: string }> {
  const res = await fetch(`${API_BASE}/api/transfer/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      file_name: fileName,
      file_size: fileSize,
      chunk_size: chunkSize,
      expected_sha256: expectedSha256,
      transfer_mode: transferMode
    })
  });
  if (!res.ok) throw new Error('Failed to initialize transfer');
  return res.json();
}

export async function getTransferStatus(transferId: string): Promise<TransferStatusResponse> {
  const res = await fetch(`${API_BASE}/api/transfer/${transferId}/status`);
  if (!res.ok) throw new Error('Failed to fetch transfer status');
  return res.json();
}

export async function sendChunk(
  transferId: string,
  seqNum: number,
  expectedChecksum: string,
  dataBase64: string
): Promise<{ status: string; seq_num: number; is_valid: boolean; completed: boolean }> {
  const res = await fetch(`${API_BASE}/api/transfer/${transferId}/chunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seq_num: seqNum,
      expected_checksum: expectedChecksum,
      data_base64: dataBase64
    })
  });
  if (!res.ok && res.status !== 422) {
    throw new Error('Failed to send chunk');
  }
  return res.json();
}

export async function resumeTransfer(transferId: string): Promise<{
  status: string;
  transfer_id: string;
  resume_from_chunk: number;
  missing_chunks: number[];
}> {
  const res = await fetch(`${API_BASE}/api/transfer/${transferId}/resume`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to resume transfer');
  return res.json();
}

export async function getNetworkStatus(transferId?: string) {
  const url = transferId
    ? `${API_BASE}/api/network/status?transfer_id=${transferId}`
    : `${API_BASE}/api/network/status`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch network status');
  return res.json();
}

export async function switchChannel(
  targetChannel: 'wifi' | 'bluetooth',
  transferId?: string,
  currentChunk: number = 0,
  reason: string = 'Manual Switch'
) {
  const url = transferId
    ? `${API_BASE}/api/channel/switch?transfer_id=${transferId}`
    : `${API_BASE}/api/channel/switch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_channel: targetChannel,
      current_chunk: currentChunk,
      reason
    })
  });
  if (!res.ok) throw new Error('Failed to switch channel');
  return res.json();
}

export async function simulateNetwork(
  profile: string,
  transferId?: string,
  params?: { throughput_mbps?: number; rtt_ms?: number; packet_loss_percent?: number }
) {
  const url = transferId
    ? `${API_BASE}/api/network/simulate?transfer_id=${transferId}`
    : `${API_BASE}/api/network/simulate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile,
      throughput_mbps: params?.throughput_mbps,
      rtt_ms: params?.rtt_ms,
      packet_loss_percent: params?.packet_loss_percent
    })
  });
  if (!res.ok) throw new Error('Failed to simulate network');
  return res.json();
}

export async function updateThresholds(config: Partial<ThresholdConfig>, transferId?: string) {
  const url = transferId
    ? `${API_BASE}/api/threshold/config?transfer_id=${transferId}`
    : `${API_BASE}/api/threshold/config`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error('Failed to update thresholds');
  return res.json();
}

export function getDownloadUrl(transferId: string): string {
  return `${API_BASE}/api/transfer/${transferId}/download`;
}

export async function getBenchmarkScenarios(): Promise<BenchmarkScenario[]> {
  const res = await fetch(`${API_BASE}/api/experiments/scenarios`);
  if (!res.ok) throw new Error('Failed to get benchmark scenarios');
  return res.json();
}

export async function runBenchmark(
  scenarioId?: string,
  fileSizeMb: number = 10.0
): Promise<{ scenario?: BenchmarkResult; all_scenarios?: BenchmarkResult[] }> {
  const url = scenarioId
    ? `${API_BASE}/api/experiments/run?scenario_id=${scenarioId}&file_size_mb=${fileSizeMb}`
    : `${API_BASE}/api/experiments/run?file_size_mb=${fileSizeMb}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run benchmark');
  return res.json();
}
