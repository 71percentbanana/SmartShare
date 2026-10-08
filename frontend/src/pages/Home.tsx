import React from 'react';
import { ArrowRight, Bluetooth, Wifi } from 'lucide-react';
import { FileUploader } from '../components/FileUploader';
import { DevicePairing } from '../components/DevicePairing';
import { MODES } from '../lib/modes';
import { formatBytes } from '../lib/format';
import { Role, SessionResponse, TransferMode } from '../types';

interface HomeProps {
  session: SessionResponse | null;
  selectedFile: File | null;
  onSelectFile: (file: File) => void;
  onContinue: () => void;
  role: Role;
  onRoleChange: (role: Role) => void;
  transferMode: TransferMode;
  onTransferModeChange: (mode: TransferMode) => void;
}

const ModeChoice: React.FC<{
  mode: TransferMode;
  selected: boolean;
  onSelect: () => void;
}> = ({ mode, selected, onSelect }) => {
  const info = MODES[mode];
  const Icon = mode === 'with_wifi' ? Wifi : Bluetooth;
  return (
    <button type="button" role="radio" aria-checked={selected} data-mode={mode} className="mode" onClick={onSelect}>
      <span className="mode__top">
        <span className="mode__icon"><Icon size={18} /></span>
        <span className="mode__title">{info.label}</span>
        <span className="mode__radio" aria-hidden />
      </span>
      <span className="mode__text">{info.summary}</span>
      <dl className="spec">
        {info.rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </button>
  );
};

export const Home: React.FC<HomeProps> = ({
  session,
  selectedFile,
  onSelectFile,
  onContinue,
  role,
  onRoleChange,
  transferMode,
  onTransferModeChange,
}) => {
  const sending = role === 'sender';
  const chunks = selectedFile ? Math.max(1, Math.ceil(selectedFile.size / 65536)) : 0;

  return (
    <div className="container page">
      <div className="page__head">
        <h1 className="h1">{sending ? 'Send a file to another device' : 'Receive a file'}</h1>
        <p className="muted">
          {sending
            ? 'Pick how the two devices are connected, choose a file, then pair the receiver.'
            : 'This device will show the incoming file as the sender transfers it.'}
        </p>
        <div className="seg" role="radiogroup" aria-label="This device" style={{ marginTop: 16 }}>
          <button type="button" role="radio" aria-checked={sending} onClick={() => onRoleChange('sender')}>Sending</button>
          <button type="button" role="radio" aria-checked={!sending} onClick={() => onRoleChange('receiver')}>Receiving</button>
        </div>
      </div>

      {sending && (
        <section className="step">
          <div className="step__label">
            <span className="eyebrow">01</span>
            <h2 className="h2">Connection</h2>
            <p>Two modes. You can change this until a transfer starts.</p>
          </div>
          <div className="modes" role="radiogroup" aria-label="Connection mode">
            <ModeChoice mode="with_wifi" selected={transferMode === 'with_wifi'} onSelect={() => onTransferModeChange('with_wifi')} />
            <ModeChoice mode="without_wifi" selected={transferMode === 'without_wifi'} onSelect={() => onTransferModeChange('without_wifi')} />
          </div>
        </section>
      )}

      {sending && (
        <section className="step">
          <div className="step__label">
            <span className="eyebrow">02</span>
            <h2 className="h2">File</h2>
          </div>
          <FileUploader onFileSelected={onSelectFile} selectedFile={selectedFile} />
        </section>
      )}

      <section className="step">
        <div className="step__label">
          <span className="eyebrow">{sending ? '03' : '01'}</span>
          <h2 className="h2">Receiving device</h2>
        </div>
        <DevicePairing session={session} mode={transferMode} />
      </section>

      {sending && (
        <div className="launch">
          <div className="small muted">
            {selectedFile ? (
              <>
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{selectedFile.name}</span> · {formatBytes(selectedFile.size)} ·{' '}
                {chunks} chunks · {MODES[transferMode].label}
              </>
            ) : (
              'Choose a file to continue.'
            )}
          </div>
          <button type="button" className="btn btn--primary" disabled={!selectedFile} onClick={onContinue}>
            Open transfer <ArrowRight size={16} />
          </button>
        </div>
      )}

      {!sending && (
        <div className="launch">
          <span className="small muted">Keep this page open on the receiving device.</span>
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            Open receiver <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
