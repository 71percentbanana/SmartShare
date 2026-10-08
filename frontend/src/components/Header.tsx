import React from 'react';
import { Sliders } from 'lucide-react';
import { ModeSwitch } from './ModeSwitch';
import { Page, TransferMode } from '../types';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: TransferMode;
  onModeChange: (mode: TransferMode) => void;
  modeLocked: boolean;
  onOpenThresholds: () => void;
}

const PAGES: { id: Page; label: string }[] = [
  { id: 'home', label: 'Setup' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'experiments', label: 'Benchmarks' },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  mode,
  onModeChange,
  modeLocked,
  onOpenThresholds,
}) => (
  <header className="topbar">
    <div className="container topbar__inner">
      <button type="button" className="brand" onClick={() => onNavigate('home')}>
        <span className="brand__mark" aria-hidden />
        SmartShare
      </button>

      <nav className="nav" aria-label="Pages">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-current={currentPage === p.id ? 'page' : undefined}
            onClick={() => onNavigate(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div className="topbar__end">
        <ModeSwitch mode={mode} onChange={onModeChange} locked={modeLocked} />
        {mode === 'with_wifi' && (
          <button type="button" className="btn btn--sm" onClick={onOpenThresholds}>
            <Sliders size={14} /> Thresholds
          </button>
        )}
      </div>
    </div>
  </header>
);
