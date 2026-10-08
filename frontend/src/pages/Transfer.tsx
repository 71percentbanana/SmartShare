import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TransferPanel } from '../components/TransferPanel';
import { LinkPanel } from '../components/LinkPanel';
import { ChunkVisualizer } from '../components/ChunkVisualizer';
import { SimulationControls } from '../components/SimulationControls';
import { TransferHistory } from '../components/TransferHistory';
import { EventLog, LogEvent } from '../components/EventLog';
import { ReceiverView } from '../components/ReceiverView';
import { MODES } from '../lib/modes';
import { formatBytes } from '../lib/format';
import { Role, SessionResponse, ThresholdConfig, TransferMode, TransferStatusResponse } from '../types';
import * as api from '../services/api';
import { calculateCRC32 } from '../services/webrtc';

const CHUNK_SIZE = 65536;
const MAX_ATTEMPTS = 5;

interface TransferProps {
  session: SessionResponse | null;
  selectedFile: File | null;
  thresholds: ThresholdConfig;
  role: Role;
  mode: TransferMode;
  onModeDetected: (mode: TransferMode) => void;
  onBusyChange: (busy: boolean) => void;
  history: TransferStatusResponse[];
  onComplete: (status: TransferStatusResponse) => void;
  onGoSetup: () => void;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  }
  return window.btoa(binary);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SenderProps extends Omit<TransferProps, 'role' | 'selectedFile' | 'onModeDetected'> {
  file: File;
}

