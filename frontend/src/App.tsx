import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { ThresholdSettingsModal } from './components/ThresholdSettingsModal';
import { Home } from './pages/Home';
import { Transfer } from './pages/Transfer';
import { Experiments } from './pages/Experiments';
import { Page, Role, SessionResponse, ThresholdConfig, TransferMode, TransferStatusResponse } from './types';
import * as api from './services/api';

const params = new URLSearchParams(window.location.search);

// On localhost the backend's LAN link (http://<laptop-ip>:5173/...) is what a phone can reach.
// Anywhere else (a hosted domain) the receiver link must use the address this page was opened on.
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const withReceiverLink = (s: SessionResponse): SessionResponse =>
  isLocalHost ? s : { ...s, join_url: `${window.location.origin}/transfer?session=${s.session_id}&role=receiver` };

export const App: React.FC = () => {
  const [page, setPage] = useState<Page>(params.get('session') ? 'transfer' : 'home');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [sessionProblem, setSessionProblem] = useState<'unreachable' | 'expired' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role>(params.get('role') === 'receiver' ? 'receiver' : 'sender');
  const [mode, setMode] = useState<TransferMode>(
    params.get('mode') === 'without_wifi' || params.get('mode') === 'bt_only' ? 'without_wifi' : 'with_wifi'
  );
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TransferStatusResponse[]>([]);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [thresholds, setThresholds] = useState<ThresholdConfig>({
    min_wifi_throughput_mbps: 5.0,
    max_wifi_rtt_ms: 200.0,
    max_wifi_packet_loss_percent: 5.0,
  });

  // One session for the lifetime of the page (or the one named in the QR link).
  useEffect(() => {
    const existing = params.get('session');
    (existing ? api.getSession(existing) : api.createSession('Laptop (Sender)'))
      .then((s) => setSession(withReceiverLink(s)))
      .catch((err) => {
        console.warn('Session init failed:', err);
        setSessionProblem(err instanceof api.SessionNotFoundError ? 'expired' : 'unreachable');
      });
  }, []);

  const handleComplete = useCallback((status: TransferStatusResponse) => {
    setHistory((prev) => (prev.some((t) => t.transfer_id === status.transfer_id) ? prev : [status, ...prev]));
  }, []);

  const handleSaveThresholds = (next: ThresholdConfig) => setThresholds(next);

  const modeLocked = busy || (role === 'receiver' && page === 'transfer');

  return (
    <div className="app" data-mode={mode}>
      <Header
        currentPage={page}
        onNavigate={setPage}
        mode={mode}
        onModeChange={setMode}
        modeLocked={modeLocked}
        onOpenThresholds={() => setThresholdsOpen(true)}
      />

      <main style={{ flex: 1 }}>
        {sessionProblem && page !== 'experiments' && (
          <div className="container" style={{ paddingTop: 20 }}>
            <p className="notice notice--warn">
              {sessionProblem === 'expired' ? (
                <>
                  This session no longer exists. The sender reloaded their page or the backend was restarted. Ask the
                  sender for a new receiver link, or{' '}
                  <a href="/">start a new session here</a>.
                </>
              ) : (
                <>
                  Cannot reach the backend on port 8000. Start it with <span className="mono">python main.py</span> in
                  the backend folder, then reload.
                </>
              )}
            </p>
          </div>
        )}

        {page === 'home' && (
          <Home
            session={session}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onContinue={() => setPage('transfer')}
            role={role}
            onRoleChange={setRole}
            transferMode={mode}
            onTransferModeChange={setMode}
          />
        )}

        {page === 'transfer' && (
          <Transfer
            session={session}
            selectedFile={selectedFile}
            thresholds={thresholds}
            role={role}
            mode={mode}
            onModeDetected={setMode}
            onBusyChange={setBusy}
            history={history}
            onComplete={handleComplete}
            onGoSetup={() => setPage('home')}
          />
        )}

        {page === 'experiments' && <Experiments />}
      </main>

      <ThresholdSettingsModal
        isOpen={thresholdsOpen}
        onClose={() => setThresholdsOpen(false)}
        thresholds={thresholds}
        onSave={handleSaveThresholds}
      />

      <footer className="footer">
        <div className="container">SmartShare · Computer Networks project · chunked transfer with CRC32, selective retransmission and checkpoint resume</div>
      </footer>
    </div>
  );
};

export default App;
