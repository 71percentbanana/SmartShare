import React from 'react';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';
import { TransferMode, TransferStatusResponse } from '../types';
import { formatBytes } from '../lib/format';

interface TransferPanelProps {
  transferStatus: TransferStatusResponse | null;
  isTransferring: boolean;
  mode: TransferMode;
  fileSize: number;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onDownload: () => void;
}

export const TransferPanel: React.FC<TransferPanelProps> = ({
  transferStatus,
  isTransferring,
  mode,
  fileSize,
  onStart,
  onPause,
  onReset,
  onDownload,
}) => {
  const progress = transferStatus?.progress_percent ?? 0;
  const done = transferStatus?.is_complete ?? false;
  const completed = transferStatus?.completed_chunks ?? 0;
  const total = transferStatus?.total_chunks ?? 0;
  const channel = transferStatus?.active_channel ?? (mode === 'without_wifi' ? 'bluetooth' : 'wifi');
  const chunkSize = transferStatus?.chunk_size ?? 65536;
  const sentBytes = Math.min(fileSize, completed * chunkSize);

  const banner =
    transferStatus?.status_banner ??
    (mode === 'without_wifi' ? 'Ready. This transfer will use Bluetooth only.' : 'Ready. This transfer will start on Wi-Fi.');
  const lowered = banner.toLowerCase();
  const noticeKind = done ? 'ok' : lowered.includes('degraded') || lowered.includes('switched') ? 'warn' : 'info';

  return (
    <section className="panel" aria-label="Progress">
      <div className="panel__body">
        <div className="readout">
          <span className="readout__pct">{progress.toFixed(1)}</span>
          <span className="muted" style={{ fontSize: '1.2rem' }}>%</span>
          <span style={{ marginLeft: 'auto' }}>
            {done ? (
              <span className="tag tag--ok">Verified</span>
            ) : isTransferring ? (
              <span className={`tag tag--live ${channel === 'wifi' ? 'tag--wifi' : 'tag--bt'}`}>
                Sending over {channel === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}
              </span>
            ) : completed > 0 ? (
              <span className="tag">Paused</span>
            ) : (
              <span className="tag">Ready</span>
            )}
          </span>
        </div>

        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="bar__fill" data-channel={channel} data-done={done} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>

        <div className="meta-row">
          <span>{completed} of {total} chunks verified</span>
          <span className="mono">{formatBytes(sentBytes)} / {formatBytes(fileSize)}</span>
        </div>

        <p className={`notice notice--${noticeKind}`}>{banner}</p>

        <div className="actions">
          {!done && !isTransferring && (
            <button type="button" className="btn btn--primary" onClick={onStart} disabled={!transferStatus}>
              <Play size={15} /> {completed > 0 ? 'Resume' : 'Start transfer'}
            </button>
          )}
          {isTransferring && (
            <button type="button" className="btn" onClick={onPause}>
              <Pause size={15} /> Pause
            </button>
          )}
          {!isTransferring && completed > 0 && (
            <button type="button" className="btn btn--quiet" onClick={onReset}>
              <RotateCcw size={15} /> Start over
            </button>
          )}
          {done && (
            <button type="button" className="btn btn--primary" onClick={onDownload}>
              <Download size={15} /> Download file
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
