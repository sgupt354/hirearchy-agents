import type { AgentEvent } from '../engine/types';

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
