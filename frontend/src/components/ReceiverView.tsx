import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { SessionResponse, TransferMode, TransferStatusResponse } from '../types';
import { formatBytes } from '../lib/format';
import * as api from '../services/api';

interface ReceiverViewProps {
  session: SessionResponse | null;
  onModeDetected: (mode: TransferMode) => void;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({ session, onModeDetected }) => {
  const [status, setStatus] = useState<TransferStatusResponse | null>(null);
  const sessionId = session?.session_id;

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.getSession(sessionId);
        if (!alive || !s.active_transfer_id) return;
        const t = await api.getTransferStatus(s.active_transfer_id);
        if (!alive) return;
        setStatus(t);
        if (t.transfer_mode) onModeDetected(t.transfer_mode);
      } catch {
        /* sender not reachable yet; keep polling */
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sessionId, onModeDetected]);

  if (!status) {
    return (
      <div className="empty">
        <h1 className="h1">Waiting for the sender</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Session <span className="mono">{sessionId?.toUpperCase() ?? '…'}</span> is open. This page updates by
          itself when a file starts coming in.
        </p>
      </div>
    );
  }

  const channel = status.active_channel;
  const bt = status.transfer_mode === 'without_wifi';

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="eyebrow">Incoming file</div>
      <h1 className="h1" style={{ wordBreak: 'break-all', marginTop: 4 }}>{status.file_name}</h1>
      <p className="muted small" style={{ marginTop: 4 }}>
        {formatBytes(status.file_size)} · {status.total_chunks} chunks ·{' '}
        <span className={`tag ${channel === 'wifi' ? 'tag--wifi' : 'tag--bt'}`}>
          {bt ? 'Bluetooth only' : channel === 'wifi' ? 'Wi-Fi' : 'Wi-Fi, moved to Bluetooth'}
        </span>
      </p>

      <div className="readout" style={{ marginTop: 28 }}>
        <span className="readout__pct">{status.progress_percent.toFixed(1)}</span>
        <span className="muted" style={{ fontSize: '1.2rem' }}>%</span>
      </div>
      <div className="bar">
        <div className="bar__fill" data-channel={channel} data-done={status.is_complete} style={{ width: `${status.progress_percent}%` }} />
      </div>
      <div className="meta-row">
        <span>{status.completed_chunks} of {status.total_chunks} chunks verified</span>
        <span>{status.retransmission_stats.total_retransmissions} retries</span>
      </div>
      <p className={`notice notice--${status.is_complete ? 'ok' : 'info'}`}>{status.status_banner}</p>

      {status.is_complete && (
        <div className="actions">
          <a className="btn btn--primary" href={api.getDownloadUrl(status.transfer_id)}>
            <Download size={15} /> Save file
          </a>
        </div>
      )}
    </div>
  );
};
