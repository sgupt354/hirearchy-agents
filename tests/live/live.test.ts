import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createInteractionsHandler } from '../../api/discord-interactions';
import { createNotifyHandler } from '../../api/live-notify';
import { createStateHandler } from '../../api/live-state';
import { Engine } from '../../src/engine';
import { liveApi } from '../../src/live/client';
import type { LiveRequest, LiveResponse } from '../../src/live/http';
import { LivePoller } from '../../src/live/poller';
import { encodeId, interactionToReply, sanitizeDetails, toHumanReply, type LiveReply } from '../../src/live/protocol';
import { MemoryReplyStore } from '../../src/live/store';
import { verifyDiscordSignature } from '../../src/live/verify';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ADITYA = '123456789012345678';

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  return { publicHex: raw, privateKey };
}
const signBody = (privateKey: KeyObject, timestamp: string, body: string) => sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');

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

function interactions() {
  const { publicHex, privateKey } = keys();
  const store = new MemoryReplyStore();
  const handler = createInteractionsHandler({ publicKey: publicHex, adityaId: ADITYA, store, now: () => new Date('2026-10-25T19:00:00Z') });
  const send = (payload: unknown, opts: { badSignature?: boolean } = {}) => {
    const body = JSON.stringify(payload);
    const ts = '1761418800';
    const sig = signBody(privateKey, ts, opts.badSignature ? `${body} ` : body);
    return call(handler, { method: 'POST', rawBody: body, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } });
  };
  const press = (op: 'in' | 'time' | 'not' | 'pick', opts: { user?: string; values?: string[]; prompt?: number } = {}) =>
    send({ type: 3, user: { id: opts.user ?? ADITYA }, data: { custom_id: encodeId(SESSION, opts.prompt ?? 2, op), values: opts.values }, message: { content: 'Found you a prep circle' } });
  return { store, send, press };
}

describe('live Discord: signature verification', () => {
  it('accepts a valid Ed25519 signature and rejects tampering, wrong keys and junk', () => {
    const { publicHex, privateKey } = keys();
    const other = keys();
    const body = '{"type":1}';
    const sig = signBody(privateKey, '1700000000', body);
    expect(verifyDiscordSignature(publicHex, sig, '1700000000', body)).toBe(true);
    expect(verifyDiscordSignature(publicHex, sig, '1700000000', '{"type":2}')).toBe(false);
    expect(verifyDiscordSignature(publicHex, sig, '1700000001', body)).toBe(false);
    expect(verifyDiscordSignature(other.publicHex, sig, '1700000000', body)).toBe(false);
    expect(verifyDiscordSignature(publicHex, 'zz', '1700000000', body)).toBe(false);
    expect(verifyDiscordSignature('not-hex', sig, '1700000000', body)).toBe(false);
    expect(verifyDiscordSignature(publicHex, sig, '', body)).toBe(false);
  });

  it('the endpoint answers PING when signed and 401s when not', async () => {
    const { send } = interactions();
    expect(await send({ type: 1 })).toEqual({ status: 200, body: { type: 1 } });
    expect((await send({ type: 1 }, { badSignature: true })).status).toBe(401);
  });
});

describe('live Discord: interaction → reply mapping', () => {
  it('maps each button and time pick to the same reply as the simulated phone', () => {
    expect(interactionToReply(encodeId(SESSION, 2, 'in'))).toEqual({ kind: 'reply', session: SESSION, prompt: 2, action: 'accept' });
    expect(interactionToReply(encodeId(SESSION, 2, 'not'))).toMatchObject({ action: 'decline' });
    expect(interactionToReply(encodeId(SESSION, 2, 'time'))).toEqual({ kind: 'pick-time', session: SESSION, prompt: 2 });
    expect(interactionToReply(encodeId(SESSION, 2, 'pick'), ['8:00 PM'])).toMatchObject({ action: 'counter', text: '8:00 PM' });
    expect(interactionToReply(encodeId(SESSION, 2, 'pick'), ['3:00 AM'])).toBeNull();
    expect(interactionToReply('hl|not-a-session|2|in')).toBeNull();
    expect(interactionToReply('something-else')).toBeNull();
    expect(toHumanReply({ action: 'accept' }).reply).toEqual({ kind: 'accept' });
    expect(toHumanReply({ action: 'counter', text: '8:00 PM' }).reply).toEqual({ kind: 'counter', text: '8:00 PM' });
    expect(toHumanReply({ action: 'decline' }).reply).toEqual({ kind: 'decline' });
  });

  it("stores Aditya's button press and clears the buttons", async () => {
    const { store, press } = interactions();
    const r = await press('in');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ type: 7, data: { components: [] } });
    expect(await store.get(SESSION, 2)).toMatchObject({ action: 'accept' });
  });

  it('"Suggest a time" opens a 7:30 / 8:00 / 8:30 PM picker, and the pick is stored as a counter', async () => {
    const { store, press } = interactions();
    const opened = (await press('time')).body as { type: number; data: { components: { components: { options: { value: string }[] }[] }[] } };
    expect(opened.type).toBe(7);
    expect(opened.data.components[0].components[0].options.map((o) => o.value)).toEqual(['7:30 PM', '8:00 PM', '8:30 PM']);
    expect(await store.get(SESSION, 2)).toBeNull();
    await press('pick', { values: ['8:00 PM'] });
    expect(await store.get(SESSION, 2)).toMatchObject({ action: 'counter', text: '8:00 PM' });
  });

  it('first answer wins; other users and expired buttons store nothing', async () => {
    const { store, press } = interactions();
    await press('not');
    const again = await press('in');
    expect(JSON.stringify(again.body)).toContain('already answered');
    expect(await store.get(SESSION, 2)).toMatchObject({ action: 'decline' });

    const stranger = await press('in', { user: '999', prompt: 5 });
    expect(stranger.body).toMatchObject({ type: 4, data: { flags: 64 } });
    expect(await store.get(SESSION, 5)).toBeNull();

    await press('pick', { values: ['9:45 PM'], prompt: 6 });
    expect(await store.get(SESSION, 6)).toBeNull();
  });
});

