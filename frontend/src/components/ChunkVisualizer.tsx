import React, { useMemo } from 'react';
import { TransferMode } from '../types';

interface ChunkVisualizerProps {
  totalChunks: number;
  missingChunks: number[];
  retriedChunks: number[];
  currentSeq?: number;
  switchedAtChunk: number | null;
  lastContiguousChunk: number;
  mode: TransferMode;
}

const MAX_CELLS = 600;

export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({
  totalChunks,
  missingChunks,
  retriedChunks,
  currentSeq,
  switchedAtChunk,
  lastContiguousChunk,
  mode,
}) => {
  const per = Math.max(1, Math.ceil(totalChunks / MAX_CELLS));

  const cells = useMemo(() => {
    const verified = new Uint8Array(totalChunks).fill(1);
    for (const m of missingChunks) if (m >= 0 && m < totalChunks) verified[m] = 0;
    const retried = new Set(retriedChunks);
    const out: { key: number; state: string; title: string }[] = [];

    for (let start = 0; start < totalChunks; start += per) {
      const end = Math.min(totalChunks, start + per);
      let done = 0;
      let retry = false;
      for (let s = start; s < end; s++) {
        done += verified[s];
        if (retried.has(s)) retry = true;
      }
      let state = 'none';
      if (currentSeq !== undefined && currentSeq >= start && currentSeq < end) state = 'live';
      else if (done === end - start) {
        if (retry) state = 'retry';
        else if (switchedAtChunk !== null && start >= switchedAtChunk) state = 'bt';
        else state = 'done';
      } else if (done > 0) state = 'part';

      const label = end - start === 1 ? `Chunk ${start}` : `Chunks ${start}–${end - 1}`;
      out.push({ key: start, state, title: `${label}: ${state === 'none' ? 'waiting' : state === 'live' ? 'sending' : state === 'retry' ? 'verified after retry' : 'verified'}` });
    }
    return out;
  }, [totalChunks, missingChunks, retriedChunks, currentSeq, switchedAtChunk, per]);

  return (
    <section className="panel" aria-label="Chunk map">
      <div className="panel__head">
        <h2 className="h2">Chunks</h2>
        <span className="small muted mono">
          checkpoint {lastContiguousChunk >= 0 ? lastContiguousChunk : '–'} / {totalChunks - 1}
        </span>
      </div>
      <div className="panel__body">
        <div className="chunkmap">
          {cells.map((c) => (
            <div key={c.key} className="cell" data-s={c.state} title={c.title} />
          ))}
        </div>

        <div className="legend" style={{ marginTop: 14 }}>
          <span><i style={{ background: 'var(--accent)' }} />Verified</span>
          {mode === 'with_wifi' && <span><i style={{ background: 'var(--bt)' }} />Sent over Bluetooth</span>}
          <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--accent) 0 2px, var(--surface) 2px 4px)', outline: '1px solid var(--accent)', outlineOffset: -1 }} />Verified after retry</span>
          <span><i style={{ background: 'var(--ink)' }} />Sending</span>
          <span><i style={{ background: 'var(--line)' }} />Waiting</span>
        </div>
        {per > 1 && (
          <p className="xs faint" style={{ marginTop: 8 }}>
            Each square stands for {per} chunks.
          </p>
        )}
      </div>
    </section>
  );
};
