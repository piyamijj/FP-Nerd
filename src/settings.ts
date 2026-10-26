import type { Level } from './game/ai';

export interface Settings {
  sound: boolean;
  level: Level;
  name: string;
  showHints: boolean;
}

const KEY = 'fpnerd.settings.v1';

const DEFAULTS: Settings = {
  sound: true,
  level: 'normal',
  name: '',
  showHints: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: parsed.sound ?? DEFAULTS.sound,
      level: parsed.level === 'kolay' || parsed.level === 'zor' ? parsed.level : 'normal',
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 14) : '',
      showHints: parsed.showHints ?? true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* yok say */
  }
}

export function playerName() {
  const s = loadSettings();
  return s.name.trim() || 'Sen';
}
