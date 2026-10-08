import React from 'react';
import { Download } from 'lucide-react';
import { TransferStatusResponse } from '../types';
import { formatBytes } from '../lib/format';

interface TransferHistoryProps {
  history: TransferStatusResponse[];
  onDownload: (transferId: string) => void;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({ history, onDownload }) => {
  if (history.length === 0) return null;

  return (
    <section className="panel" aria-label="Completed transfers">
      <div className="panel__head">
        <h2 className="h2">Completed this session</h2>
      </div>
      <div className="panel__body">
        <ul className="history">
          {history.map((t) => {
            const handovers = t.resume_info?.switch_history?.length ?? 0;
            const retries = t.retransmission_stats?.total_retransmissions ?? 0;
            const btOnly = t.transfer_mode === 'without_wifi';
            return (
              <li key={t.transfer_id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>{t.file_name}</div>
                  <div className="small muted">
                    {formatBytes(t.file_size)} · {t.total_chunks} chunks ·{' '}
                    {btOnly ? 'Bluetooth only' : handovers > 0 ? `moved to Bluetooth (${handovers}×)` : 'Wi-Fi throughout'} ·{' '}
                    {retries} {retries === 1 ? 'retry' : 'retries'}
                  </div>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => onDownload(t.transfer_id)}>
                  <Download size={14} /> Download
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
