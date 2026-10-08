import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { ChannelInfo, NetworkMetrics, ThresholdConfig, TransferMode } from '../types';

interface LinkPanelProps {
  mode: TransferMode;
  metrics: NetworkMetrics | null;
  thresholds: ThresholdConfig;
  activeChannel: 'wifi' | 'bluetooth';
  channelInfo?: ChannelInfo;
  throughputHistory: number[];
  onManualSwitch?: () => void;
}

const Sparkline: React.FC<{ values: number[]; limit?: number }> = ({ values, limit }) => {
  if (values.length < 2) return <svg className="spark" aria-hidden />;
  const max = Math.max(...values, limit ?? 0, 1) * 1.1;
  const w = 100;
  const h = 40;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - (v / max) * h;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Throughput over the last few seconds">
      {limit !== undefined && <line x1="0" x2={w} y1={y(limit)} y2={y(limit)} />}
      <path d={d} />
    </svg>
  );
};

export const LinkPanel: React.FC<LinkPanelProps> = ({
  mode,
  metrics,
  thresholds,
  activeChannel,
  channelInfo,
  throughputHistory,
  onManualSwitch,
}) => {
  const btOnly = mode === 'without_wifi';
  const judged = !btOnly && activeChannel === 'wifi';

  const throughput = metrics?.throughput_mbps;
  const rtt = metrics?.rtt_ms;
  const loss = metrics?.packet_loss_percent;
  const jitter = metrics?.jitter_ms;

  const fmt = (v: number | undefined, digits = 1) => (v === undefined ? '–' : v.toFixed(digits));

  const rows: { label: string; value: string; unit: string; limit: string; breach: boolean }[] = [
    {
      label: 'Throughput',
      value: fmt(throughput),
      unit: 'Mbps',
      limit: judged ? `min ${thresholds.min_wifi_throughput_mbps}` : btOnly ? 'cap 2.0' : '',
      breach: judged && throughput !== undefined && throughput < thresholds.min_wifi_throughput_mbps,
    },
    {
      label: 'Round trip',
      value: fmt(rtt, 0),
      unit: 'ms',
      limit: judged ? `max ${thresholds.max_wifi_rtt_ms}` : '',
      breach: judged && rtt !== undefined && rtt > thresholds.max_wifi_rtt_ms,
    },
    {
      label: 'Packet loss',
      value: fmt(loss),
      unit: '%',
      limit: judged ? `max ${thresholds.max_wifi_packet_loss_percent}` : '',
      breach: judged && loss !== undefined && loss > thresholds.max_wifi_packet_loss_percent,
    },
    { label: 'Jitter', value: fmt(jitter), unit: 'ms', limit: '', breach: false },
  ];

  const channelLabel = activeChannel === 'wifi' ? 'Wi-Fi' : 'Bluetooth';
  const bt = channelInfo?.bluetooth_status;

  return (
    <section className="panel" aria-label="Link">
      <div className="panel__head">
        <h2 className="h2">Link</h2>
        <span className={`tag ${activeChannel === 'wifi' ? 'tag--wifi' : 'tag--bt'}`}>{channelLabel}</span>
      </div>
      <div className="panel__body">
        <table className="rows">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} data-breach={r.breach}>
                <th scope="row">{r.label}</th>
                <td className="value">
                  {r.value} <span className="faint">{r.unit}</span>
                </td>
                <td className="limit">{r.limit}</td>
                <td className="state">{judged && r.limit ? (r.breach ? 'Breach' : 'OK') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="eyebrow" style={{ marginTop: 14 }}>Throughput, recent samples</div>
        <Sparkline values={throughputHistory} limit={judged ? thresholds.min_wifi_throughput_mbps : undefined} />

        {btOnly && (
          <dl className="spec" style={{ marginTop: 14 }}>
            <dt>Device</dt>
            <dd>{bt?.paired_device ?? 'Mobile (nearby)'}</dd>
            <dt>Profile</dt>
            <dd>{bt?.profile ?? 'Bluetooth 5.0 High Speed'}</dd>
            <dt>Wi-Fi</dt>
            <dd>Not used</dd>
          </dl>
        )}

        {btOnly && (
          <p className="xs faint" style={{ marginTop: 12 }}>
            Browsers cannot open raw Bluetooth sockets, so the radio is emulated. Chunks are paced to
            Bluetooth 5.0 speed (about 2 Mbps) and the numbers above come from that profile.
          </p>
        )}

        {!btOnly && onManualSwitch && (
          <button type="button" className="btn btn--sm" style={{ marginTop: 14 }} onClick={onManualSwitch}>
            <ArrowRightLeft size={14} /> Switch to {activeChannel === 'wifi' ? 'Bluetooth' : 'Wi-Fi'}
          </button>
        )}
      </div>
    </section>
  );
};