const SenderWorkspace: React.FC<SenderProps> = ({
  session,
  file,
  thresholds,
  mode,
  onBusyChange,
  history,
  onComplete,
}) => {
  const [transferId, setTransferId] = useState<string | null>(null);
  const [status, setStatus] = useState<TransferStatusResponse | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentSeq, setCurrentSeq] = useState<number | undefined>(undefined);
  const [switchedAt, setSwitchedAt] = useState<number | null>(null);
  const [profile, setProfile] = useState('normal_wifi');
  const [corruption, setCorruption] = useState(0);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [throughput, setThroughput] = useState<number[]>([]);
  const [resetKey, setResetKey] = useState(0);

  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const statusRef = useRef<TransferStatusResponse | null>(null);
  const corruptionRef = useRef(0);
  const eventIdRef = useRef(0);
  const seenSwitchesRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  corruptionRef.current = corruption;

  const addEvent = useCallback((text: string, kind?: LogEvent['kind']) => {
    setEvents((prev) => [{ id: ++eventIdRef.current, t: Date.now(), text, kind }, ...prev].slice(0, 60));
  }, []);

  const applyStatus = useCallback((s: TransferStatusResponse) => {
    statusRef.current = s;
    setStatus(s);
    setThroughput((prev) => [...prev, s.network_metrics.throughput_mbps].slice(-40));

    const switches = s.resume_info?.switch_history ?? [];
    if (switches.length > seenSwitchesRef.current) {
      for (const ev of switches.slice(seenSwitchesRef.current)) {
        const at = ev.at_chunk ?? ev.resume_chunk ?? 0;
        setSwitchedAt(at);
        addEvent(`Wi-Fi crossed a threshold. Moved to Bluetooth, resuming at chunk ${at}`, 'bt');
      }
      seenSwitchesRef.current = switches.length;
    }

    if (s.is_complete && !completedRef.current) {
      completedRef.current = true;
      addEvent('All chunks verified. File reassembled.', 'ok');
      onCompleteRef.current(s);
    }
  }, [addEvent]);

  // 1. open a transfer on the backend whenever the file, mode or reset changes
  useEffect(() => {
    if (!session) return;
    let alive = true;
    cancelledRef.current = true;
    completedRef.current = false;
    seenSwitchesRef.current = 0;
    statusRef.current = null;
    setTransferId(null);
    setStatus(null);
    setSwitchedAt(null);
    setCurrentSeq(undefined);
    setThroughput([]);
    setEvents([]);
    setProfile(mode === 'without_wifi' ? 'bluetooth' : 'normal_wifi');

    api
      .initTransfer(session.session_id, file.name, file.size, CHUNK_SIZE, undefined, mode)
      .then(async (init) => {
        if (!alive) return;
        setTransferId(init.transfer_id);
        const s = await api.getTransferStatus(init.transfer_id);
        if (!alive) return;
        applyStatus(s);
        addEvent(
          `Transfer ready: ${init.total_chunks} chunks, ${mode === 'without_wifi' ? 'Bluetooth only' : 'starting on Wi-Fi'}`
        );
      })
      .catch((err) => alive && addEvent(`Could not reach the backend: ${err.message}`, 'bad'));

    return () => {
      alive = false;
      cancelledRef.current = true;
    };
  }, [session, file, mode, resetKey, applyStatus, addEvent]);

  // 2. poll
  useEffect(() => {
    if (!transferId) return;
    const id = setInterval(async () => {
      try {
        applyStatus(await api.getTransferStatus(transferId));
      } catch {
        /* transient; next tick retries */
      }
    }, 800);
    return () => clearInterval(id);
  }, [transferId, applyStatus]);

  // 3. keep the backend in sync with the thresholds chosen in the dialog
  useEffect(() => {
    if (transferId && mode === 'with_wifi') api.updateThresholds(thresholds, transferId).catch(() => {});
  }, [transferId, thresholds, mode]);

  const busy = isTransferring || ((status?.completed_chunks ?? 0) > 0 && !status?.is_complete);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const handleStart = async () => {
    if (!transferId || runningRef.current) return;
    runningRef.current = true;
    cancelledRef.current = false;
    setIsTransferring(true);

    try {
      const resumed = (statusRef.current?.completed_chunks ?? 0) > 0;
      const plan = await api.resumeTransfer(transferId);
      addEvent(
        resumed
          ? `Resumed at chunk ${plan.resume_from_chunk}, ${plan.missing_chunks.length} left`
          : `Started, ${plan.missing_chunks.length} chunks to send`,
        'ok'
      );

      for (const seq of plan.missing_chunks) {
        if (cancelledRef.current) break;
        setCurrentSeq(seq);

        const start = seq * CHUNK_SIZE;
        const bytes = new Uint8Array(await file.slice(start, Math.min(start + CHUNK_SIZE, file.size)).arrayBuffer());
        const crc = calculateCRC32(bytes);

        let accepted = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelledRef.current; attempt++) {
          let payload = bytes;
          if (attempt === 1 && bytes.length > 0 && Math.random() * 100 < corruptionRef.current) {
            payload = bytes.slice();
            payload[0] ^= 0xff;
          }
          const res = await api.sendChunk(transferId, seq, crc, toBase64(payload));
          if (res.is_valid) {
            accepted = true;
            break;
          }
          addEvent(`Chunk ${seq} failed CRC32 (attempt ${attempt}). Sending it again.`, 'warn');
        }
        if (!accepted && !cancelledRef.current) throw new Error(`Chunk ${seq} was rejected ${MAX_ATTEMPTS} times`);

        // On Wi-Fi a short pause keeps the UI responsive. Bluetooth pacing is applied by the backend.
        if (statusRef.current?.active_channel !== 'bluetooth') await sleep(12);
      }

      const final = await api.getTransferStatus(transferId);
      applyStatus(final);
      if (cancelledRef.current && !final.is_complete) {
        addEvent(`Paused. ${final.completed_chunks} of ${final.total_chunks} chunks verified.`);
      }
    } catch (err) {
      addEvent(err instanceof Error ? err.message : 'Transfer failed', 'bad');
    } finally {
      runningRef.current = false;
      setCurrentSeq(undefined);
      setIsTransferring(false);
    }
  };

  const handlePause = () => {
    cancelledRef.current = true;
  };

  const handleProfile = async (
    next: string,
    params?: { throughput_mbps?: number; rtt_ms?: number; packet_loss_percent?: number }
  ) => {
    if (!transferId) return;
    try {
      await api.simulateNetwork(next, transferId, params);
      setProfile(next);
      addEvent(`Test condition: ${next.replace('_', ' ')}`, next === 'degraded_wifi' ? 'warn' : undefined);
    } catch (err) {
      addEvent(err instanceof Error ? err.message : 'Could not apply profile', 'bad');
    }
  };

  const handleManualSwitch = async () => {
    if (!transferId || !status) return;
    const target = status.active_channel === 'wifi' ? 'bluetooth' : 'wifi';
    try {
      await api.switchChannel(target, transferId, status.last_contiguous_chunk, 'Manual switch');
      if (target === 'bluetooth') setSwitchedAt(status.last_contiguous_chunk + 1);
      else {
        setSwitchedAt(null);
        setProfile('normal_wifi');
      }
      addEvent(`Switched to ${target === 'wifi' ? 'Wi-Fi' : 'Bluetooth'} by hand`, target === 'bluetooth' ? 'bt' : 'ok');
    } catch (err) {
      addEvent(err instanceof Error ? err.message : 'Switch failed', 'bad');
    }
  };

  const activeChannel = status?.active_channel ?? MODES[mode].channel;
  const total = status?.total_chunks ?? Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  return (
    <div className="container page">
      <div className="filehead">
        <div>
          <div className="eyebrow">
            {MODES[mode].label} · session {session?.session_id.toUpperCase()}
          </div>
          <h1>{file.name}</h1>
          <p className="muted small">
            {formatBytes(file.size)} · {total} chunks of 64 KB
          </p>
        </div>
        <span className={`tag ${mode === 'with_wifi' ? 'tag--wifi' : 'tag--bt'}`}>
          {mode === 'with_wifi' ? 'Wi-Fi with Bluetooth fallback' : 'Bluetooth only'}
        </span>
      </div>

      <div className="workspace">
        <div className="stack">
          <TransferPanel
            transferStatus={status}
            isTransferring={isTransferring}
            mode={mode}
            fileSize={file.size}
            onStart={handleStart}
            onPause={handlePause}
            onReset={() => setResetKey((k) => k + 1)}
            onDownload={() => transferId && window.open(api.getDownloadUrl(transferId), '_blank')}
          />
          <ChunkVisualizer
            totalChunks={total}
            missingChunks={status?.resume_info?.missing_chunks ?? Array.from({ length: total }, (_, i) => i)}
            retriedChunks={status?.retransmission_stats?.retried_chunks.map((r) => r.seq_num) ?? []}
            currentSeq={currentSeq}
            switchedAtChunk={switchedAt}
            lastContiguousChunk={status?.last_contiguous_chunk ?? -1}
            mode={mode}
          />
          <TransferHistory history={history} onDownload={(id) => window.open(api.getDownloadUrl(id), '_blank')} />
        </div>

        <div className="stack">
          <LinkPanel
            mode={mode}
            metrics={status?.network_metrics ?? null}
            thresholds={thresholds}
            activeChannel={activeChannel}
            channelInfo={status?.channel_info}
            throughputHistory={throughput}
            onManualSwitch={mode === 'with_wifi' ? handleManualSwitch : undefined}
          />
          <SimulationControls
            mode={mode}
            currentProfile={profile}
            onApplyProfile={handleProfile}
            corruptionPercent={corruption}
            onCorruptionChange={setCorruption}
          />
          <EventLog events={events} />
        </div>
      </div>
    </div>
  );
};

export const Transfer: React.FC<TransferProps> = (props) => {
  const { role, selectedFile, session, onModeDetected, onGoSetup, ...rest } = props;

  if (role === 'receiver') {
    return (
      <div className="container page">
        <ReceiverView session={session} onModeDetected={onModeDetected} />
      </div>
    );
  }

  if (!selectedFile) {
    return (
      <div className="container page">
        <div className="empty">
          <h1 className="h1">No file chosen</h1>
          <p className="muted" style={{ margin: '8px 0 20px' }}>
            Pick a mode and a file on the setup page first.
          </p>
          <button type="button" className="btn btn--primary" onClick={onGoSetup}>Go to setup</button>
        </div>
      </div>
    );
  }

  return <SenderWorkspace {...rest} session={session} file={selectedFile} onGoSetup={onGoSetup} />;
};
