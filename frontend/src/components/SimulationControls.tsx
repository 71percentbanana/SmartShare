import React, { useState } from 'react';
import { TransferMode } from '../types';

interface CustomParams {
  throughput_mbps?: number;
  rtt_ms?: number;
  packet_loss_percent?: number;
}

interface SimulationControlsProps {
  mode: TransferMode;
  currentProfile: string;
  onApplyProfile: (profile: string, params?: CustomParams) => void;
  corruptionPercent: number;
  onCorruptionChange: (percent: number) => void;
}

const PROFILES = [
  { id: 'normal_wifi', name: 'Healthy Wi-Fi', spec: '45 Mbps · 20 ms · 0.2%' },
  { id: 'degraded_wifi', name: 'Degraded Wi-Fi', spec: '2.5 Mbps · 260 ms · 10%' },
];

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  mode,
  currentProfile,
  onApplyProfile,
  corruptionPercent,
  onCorruptionChange,
}) => {
  const [throughput, setThroughput] = useState(45);
  const [rtt, setRtt] = useState(25);
  const [loss, setLoss] = useState(0.2);

  return (
    <section className="panel" aria-label="Test conditions">
      <div className="panel__head">
        <h2 className="h2">Test conditions</h2>
        <span className="xs faint">for demos</span>
      </div>
      <div className="panel__body">
        {mode === 'with_wifi' && (
          <>
            <div className="profiles">
              {PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="profile"
                  aria-pressed={currentProfile === p.id}
                  onClick={() => onApplyProfile(p.id)}
                >
                  <span className="profile__name">{p.name}</span>
                  <span className="profile__spec">{p.spec}</span>
                </button>
              ))}
            </div>

            <details style={{ marginTop: 10 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Custom Wi-Fi values</summary>
              <div className="slider">
                <label htmlFor="sim-tp">Throughput</label>
                <output>{throughput} Mbps</output>
                <input id="sim-tp" type="range" min="1" max="80" value={throughput} onChange={(e) => setThroughput(Number(e.target.value))} />
              </div>
              <div className="slider">
                <label htmlFor="sim-rtt">Round trip</label>
                <output>{rtt} ms</output>
                <input id="sim-rtt" type="range" min="10" max="400" value={rtt} onChange={(e) => setRtt(Number(e.target.value))} />
              </div>
              <div className="slider">
                <label htmlFor="sim-loss">Packet loss</label>
                <output>{loss.toFixed(1)}%</output>
                <input id="sim-loss" type="range" min="0" max="25" step="0.5" value={loss} onChange={(e) => setLoss(Number(e.target.value))} />
              </div>
              <button
                type="button"
                className="btn btn--sm"
                style={{ marginTop: 12 }}
                onClick={() => onApplyProfile('manual', { throughput_mbps: throughput, rtt_ms: rtt, packet_loss_percent: loss })}
              >
                Apply
              </button>
            </details>
          </>
        )}

        <div className="slider" style={{ marginTop: mode === 'with_wifi' ? 18 : 0, paddingTop: mode === 'with_wifi' ? 14 : 0, borderTop: mode === 'with_wifi' ? '1px solid var(--line)' : 'none' }}>
          <label htmlFor="sim-corrupt">Corrupt chunks in transit</label>
          <output>{corruptionPercent}%</output>
          <input
            id="sim-corrupt"
            type="range"
            min="0"
            max="30"
            value={corruptionPercent}
            onChange={(e) => onCorruptionChange(Number(e.target.value))}
          />
        </div>
        <p className="xs faint" style={{ marginTop: 6 }}>
          Flips a byte in some chunks after the checksum is computed. The receiver rejects them and only those
          chunks are sent again.
        </p>
      </div>
    </section>
  );
};
