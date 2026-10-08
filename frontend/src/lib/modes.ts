import { TransferMode } from '../types';

export interface ModeInfo {
  id: TransferMode;
  label: string;
  channel: 'wifi' | 'bluetooth';
  summary: string;
  rows: [string, string][];
}

export const MODES: Record<TransferMode, ModeInfo> = {
  with_wifi: {
    id: 'with_wifi',
    label: 'Wi-Fi',
    channel: 'wifi',
    summary:
      'Fast transfer over your local network. If the link degrades past your thresholds, the transfer moves to Bluetooth and carries on from the last verified chunk.',
    rows: [
      ['Link', 'Wi-Fi, about 45 Mbps'],
      ['Falls back when', 'Below 5 Mbps, above 200 ms, or above 5% loss'],
      ['On fallback', 'Bluetooth, resumes at the last verified chunk'],
    ],
  },
  without_wifi: {
    id: 'without_wifi',
    label: 'Without Wi-Fi',
    channel: 'bluetooth',
    summary:
      'Bluetooth only. Wi-Fi is never used or switched to, so it works anywhere the two devices are in range. Slower, but steady.',
    rows: [
      ['Link', 'Bluetooth 5.0, about 2 Mbps'],
      ['Falls back when', 'Never. There is no second channel'],
      ['On error', 'Retries only the corrupted chunks'],
    ],
  },
};
