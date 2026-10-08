import React from 'react';
import { Wifi, Bluetooth } from 'lucide-react';
import { TransferMode } from '../types';

interface ModeSwitchProps {
  mode: TransferMode;
  onChange: (mode: TransferMode) => void;
  locked?: boolean;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onChange, locked = false }) => (
  <div
    className="seg"
    role="radiogroup"
    aria-label="Transfer mode"
    title={locked ? 'Mode is fixed while a transfer is in progress' : undefined}
  >
    <button
      type="button"
      role="radio"
      aria-checked={mode === 'with_wifi'}
      data-mode="with_wifi"
      disabled={locked}
      onClick={() => onChange('with_wifi')}
    >
      <Wifi size={15} /> Wi-Fi
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={mode === 'without_wifi'}
      data-mode="without_wifi"
      disabled={locked}
      onClick={() => onChange('without_wifi')}
    >
      <Bluetooth size={15} /> Without Wi-Fi
    </button>
  </div>
);
