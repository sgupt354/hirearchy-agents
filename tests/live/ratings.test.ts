import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInteractionsHandler } from '../../api/discord-interactions';
import { createNotifyHandler } from '../../api/live-notify';
import { createStateHandler } from '../../api/live-state';
import type { LiveRequest, LiveResponse } from '../../src/live/http';
import { RATING_COPY, RATING_PROMPT, decodeRatingId, encodeRatingId, parseRatingNotify, ratingFromValue, ratingSelects } from '../../src/live/protocol';
import { MemoryReplyStore, SupabaseReplyStore } from '../../src/live/store';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ADITYA = '123456789012345678';
const PEOPLE = [
  { id: 'a2', name: 'Sumit' },
  { id: 'a3', name: 'Maya' },
];

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
  const full = { headers: {}, [Symbol.asyncIterator]: async function* () {}, ...req } as LiveRequest;
  return handler(full, res).then(() => out);
}

function interactions(store = new MemoryReplyStore()) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const handler = createInteractionsHandler({ publicKey: publicHex, adityaId: ADITYA, store });
  /** Pick a value in one member's select on a message that still shows `rows`. */
  const pick = (subject: string, value: string, rows = ratingSelects(SESSION, 'a1', PEOPLE), user = ADITYA) => {
    const body = JSON.stringify({
      type: 3,
      user: { id: user },
      data: { custom_id: encodeRatingId(SESSION, 'a1', subject), values: [value] },
      message: { content: `Hirearchy Agent\n${RATING_COPY.ask}`, components: rows },
    });
    const ts = '1761418800';
    const sig = sign(null, Buffer.from(ts + body), privateKey).toString('hex');
    return call(handler, { method: 'POST', rawBody: body, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } });
  };
  return { store, pick };
}

type Update = { type: number; data: { content: string; components: { components: { custom_id: string }[] }[] } };

