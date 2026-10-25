import { describe, expect, it } from 'vitest';
import { createNotifyHandler } from '../../api/live-notify';
import type { LiveRequest, LiveResponse } from '../../src/live/http';
import { helpCopy, interactionToReply, parseNotifyBody } from '../../src/live/protocol';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const DETAILS = { company: 'Microsoft', role: 'Technical', text: 'DSA', window: '7:30–8:15 PM' };

function call(handler: (req: LiveRequest, res: LiveResponse) => Promise<unknown>, body: unknown) {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res: LiveResponse = {
    status(code) {
      out.status = code;
      return res;
    },
    json(b) {
      out.body = b;
      return b;
    },
    setHeader() {
      return undefined;
    },
  };
  return handler({ method: 'POST', headers: {}, body, [Symbol.asyncIterator]: async function* () {} } as unknown as LiveRequest, res).then(() => out);
}

describe('live Discord: Pay it forward help prompt', () => {
  it('validates the anonymous details the browser may send', () => {
    expect(parseNotifyBody({ session: SESSION, prompt: 3, kind: 'help', details: DETAILS })).toMatchObject({ kind: 'help', details: DETAILS });
    expect(parseNotifyBody({ session: SESSION, prompt: 3, kind: 'help', details: { company: 'Microsoft' } })).toBeNull();
    // Unknown fields (a name, say) are dropped before anything reaches Discord.
    expect(parseNotifyBody({ session: SESSION, prompt: 3, kind: 'help', details: { ...DETAILS, name: 'Priya Nair' } })!.details).toEqual(DETAILS);
  });

  it('DMs the mentor the listing only, with yes / no buttons that map to accept / decline', async () => {
    const sent: { content: string; components: { components: { label: string; custom_id: string }[] }[] }[] = [];
    const notify = createNotifyHandler({ token: 't', users: { a1: '1' }, send: async (o) => (sent.push(o as never), true) });
    const r = await call(notify, { session: SESSION, prompt: 3, kind: 'help', details: { ...DETAILS, name: 'Priya Nair' } });
    expect(r.status).toBe(200);
    expect(sent[0].content).toContain(helpCopy(DETAILS));
    expect(sent[0].content).not.toMatch(/Priya|Nair/);
    expect(sent[0].content).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
    const buttons = sent[0].components[0].components;
    expect(buttons.map((b) => b.label)).toEqual(['I can help', 'Not this time']);
    expect(interactionToReply(buttons[0].custom_id)).toMatchObject({ kind: 'reply', action: 'accept', prompt: 3 });
    expect(interactionToReply(buttons[1].custom_id)).toMatchObject({ kind: 'reply', action: 'decline' });
  });
});
