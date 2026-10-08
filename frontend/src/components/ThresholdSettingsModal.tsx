import React, { useEffect, useState } from 'react';
import { ThresholdConfig } from '../types';

interface ThresholdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  thresholds: ThresholdConfig;
  onSave: (config: ThresholdConfig) => void;
}

const DEFAULTS: ThresholdConfig = {
  min_wifi_throughput_mbps: 5,
  max_wifi_rtt_ms: 200,
  max_wifi_packet_loss_percent: 5,
};

export const ThresholdSettingsModal: React.FC<ThresholdSettingsModalProps> = ({
  isOpen,
  onClose,
  thresholds,
  onSave,
}) => {
  const [draft, setDraft] = useState<ThresholdConfig>(thresholds);

  useEffect(() => {
    if (isOpen) setDraft(thresholds);
  }, [isOpen, thresholds]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const set = (key: keyof ThresholdConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: Number(e.target.value) }));

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="thr-title">
        <h2 className="h2" id="thr-title">Fallback thresholds</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Wi-Fi hands over to Bluetooth when any one of these is crossed.
        </p>

        <code>
          {`throughput < ${draft.min_wifi_throughput_mbps} Mbps\n  or rtt > ${draft.max_wifi_rtt_ms} ms\n  or loss > ${draft.max_wifi_packet_loss_percent}%`}
        </code>

        <label className="num-field">
          <span>Minimum throughput (Mbps)</span>
          <input
            className="input"
            type="number"
            min="0.5"
            max="50"
            step="0.5"
            value={draft.min_wifi_throughput_mbps}
            onChange={set('min_wifi_throughput_mbps')}
          />
        </label>
        <label className="num-field">
          <span>Maximum round trip (ms)</span>
          <input
            className="input"
            type="number"
            min="20"
            max="1000"
            step="10"
            value={draft.max_wifi_rtt_ms}
            onChange={set('max_wifi_rtt_ms')}
          />
        </label>
        <label className="num-field">
          <span>Maximum packet loss (%)</span>
          <input
            className="input"
            type="number"
            min="1"
            max="30"
            step="0.5"
            value={draft.max_wifi_packet_loss_percent}
            onChange={set('max_wifi_packet_loss_percent')}
          />
        </label>

        <div className="dialog__foot">
          <button type="button" className="btn btn--quiet" onClick={() => setDraft(DEFAULTS)}>
            Reset
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
