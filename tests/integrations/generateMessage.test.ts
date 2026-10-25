import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMessage, sanitizeDetails } from '../../src/integrations';
import handler, { buildUserPrompt, parseVoiceBody } from '../../api/voice';

const HIDDEN = ['Maya', 'Sumit', 'maya@example.com', '+1-555-0100'];

/** Details carrying every shape of identity field we must strip before reveal. */
const identityDetails = {
  start: '20:00',
  end: '21:00',
  memberName: 'Maya',
  Email: 'maya@example.com',
  CONTACT: 'Sumit',
  phoneNumber: '+1-555-0100',
  identityNote: 'Sumit',
};

function mockFetchJson(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateMessage — happy path', () => {
  let fetchMock: ReturnType<typeof mockFetchJson>;

  beforeEach(() => {
    fetchMock = mockFetchJson({ message: 'Your agent found a circle. Want in?' });
  });

  it('returns the generated message', async () => {
    const result = await generateMessage({ recipientLabel: 'Student A', kind: 'proposal', details: {} });
    expect(result).toBe('Your agent found a circle. Want in?');
  });

  it('POSTs JSON to /api/voice', async () => {
    await generateMessage({ recipientLabel: 'Student A', kind: 'proposal', details: {} });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/voice');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends recipientLabel, kind and details in the body', async () => {
    await generateMessage({ recipientLabel: 'Student A', kind: 'counter', details: { start: '20:00' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      recipientLabel: 'Student A',
      kind: 'counter',
      details: { start: '20:00' },
    });
  });

  it('passes an abort signal so the request can time out', async () => {
    await generateMessage({ recipientLabel: 'Student A', kind: 'proposal', details: {} });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('generateMessage — client-side privacy', () => {
  it.each(['proposal', 'counter', 'complete'] as const)('strips identity fields for %s', async (kind) => {
    const fetchMock = mockFetchJson({ message: 'ok' });
    await generateMessage({ recipientLabel: 'Student A', kind, details: identityDetails });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = init.body as string;
    for (const secret of HIDDEN) expect(sent).not.toContain(secret);
    expect(JSON.parse(sent).details).toEqual({ start: '20:00', end: '21:00' });
  });

  it('removes a plain name field for a proposal', async () => {
    expect(sanitizeDetails('proposal', { name: 'Maya', start: '20:00' })).toEqual({ start: '20:00' });
  });

  it('removes email, contact and phone fields regardless of capitalization', async () => {
    expect(sanitizeDetails('proposal', { Email: 'a@b.c', CONTACT: 'x', phoneNumber: '555' })).toEqual({});
  });

  it('allows identity fields through for reveal', async () => {
    const fetchMock = mockFetchJson({ message: 'ok' });
    await generateMessage({ recipientLabel: 'Student A', kind: 'reveal', details: { members: 'Maya and Sumit' } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).details).toEqual({ members: 'Maya and Sumit' });
  });
});

describe('generateMessage — failure always yields a fallback', () => {
  const input = { recipientLabel: 'Student A', kind: 'proposal' as const, details: {} };

  it('falls back on a non-2xx response', async () => {
    mockFetchJson({ error: 'generation_unavailable' }, false, 503);
    await expect(generateMessage(input)).resolves.toContain('Want to join?');
  });

  it('falls back when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    await expect(generateMessage(input)).resolves.toContain('Want to join?');
  });

  it('falls back on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));
    await expect(generateMessage(input)).resolves.toContain('Want to join?');
  });

  it.each([{ message: '' }, { message: '   ' }, { message: 42 }, {}, null])(
    'falls back on an unusable body %j',
    async (body) => {
      mockFetchJson(body);
      await expect(generateMessage(input)).resolves.toContain('Want to join?');
    },
  );

  it('falls back on an AbortError without waiting for the real timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      (init.signal as AbortSignal).throwIfAborted?.();
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    }));
    await expect(generateMessage(input)).resolves.toContain('Want to join?');
  });

  it('aborts the request after the 3 second timeout', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      captured = init.signal as AbortSignal;
      return new Promise(() => {});
    }));

    void generateMessage(input);
    await Promise.resolve();
    expect(captured!.aborted).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(captured!.aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe('generateMessage — fallback templates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  });

  it.each(['proposal', 'counter', 'complete'] as const)('%s fallback leaks no identities', async (kind) => {
    const message = await generateMessage({ recipientLabel: 'Student A', kind, details: identityDetails });
    for (const secret of HIDDEN) expect(message).not.toContain(secret);
    expect(message.length).toBeGreaterThan(10);
  });

  it('reveal fallback uses consented identities', async () => {
    const message = await generateMessage({
      recipientLabel: 'Student A',
      kind: 'reveal',
      details: { members: 'Maya and Sumit' },
    });
    expect(message).toBe('Everyone said yes — your prep circle is confirmed with Maya and Sumit.');
  });

  it('reveal fallback stays generic when no identities were supplied', async () => {
    const message = await generateMessage({ recipientLabel: 'Student A', kind: 'reveal', details: {} });
    expect(message).toBe('Everyone said yes — your prep circle is confirmed.');
  });
});

describe('/api/voice server behaviour', () => {
  const mockRes = () => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) { res.statusCode = code; return res; },
      json(body: unknown) { res.body = body; return body; },
    };
    return res;
  };

  it('rejects non-POST requests', async () => {
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects an invalid body or unknown kind', async () => {
    for (const body of [null, {}, { recipientLabel: 'A', kind: 'bogus', details: {} }, { recipientLabel: '', kind: 'proposal' }]) {
      const res = mockRes();
      await handler({ method: 'POST', body }, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('reports generation unavailable instead of crashing when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = mockRes();
    await handler({ method: 'POST', body: { recipientLabel: 'Student A', kind: 'proposal', details: {} } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'generation_unavailable' });
  });

  it('does not leak provider error details to the browser', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-secret');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('anthropic 401 sk-test-secret'); }));
    const res = mockRes();
    await handler({ method: 'POST', body: { recipientLabel: 'Student A', kind: 'proposal', details: {} } }, res);

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('sk-test-secret');
  });

  it('returns the generated message on success', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-secret');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'Want to join your prep circle?' }] }),
    })));
    const res = mockRes();
    await handler({ method: 'POST', body: { recipientLabel: 'Student A', kind: 'proposal', details: {} } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'Want to join your prep circle?' });
  });

  it('sanitizes identity fields server-side even if the client did not', () => {
    const payload = parseVoiceBody({ recipientLabel: 'Student A', kind: 'proposal', details: identityDetails })!;
    expect(payload.details).toEqual({ start: '20:00', end: '21:00' });
    const prompt = buildUserPrompt(payload);
    for (const secret of HIDDEN) expect(prompt).not.toContain(secret);
  });

  it('keeps consented identities for reveal', () => {
    const payload = parseVoiceBody({ recipientLabel: 'Student A', kind: 'reveal', details: { members: 'Maya and Sumit' } })!;
    expect(payload.details).toEqual({ members: 'Maya and Sumit' });
  });

  it('accepts a raw JSON string body and ignores non-string detail values', () => {
    const payload = parseVoiceBody(JSON.stringify({ recipientLabel: 'Student A', kind: 'complete', details: { start: '20:00', n: 3 } }))!;
    expect(payload.details).toEqual({ start: '20:00' });
    expect(parseVoiceBody('not json')).toBeNull();
  });
});