describe('live Discord: private post-session ratings', () => {
  it('validates what the browser may ask the bot to send', () => {
    const ok = { session: SESSION, kind: 'rating', student: 'a1', people: PEOPLE };
    expect(parseRatingNotify(ok)).toEqual(ok);
    expect(parseRatingNotify({ ...ok, people: [] })).toBeNull();
    expect(parseRatingNotify({ ...ok, people: [{ id: 'a1', name: 'Aditya' }] })).toBeNull(); // can't rate yourself
    expect(parseRatingNotify({ ...ok, people: [PEOPLE[0], PEOPLE[0]] })).toBeNull();
    expect(parseRatingNotify({ ...ok, people: [{ id: 'a9', name: 'X' }] })).toBeNull();
    expect(parseRatingNotify({ ...ok, people: [{ id: 'a2', name: '<@everyone>' }] })).toBeNull();
    expect(parseRatingNotify({ ...ok, people: ['a2', 'a3', 'a4', 'a5', 'a6'].map((id) => ({ id, name: 'Sam' })) })).toBeNull();
    expect(parseRatingNotify({ ...ok, session: 'nope' })).toBeNull();
    expect(decodeRatingId(encodeRatingId(SESSION, 'a1', 'a2'))).toEqual({ session: SESSION, rater: 'a1', subject: 'a2' });
    expect(decodeRatingId(`hr|${SESSION}|a1|a1`)).toBeNull();
    expect(ratingFromValue('5')).toEqual({ showedUp: true, helpful: 5 });
    expect(ratingFromValue('noshow')).toEqual({ showedUp: false, helpful: null });
    for (const bad of ['0', '6', '2.5', '', 5, undefined]) expect(ratingFromValue(bad)).toBeNull();
  });

  it('sends the rating DM to the rater once per session, one select per member', async () => {
    const store = new MemoryReplyStore();
    const sent: { userId: string; content: string; components: unknown[] }[] = [];
    const notify = createNotifyHandler({ token: 't', users: { a1: ADITYA }, store, send: async (o) => (sent.push(o), true) });
    const body = { session: SESSION, kind: 'rating', student: 'a1', people: PEOPLE };
    expect((await call(notify, { method: 'POST', body })).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe(ADITYA);
    expect(sent[0].content).toContain(RATING_COPY.ask);
    expect(JSON.stringify(sent[0].components)).toContain('Rate Sumit');
    expect(sent[0].components).toHaveLength(2);
    expect(await store.getPrompt(SESSION, RATING_PROMPT, 'a1')).toBeTruthy();
    expect((await call(notify, { method: 'POST', body })).body).toMatchObject({ duplicate: true });
    expect(sent).toHaveLength(1);
    expect((await call(notify, { method: 'POST', body: { ...body, people: [{ id: 'a2', name: 'http://x' }] } })).status).toBe(400);
  });

  it('stores each pick, removes that select, and thanks the student after the last one', async () => {
    const { store, pick } = interactions();
    const first = (await pick('a2', '4')).body as Update;
    expect(first.type).toBe(7);
    expect(first.data.components.map((r) => r.components[0].custom_id)).toEqual([encodeRatingId(SESSION, 'a1', 'a3')]);
    const last = (await pick('a3', 'noshow', first.data.components as never)).body as Update;
    expect(last.data.components).toEqual([]);
    expect(last.data.content).toContain(RATING_COPY.done);
    expect(await store.getRatings(SESSION, 'a1')).toEqual({ a2: { showedUp: true, helpful: 4 }, a3: { showedUp: false, helpful: null } });
  });

  it('first rating wins, and only the rater can rate', async () => {
    const { store, pick } = interactions();
    await pick('a2', '2');
    await pick('a2', '5');
    expect((await store.getRatings(SESSION, 'a1')).a2).toEqual({ showedUp: true, helpful: 2 });
    const stranger = (await pick('a3', '5', undefined, '999999999999999999')).body as { data: { content: string; flags: number } };
    expect(stranger.data.flags).toBe(64);
    expect(stranger.data.content).toMatch(/belong/);
    expect((await store.getRatings(SESSION, 'a1')).a3).toBeUndefined();
    expect(((await pick('a3', '9')).body as { data: { content: string } }).data.content).toMatch(/expired/);
  });

  it("a storage failure tells the student to rate in the app and doesn't remove the select", async () => {
    const broken = new MemoryReplyStore();
    broken.putRating = async () => {
      throw new Error('store_404');
    };
    const { pick } = interactions(broken);
    const r = (await pick('a2', '5')).body as { type: number; data: { content: string } };
    expect(r.type).toBe(4);
    expect(r.data.content).toMatch(/rate in the app/);
  });

  it('live-state returns only the asking student’s ratings for that session', async () => {
    const store = new MemoryReplyStore();
    await store.putRating(SESSION, 'a1', 'a2', { showedUp: true, helpful: 5 });
    await store.putRating(SESSION, 'a2', 'a1', { showedUp: true, helpful: 3 });
    const state = createStateHandler({ store, configured: true });
    const r = await call(state, { method: 'GET', url: `/api/live-state?session=${SESSION}&ratings=1&student=a1` });
    expect(r).toEqual({ status: 200, body: { ratings: { a2: { showedUp: true, helpful: 5 } } } });
    expect((await call(state, { method: 'GET', url: `/api/live-state?session=bad&ratings=1` })).status).toBe(400);
    expect((await call(state, { method: 'GET', url: `/api/live-state?session=${SESSION}&ratings=1&student=a9` })).status).toBe(400);
  });

  it('Supabase store calls the rating RPCs with the right arguments', async () => {
    const calls: { fn: string; body: Record<string, unknown> }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const fn = String(url).split('/rpc/')[1];
      calls.push({ fn, body: JSON.parse(String(init?.body)) });
      const out = fn === 't2_live_put_rating' ? true : [{ subject_id: 'a2', helpful: null, showed_up: false }];
      return new Response(JSON.stringify(out), { status: 200 });
    };
    const store = new SupabaseReplyStore('https://x.supabase.co', 'k', fetchImpl);
    expect(await store.putRating(SESSION, 'a1', 'a2', { showedUp: false, helpful: null })).toBe(true);
    expect(calls[0]).toEqual({ fn: 't2_live_put_rating', body: { p_session: SESSION, p_rater: 'a1', p_subject: 'a2', p_helpful: null, p_showed_up: false } });
    expect(await store.getRatings(SESSION, 'a1')).toEqual({ a2: { showedUp: false, helpful: null } });
    expect(calls[1]).toEqual({ fn: 't2_live_get_ratings', body: { p_session: SESSION, p_rater: 'a1' } });
  });
});
