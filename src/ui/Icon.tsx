// Line icons (lucide-style, 24×24, stroke = currentColor) so the UI never relies on emoji.

const P: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-4.35-4.35',
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm7 8v2a7 7 0 0 1-14 0v-2M12 19v3',
  idea: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2Z',
  handshake: 'm11 17 2 2a1 1 0 1 0 3-3m-2-2 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4m0-1 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  pause: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM10 15V9M14 15V9',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  x: 'M18 6 6 18M6 6l12 12',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  radar: 'M4.9 19.1A10 10 0 1 1 19.1 4.9M7.8 16.2a6 6 0 1 1 8.4-8.4M12 12l7-7M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  coffee: 'M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8ZM6 2v2M10 2v2M14 2v2',
  star: 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M16 13H8M16 17H8',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  eyeOff: 'M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20',
  award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm-3.79-1.11L7 23l5-3 5 3-1.21-9.12',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  repeat: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4m14-1v1a4 4 0 0 1-4 4H3',
  share: 'M7 17 17 7M7 7h10v10',
  swap: 'M8 3 4 7l4 4M4 7h16m-4 14 4-4-4-4m4 4H4',
  minus: 'M5 12h14',
  arrow: 'M5 12h14m-7-7 7 7-7 7',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Zm7 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  dot: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className }: { name: IconName | string; size?: number; className?: string }) {
  const d = P[name] ?? P.dot;
  return (
    <svg className={`ico ${className ?? ''}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** The Hirearchy mark, exactly as on the marketing site: three connected nodes in brand colours. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5 L5 18 L19 18 Z" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" />
      <circle cx="12" cy="5" r="3" fill="var(--accent)" />
      <circle cx="5" cy="18" r="3" fill="var(--cyan)" />
      <circle cx="19" cy="18" r="3" fill="var(--accent)" />
    </svg>
  );
}

/** Maps the feed's legacy glyphs (from the copy/engine layer) onto line icons. */
const GLYPH: Record<string, IconName> = {
  '📩': 'mail', '📡': 'radar', '🔎': 'search', '🔍': 'search', '🔒': 'lock', '🔓': 'unlock', '🔁': 'repeat',
  '⚠': 'alert', '⚠️': 'alert', '⏸️': 'pause', '⏸': 'pause', '🕗': 'clock', '🎉': 'checkCircle', '🎤': 'mic',
  '📋': 'clipboard', '🤖': 'sparkle', '⏱': 'timer', '🎯': 'target', '☕': 'coffee', '🤝': 'handshake', '⭐': 'star',
  '✓': 'check', '✗': 'x', '⨯': 'minus', '↗': 'share', '↔': 'swap', '∅': 'minus', '•': 'dot',
};
export const glyphIcon = (g: string): IconName => GLYPH[g.trim()] ?? GLYPH[g.trim().replace(/️/g, '')] ?? 'dot';
