import React from 'react';
import { formatClock } from '../lib/format';

export interface LogEvent {
  id: number;
  t: number;
  text: string;
  kind?: 'ok' | 'warn' | 'bad' | 'bt';
}

export const EventLog: React.FC<{ events: LogEvent[] }> = ({ events }) => (
  <section className="panel" aria-label="Event log">
    <div className="panel__head">
      <h2 className="h2">Log</h2>
      <span className="xs faint">{events.length} events</span>
    </div>
    <div className="panel__body">
      {events.length === 0 ? (
        <p className="small faint">Nothing yet.</p>
      ) : (
        <ul className="log">
          {events.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <time>{formatClock(e.t)}</time>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
