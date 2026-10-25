import type { AgentEvent } from '../../engine/types';
import type { EventView } from '../../ui/copy';

/** Plain-English feed rows for the application-packet steps (null for any other event). */
export function describePacket(e: AgentEvent): EventView | null {
  const p = e.payload;
  switch (p.kind) {
    case 'packet-prepared':
      return { title: 'Application packet prepared', icon: '📋', tone: 'info', body: `From the seeker's own resume: ${p.kept} of ${p.total} bullets and a ${p.words}-word intro draft. Held by the seeker's agent; nothing shared.` };
    case 'packet-request':
      return { title: 'Referrer asked for the packet', icon: '↔', tone: 'info', body: 'Possible only after both said yes to the chat. Only the request is shared.' };
    case 'packet-ask':
      return { title: 'Seeker asked before sharing', icon: '⏸️', tone: 'human', body: "The seeker's agent won't share the resume or intro without the seeker's yes." };
    case 'packet-consent':
      return { title: 'Seeker said yes', icon: '✓', tone: 'good', body: 'The seeker agreed to share the packet with the referrer only.' };
    case 'packet-shared':
      return { title: 'Packet shared with the referrer', icon: '🔓', tone: 'good', body: 'Tailored resume and intro draft, visible to the referrer only. Nothing was emailed.' };
    case 'packet':
      return { title: 'Packet kept private', icon: '🔒', tone: 'muted', body: 'The seeker said no. Nothing was shared.' };
    default:
      return null;
  }
}
