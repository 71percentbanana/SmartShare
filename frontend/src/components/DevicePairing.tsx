import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy } from 'lucide-react';
import { SessionResponse, TransferMode } from '../types';

interface DevicePairingProps {
  session: SessionResponse | null;
  mode: TransferMode;
}

export const DevicePairing: React.FC<DevicePairingProps> = ({ session, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && session?.join_url) {
      QRCode.toCanvas(
        canvasRef.current,
        session.join_url,
        { width: 280, margin: 0, color: { dark: '#1b1a17', light: '#ffffff' } },
        (err) => err && console.error('QR render error:', err)
      );
    }
  }, [session?.join_url]);

  if (!session) return <p className="muted">Creating session…</p>;

  const copy = () => {
    navigator.clipboard
      .writeText(session.join_url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const devices = session.devices?.length ? session.devices : ['Laptop (Sender)'];

  return (
    <div className="pair">
      <div className="qr">
        <canvas ref={canvasRef} aria-label="QR code for the receiver link" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div>
          <div className="eyebrow">Session code</div>
          <div className="mono" style={{ fontSize: '1.5rem', letterSpacing: '0.12em', fontWeight: 500 }}>
            {session.session_id.toUpperCase()}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Receiver link</div>
          <div className="field">
            <input className="input" readOnly value={session.join_url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn--sm" onClick={copy} style={{ height: 34 }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="xs faint" style={{ marginTop: 6 }}>
            {mode === 'without_wifi'
              ? 'Open this on the receiving device once to pair. The transfer itself is held to Bluetooth speed and never switches to Wi-Fi.'
              : 'Scan the code or open the link on the receiving device. Both devices need to be on the same network.'}
          </p>
        </div>

        <div>
          <div className="eyebrow">Connected ({devices.length})</div>
          <ul className="devices">
            {devices.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
