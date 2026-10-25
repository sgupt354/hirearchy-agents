import { describe, expect, it } from 'vitest';
import { createStateHandler } from '../../api/live-state';
import { ingestTexts } from '../../src/live/inbox';
import type { LiveRequest, LiveResponse } from '../../src/live/http';
import { parseTypedReply } from '../../src/live/protocol';
import { MemoryReplyStore, SupabaseReplyStore } from '../../src/live/store';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const USER = '123456789012345678';

function call(handler: (req: LiveRequest, res: LiveResponse) => Promise<unknown>, req: Partial<LiveRequest>) {
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
  return handler({ headers: {}, [Symbol.asyncIterator]: async function* () {}, ...req } as LiveRequest, res).then(() => out);
}

describe('typed Discord DMs', () => {
  it('maps yes / no / 8pm the same way as the phone buttons', () => {
    expect(parseTypedReply('yes')).toEqual({ action: 'accept' });
    expect(parseTypedReply('YES')).toEqual({ action: 'accept' });
    expect(parseTypedReply("I'm in")).toEqual({ action: 'accept' });
    expect(parseTypedReply('no')).toEqual({ action: 'decline' });
    expect(parseTypedReply('8pm')).toMatchObject({ action: 'counter', text: '8pm' });
    expect(parseTypedReply('hey')).toBe('unreadable');
    expect(parseTypedReply('cool join you later')).toBe('unreadable');
  });

  it('first parseable text from the expected user wins; others and bot messages are ignored', () => {
    const { reply, ack } = ingestTexts({
      messages: [
        { id: '1', authorId: 'bot', bot: true, content: 'Found you a prep circle' },
        { id: '2', authorId: '999', bot: false, content: 'yes' },
        { id: '3', authorId: USER, bot: false, content: 'hey' },
        { id: '4', authorId: USER, bot: false, content: 'yes' },
        { id: '5', authorId: USER, bot: false, content: 'no' },
      ],
      expectedUserId: USER,
      session: SESSION,
      prompt: 2,
    });
    expect(reply).toMatchObject({ action: 'accept', prompt: 2, student: 'a1' });
    expect(ack).toContain("You're in");
  });

  it('unreadable text asks for yes/no/time and does not store an answer', () => {
    const { reply, ack } = ingestTexts({
      messages: [{ id: '1', authorId: USER, bot: false, content: 'hey' }],
      expectedUserId: USER,
      session: SESSION,
      prompt: 2,
    });
    expect(reply).toBeNull();
    expect(ack).toMatch(/yes/i);
  });

  it('live-state poll ingests a typed yes and returns it as the stored reply', async () => {
    const store = new MemoryReplyStore();
    await store.recordPrompt({ session: SESSION, prompt: 2, student: 'a1', discordUser: USER, channelId: 'ch1' });
    const fetchImpl: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('/messages') && !u.includes('POST')) {
        return new Response(JSON.stringify([{ id: 'm2', content: 'yes', author: { id: USER, bot: false } }]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };
    const state = createStateHandler({ store, configured: true, token: 't', fetchImpl });
    const r = await call(state, { method: 'GET', url: `/api/live-state?session=${SESSION}&prompt=2` });
    expect(r.status).toBe(200);
    expect((r.body as { reply: { action: string } }).reply.action).toBe('accept');
    expect(await store.get(SESSION, 2)).toMatchObject({ action: 'accept' });
  });
  it('Supabase store reads the prompt window from prompt_window (window is reserved in Postgres)', async () => {
    const sent: { fn: string; body: Record<string, unknown> }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      sent.push({ fn: String(url).split('/rpc/')[1], body: JSON.parse(String(init?.body)) });
      const rows = [{ discord_user: USER, channel_id: 'ch1', prompt_window: '7:30 PM-9:00 PM', last_message_id: 'm1' }];
      return new Response(JSON.stringify(rows), { status: 200 });
    };
    const store = new SupabaseReplyStore('https://x.supabase.co', 'k', fetchImpl);
    expect(await store.getPrompt(SESSION, 2, 'a1')).toMatchObject({ discordUser: USER, channelId: 'ch1', window: '7:30 PM-9:00 PM', lastMessageId: 'm1' });
    await store.recordPrompt({ session: SESSION, prompt: 2, student: 'a1', discordUser: USER, window: '8:00 PM-9:00 PM' });
    expect(sent.at(-1)).toMatchObject({ fn: 't2_live_record_prompt', body: { p_window: '8:00 PM-9:00 PM' } });
  });
});
