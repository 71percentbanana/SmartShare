import React, { useEffect, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { BenchmarkResult } from '../types';
import * as api from '../services/api';

type Tab = 'charts' | 'table' | 'notes';

const barKind = (id: string): string => {
  if (id === 'degraded_wifi') return 'bad';
  if (id === 'normal_bt') return 'bt';
  if (id === 'smartshare_adaptive' || id === 'normal_wifi') return 'wifi';
  return '';
};

const HBars: React.FC<{
  rows: { id: string; name: string; value: number; label: string }[];
}> = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.id}>
          <div className="hbar__top">
            <span style={{ fontWeight: r.id === 'smartshare_adaptive' ? 600 : 400 }}>{r.name}</span>
            <span className="mono">{r.label}</span>
          </div>
          <div className="hbar__track">
            <div className="hbar__fill" data-k={barKind(r.id)} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const download = (href: string, name: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
};

export const Experiments: React.FC = () => {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [sizeMb, setSizeMb] = useState(10);
  const [tab, setTab] = useState<Tab>('charts');
  const [error, setError] = useState<string | null>(null);

  const runAll = async (size: number) => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.runBenchmark(undefined, size);
      if (res.all_scenarios) setResults(res.all_scenarios);
    } catch {
      setError('Could not reach the backend to run the benchmark.');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runAll(10);
  }, []);

  const rerun = async (id: string) => {
    try {
      const res = await api.runBenchmark(id, sizeMb);
      if (res.scenario) setResults((prev) => prev.map((r) => (r.scenario_id === id ? res.scenario! : r)));
    } catch {
      setError('Could not re-run that scenario.');
    }
  };

  const exportJSON = () =>
    download('data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results, null, 2)), `smartshare_benchmark_${sizeMb}mb.json`);

  const exportCSV = () => {
    const head = ['scenario', 'file_mb', 'chunks', 'time_s', 'retransmissions', 'recovery_ms', 'completion_pct', 'goodput_mbps', 'handover'];
    const rows = results.map((r) => [
      `"${r.scenario_name}"`, r.file_size_mb, r.total_chunks, r.total_transfer_time_s, r.retransmissions_count,
      r.recovery_resume_time_ms, r.completion_rate_percent, r.effective_goodput_mbps, r.handover_occurred,
    ]);
    download('data:text/csv;charset=utf-8,' + encodeURIComponent([head.join(','), ...rows.map((r) => r.join(','))].join('\n')), `smartshare_benchmark_${sizeMb}mb.csv`);
  };

  return (
    <div className="container page">
      <div className="page__head" style={{ maxWidth: 720 }}>
        <h1 className="h1">Benchmarks</h1>
        <p className="muted">
          Six simulated scenarios compared on the same file: healthy Wi-Fi, Bluetooth only, degraded Wi-Fi, heavy packet loss,
          an interruption, and SmartShare moving from Wi-Fi to Bluetooth. These are computed from a model, not measured on a
          live radio, and each run uses random packet loss, so numbers vary slightly.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <label className="small muted" htmlFor="bench-size">File size</label>
        <select
          id="bench-size"
          className="input"
          style={{ flex: 'none', width: 'auto', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: '0.88rem' }}
          value={sizeMb}
          onChange={(e) => setSizeMb(Number(e.target.value))}
        >
          <option value={5}>5 MB</option>
          <option value={10}>10 MB</option>
          <option value={25}>25 MB</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => runAll(sizeMb)} disabled={running}>
          <Play size={15} /> {running ? 'Running…' : 'Run all scenarios'}
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--sm" onClick={exportCSV} disabled={!results.length}><Download size={14} /> CSV</button>
          <button type="button" className="btn btn--sm" onClick={exportJSON} disabled={!results.length}><Download size={14} /> JSON</button>
        </span>
      </div>

      {error && <p className="notice notice--warn" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="tabs" role="tablist">
        {([['charts', 'Charts'], ['table', 'Table'], ['notes', 'What it shows']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ paddingTop: 24 }}>
        {tab === 'charts' && results.length > 0 && (
          <div style={{ display: 'grid', gap: 20 }}>
            <section className="panel">
              <div className="panel__head"><h2 className="h2">Total transfer time</h2><span className="xs faint">lower is better</span></div>
              <div className="panel__body">
                <HBars rows={results.map((r) => ({ id: r.scenario_id, name: r.scenario_name, value: r.total_transfer_time_s, label: `${r.total_transfer_time_s} s` }))} />
              </div>
            </section>
            <section className="panel">
              <div className="panel__head"><h2 className="h2">Retransmitted chunks</h2><span className="xs faint">lower is better</span></div>
              <div className="panel__body">
                <HBars rows={results.map((r) => ({ id: r.scenario_id, name: r.scenario_name, value: r.retransmissions_count, label: `${r.retransmissions_count}` }))} />
              </div>
            </section>
          </div>
        )}

        {tab === 'table' && results.length > 0 && (
          <section className="panel" style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="num">Time</th>
                  <th className="num">Retries</th>
                  <th className="num">Recovery</th>
                  <th className="num">Goodput</th>
                  <th>Handover</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.scenario_id} data-hl={r.scenario_id === 'smartshare_adaptive'}>
                    <td style={{ fontWeight: r.scenario_id === 'smartshare_adaptive' ? 600 : 400 }}>{r.scenario_name}</td>
                    <td className="num">{r.total_transfer_time_s} s</td>
                    <td className="num">{r.retransmissions_count}</td>
                    <td className="num">{r.recovery_resume_time_ms} ms</td>
                    <td className="num">{r.effective_goodput_mbps} Mbps</td>
                    <td>{r.handover_occurred ? `Chunk ${r.switched_at_chunk}, to Bluetooth` : <span className="faint">None</span>}</td>
                    <td><button type="button" className="btn btn--sm" onClick={() => rerun(r.scenario_id)}>Re-run</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'notes' && (
          <div className="prose">
            <h3>Why thresholds matter</h3>
            <p>
              When Wi-Fi throughput falls below about 5 Mbps, round trips stretch past 200 ms and loss climbs past 5%, a plain
              transfer spends most of its time on timeouts. Checking those three numbers and moving to a steadier channel early is
              cheaper than riding the failure out.
            </p>
            <h3>Resuming instead of restarting</h3>
            <p>
              The receiver tracks the highest chunk number with nothing missing before it. After an interruption or a channel
              change, the sender continues from there rather than from chunk 0.
            </p>
            <h3>Selective repeat</h3>
            <p>
              Every chunk carries its own CRC32. A chunk that fails the check is the only one sent again; chunks that already
              passed are never repeated, which is what keeps the heavy-loss scenario tolerable.
            </p>
            <h3>Bluetooth only</h3>
            <p>
              The Bluetooth-only run is the slow baseline. It is steady and never needs a fallback, but at about 2 Mbps it takes
              many times longer than healthy Wi-Fi for the same file.
            </p>
          </div>
        )}

        {results.length === 0 && !error && <p className="muted">Running the scenarios…</p>}
      </div>
    </div>
  );
};
