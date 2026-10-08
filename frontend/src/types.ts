export interface NetworkMetrics {
  channel: 'wifi' | 'bluetooth';
  throughput_mbps: number;
  rtt_ms: number;
  packet_loss_percent: number;
  jitter_ms: number;
  bytes_transferred: number;
  timestamp: number;
}

export interface ThresholdConfig {
  min_wifi_throughput_mbps: number;
  max_wifi_rtt_ms: number;
  max_wifi_packet_loss_percent: number;
}

export interface ThresholdEvaluation {
  is_degraded: boolean;
  current_channel: string;
  recommended_channel: string;
  should_switch: boolean;
  reasons: string[];
  summary_message: string;
}

export interface ChannelInfo {
  active_channel: 'wifi' | 'bluetooth';
  wifi_status: {
    name: string;
    nominal_bandwidth: string;
    nominal_latency: string;
    status: string;
  };
  bluetooth_status: {
    device_name: string;
    paired_device: string;
    is_connected: boolean;
    profile: string;
    max_throughput_mbps: number;
    nominal_rtt_ms: number;
  };
  switch_count: number;
}

export interface RetransmissionRecord {
  seq_num: number;
  attempts: number;
  reason: string;
}

export interface RetransmissionStats {
  total_retransmissions: number;
  pending_retransmits: number;
  in_flight_count: number;
  retried_chunks_count: number;
  retried_chunks: RetransmissionRecord[];
}

export interface SwitchHistoryItem {
  timestamp: number;
  from_channel: string;
  to_channel: string;
  at_chunk?: number;
  last_completed_chunk?: number;
  resume_chunk?: number;
  progress_percent?: number;
  reason: string;
  recovery_time_ms?: number;
  handover_duration_ms?: number;
}

export interface ResumeInfo {
  transfer_id: string;
  resume_from_chunk: number;
  last_contiguous_chunk: number;
  missing_chunks: number[];
  already_transferred_count: number;
  total_chunks: number;
  switch_history: SwitchHistoryItem[];
}

export interface TransferStatusResponse {
  transfer_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  completed_chunks: number;
  last_contiguous_chunk: number;
  missing_chunks_count: number;
  progress_percent: number;
  status: 'idle' | 'transferring' | 'paused' | 'completed' | 'degraded_switching' | 'error';
  status_banner: string;
  transfer_mode?: 'with_wifi' | 'without_wifi';
  active_channel: 'wifi' | 'bluetooth';
  channel_info: ChannelInfo;
  network_metrics: NetworkMetrics;
  retransmission_stats: RetransmissionStats;
  resume_info: ResumeInfo;
  is_complete: boolean;
}

export interface SessionResponse {
  session_id: string;
  created_at: number;
  creator: string;
  join_url: string;
  local_ip: string;
  devices: string[];
  active_transfer_id: string | null;
}

export interface ChunkInfo {
  seq_num: number;
  total_chunks: number;
  offset: number;
  size: number;
  checksum: string;
  status: 'pending' | 'in_flight' | 'verified' | 'corrupted' | 'retransmitted';
}

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  channel_mode: string;
  file_size_mb: number;
  initial_throughput_mbps: number;
  initial_rtt_ms: number;
  initial_loss_percent: number;
  degrade_at_percent?: number;
  adaptive_handover: boolean;
}

export interface BenchmarkResult {
  scenario_id: string;
  scenario_name: string;
  description: string;
  file_size_mb: number;
  total_chunks: number;
  total_transfer_time_s: number;
  retransmissions_count: number;
  recovery_resume_time_ms: number;
  completion_rate_percent: number;
  effective_goodput_mbps: number;
  handover_occurred: boolean;
  switched_at_chunk?: number;
  final_channel: string;
  timeline: {
    time_s: number;
    chunk: number;
    progress_percent: number;
    channel: string;
    throughput_mbps: number;
    rtt_ms: number;
  }[];
}

export type TransferMode = 'with_wifi' | 'without_wifi';
export type Role = 'sender' | 'receiver';
export type Page = 'home' | 'transfer' | 'experiments';