describe('live Discord: polling applies the reply once', () => {
  it('applies a stored reply exactly once and ignores other prompts', async () => {
    const store = new MemoryReplyStore();
    const apply = vi.fn();
    const poller = new LivePoller({ fetchReply: (s, p) => store.get(s, p), apply, onUnavailable: vi.fn() });
    expect(await poller.tick(SESSION, 2)).toBe(false);
    await store.put({ session: SESSION, prompt: 1, action: 'accept', at: 'x' }); // an older prompt
    expect(await poller.tick(SESSION, 2)).toBe(false);
    await store.put({ session: SESSION, prompt: 2, action: 'counter', text: '8:00 PM', at: 'x' });
    expect(await poller.tick(SESSION, 2)).toBe(true);
    expect(await poller.tick(SESSION, 2)).toBe(false);
    expect(await poller.tick(SESSION, 2)).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]).toMatchObject({ action: 'counter', text: '8:00 PM' });
  });

  it('end to end: a signed Discord click reaches the engine like a tap on the phone', async () => {
    const { store, press } = interactions();
    const state = createStateHandler({ store, configured: true });
    const engine = new Engine();
    engine.simulateInterviewInvite();
    const prompt = engine.phone('a1').at(-1)!.id;
    const fetchReply = async (s: string, p: number) => {
      const r = await call(state, { method: 'GET', url: `/api/live-state?session=${s}&prompt=${p}` });
      return (r.body as { reply: LiveReply | null }).reply;
    };
    const poller = new LivePoller({ fetchReply, apply: (r) => engine.reply('a1', toHumanReply(r).reply), onUnavailable: vi.fn() });

    expect(await poller.tick(SESSION, prompt)).toBe(false);
    await press('in', { prompt });
    expect(await poller.tick(SESSION, prompt)).toBe(true);
    expect(engine.state).toBe('AWAITING_CONSENT');
    expect(engine.consents.a1).toBe('accepted');
    expect(await poller.tick(SESSION, prompt)).toBe(false); // never applied twice
  });
});

describe('live Discord: offline fallback', () => {
  it('reports unavailable after repeated failed polls (once), without throwing', async () => {
    const onUnavailable = vi.fn();
    const poller = new LivePoller({ fetchReply: () => Promise.reject(new Error('offline')), apply: vi.fn(), onUnavailable });
    for (let i = 0; i < 5; i++) expect(await poller.tick(SESSION, 2)).toBe(false);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('the browser client treats a missing or failing server as "not live"', async () => {
    const offline = liveApi(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await offline.health()).toBe(false);
    expect(await offline.notify({ session: SESSION, prompt: 2, kind: 'proposal', details: {} })).toBe(false);
    await expect(offline.reply(SESSION, 2)).rejects.toThrow();
    const notDeployed = liveApi(async () => new Response('Not found', { status: 404 }));
    expect(await notDeployed.health()).toBe(false);
  });

  it('server functions report unavailable instead of crashing when not configured', async () => {
    const state = createStateHandler({ store: null, configured: false });
    expect(await call(state, { method: 'GET', url: '/api/live-state?health=1' })).toEqual({ status: 503, body: { ok: false } });
    expect((await call(state, { method: 'GET', url: `/api/live-state?session=${SESSION}&prompt=2` })).status).toBe(503);
    const failing = createNotifyHandler({ token: 't', adityaId: ADITYA, send: async () => false });
    const valid = { session: SESSION, prompt: 2, kind: 'proposal', details: { window: '7:30 PM-9:00 PM', gives: 'DSA', gets: 'Behavioral', circleSize: '3' } };
    expect((await call(failing, { method: 'POST', body: valid })).status).toBe(502);
    const throwing = createNotifyHandler({ token: 't', adityaId: ADITYA, send: async () => Promise.reject(new Error('discord down')) });
    expect((await call(throwing, { method: 'POST', body: valid })).status).toBe(502);
    expect((await call(failing, { method: 'POST', body: { ...valid, details: {} } })).status).toBe(400);
  });

  it('the DM text is built server-side from validated fields only', async () => {
    let sent = '';
    const notify = createNotifyHandler({ token: 't', adityaId: ADITYA, send: async (o) => ((sent = o.content), true) });
    const bad = await call(notify, { method: 'POST', body: { session: 'x', prompt: 2, kind: 'proposal' } });
    expect(bad.status).toBe(400);
    expect((await call(notify, { method: 'POST', body: { session: SESSION, prompt: 2, kind: 'free-text', details: {} } })).status).toBe(400);
    const ok = await call(notify, {
      method: 'POST',
      body: { session: SESSION, prompt: 2, kind: 'proposal', details: { window: '7:30 PM-9:00 PM', gives: 'DSA', gets: 'Behavioral', circleSize: '3', updated: 'false', evil: 'http://phish.example', company: '<@everyone>' } },
    });
    expect(ok.status).toBe(200);
    expect(sent).toContain('Tonight 7:30–9:00 PM');
    expect(sent).not.toContain('phish');
    expect(sent).not.toContain('@everyone');
    expect(sanitizeDetails({ window: 'x'.repeat(500), gives: 'DSA' })).toEqual({ gives: 'DSA' });
  });
});
