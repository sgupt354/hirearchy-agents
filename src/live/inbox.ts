import { ACK, parseTypedReply, type LiveReply } from './protocol.js';
import type { LiveStudent } from './students.js';
import type { TimeWindow } from '../engine/types.js';

export interface InboundText {
  id: string;
  authorId: string;
  bot: boolean;
  content: string;
}

/**
 * Turn new DM texts from the student this prompt was sent to into one LiveReply (first parseable
 * answer wins). Bot messages and other users are ignored. Unreadable text yields a help ack only.
 */
export function ingestTexts(opts: {
  messages: InboundText[];
  expectedUserId: string;
  session: string;
  prompt: number;
  student?: LiveStudent;
  window?: TimeWindow;
  afterId?: string;
}): { reply: LiveReply | null; ack: string | null; lastId: string | undefined } {
  const ordered = [...opts.messages].sort((a, b) => (a.id < b.id ? -1 : 1));
  let lastId = opts.afterId;
  let ack: string | null = null;
  let reply: LiveReply | null = null;
  for (const m of ordered) {
    if (opts.afterId && m.id <= opts.afterId) continue;
    lastId = m.id;
    if (m.bot || m.authorId !== opts.expectedUserId) continue;
    const parsed = parseTypedReply(m.content, opts.window);
    if (parsed === 'unreadable') {
      ack = ACK.help;
      continue;
    }
    if (!reply) {
      reply = {
        session: opts.session,
        prompt: opts.prompt,
        student: opts.student ?? 'a1',
        action: parsed.action,
        text: parsed.text,
        at: new Date(0).toISOString(),
      };
      ack = parsed.action === 'counter' ? ACK.counter(parsed.text ?? '') : ACK[parsed.action];
    }
  }
  return { reply, ack, lastId };
}
