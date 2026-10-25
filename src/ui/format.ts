import type { AgentEvent, TimeWindow } from '../engine/types';
import { to12h } from '../engine/time';

/** Feed icons: ✓ match/accept, ↗ shared, ⚠ conflict, ↔ negotiating, ⏸ human required, 🔓 revealed. */
export function iconFor(e: AgentEvent): string {
  if (e.type === 'CONFLICT') return e.payload.resolved ? '✓' : '⚠';
  if (e.type === 'DISCOVER') return e.payload.match ? '✓' : e.payload.listing ? '↗' : '🔎';
  const icons: Record<string, string> = {
    TRIGGER: '📩', FILTERED: '⨯', PROPOSE: '↔', COUNTER: '↔', ACCEPT: '✓', REJECT: '✗', ESCALATE: '⏸️',
    CONSENT: '✓', DECLINE: '✗', DISSOLVED: '∅', REVEAL: '🔓', COMPLETE: '✓',
  };
  return icons[e.type] ?? '•';
}

/** Rewrite the viewer's own label as "You" / "Your". */
export function relabel(text: string, viewerLabel: string): string {
  return text.replaceAll(`${viewerLabel}'s`, 'Your').replaceAll(viewerLabel, 'You');
}

/** {20:00, 21:00} -> "8:00-9:00 PM" */
export function shortWindow(w: TimeWindow): string {
  const [s, e] = [to12h(w.start), to12h(w.end)];
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)}-${e}` : `${s}-${e}`;
}
