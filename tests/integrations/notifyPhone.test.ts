import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyPhone } from '../../src/integrations';
import handler, { MAX_CONTENT_LENGTH, parseNotifyBody } from '../../api/notify';

const FAKE_WEBHOOK = 'https://discord.example.invalid/api/webhooks/000/fake-token';

function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const okFetch = () => stubFetch(async () => ({ ok: true, status: 204 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('notifyPhone — request shape', () => {
  it('POSTs JSON to exactly /api/notify', async () => {
    const fetchMock = okFetch();
    await notifyPhone('Your prep circle is confirmed.');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notify');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Your prep circle is confirmed.' });
  });

  it('trims the text before sending', async () => {
    const fetchMock = okFetch();
    await notifyPhone('  hello  ');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ text: 'hello' });
  });

  it('passes an abort signal', async () => {
    const fetchMock = okFetch();
    await notifyPhone('hi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('resolves undefined on success', async () => {
    okFetch();
    await expect(notifyPhone('hi')).resolves.toBeUndefined();
  });
});

describe('notifyPhone — skips empty input', () => {
  it.each(['', '   ', '\n\t  \r\n'])('makes no request for %j and resolves', async (input) => {
    const fetchMock = okFetch();
    await expect(notifyPhone(input)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('notifyPhone — never throws outward', () => {
  it('resolves silently on a non-2xx response', async () => {
    stubFetch(async () => ({ ok: false, status: 503 }));
    await expect(notifyPhone('hi')).resolves.toBeUndefined();
  });

  it('resolves silently when fetch rejects', async () => {
    stubFetch(async () => { throw new TypeError('network down'); });
    await expect(notifyPhone('hi')).resolves.toBeUndefined();
  });

  it('resolves silently on an AbortError', async () => {
    stubFetch(async () => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    });
    await expect(notifyPhone('hi')).resolves.toBeUndefined();
  });

  it('resolves silently on an unexpected synchronous throw', async () => {
    stubFetch(() => { throw new Error('boom'); });
    await expect(notifyPhone('hi')).resolves.toBeUndefined();
  });
});

describe('notifyPhone — timeout', () => {
  it('aborts the request after 3 seconds without waiting in real time', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    stubFetch((_url, init) => {
      captured = init.signal as AbortSignal;
      return new Promise(() => {});
    });

    void notifyPhone('hi');
    await Promise.resolve();
    expect(captured!.aborted).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(captured!.aborted).toBe(true);
  });

  it('clears the timer once the request completes', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    okFetch();

    await notifyPhone('hi');
    expect(clearSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('/api/notify — validation', () => {
  const mockRes = () => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) { res.statusCode = code; return res; },
      json(body: unknown) { res.body = body; return body; },
    };
    return res;
  };

  it('returns 405 for non-POST requests', async () => {
    for (const method of ['GET', 'PUT', undefined]) {
      const res = mockRes();
      await handler({ method }, res);
      expect(res.statusCode).toBe(405);
    }
  });

  it.each([
    ['null body', null],
    ['missing text', {}],
    ['non-string text', { text: 42 }],
    ['empty text', { text: '' }],
    ['whitespace-only text', { text: '   \n' }],
    ['unparseable string body', 'not json'],
  ])('returns 400 for %s', async (_label, body) => {
    const res = mockRes();
    await handler({ method: 'POST', body }, res);
    expect(res.statusCode).toBe(400);
  });

  it('caps oversized text to the Discord-safe limit', () => {
    const capped = parseNotifyBody({ text: 'a'.repeat(5000) })!;
    expect(capped).toHaveLength(MAX_CONTENT_LENGTH);
    expect(MAX_CONTENT_LENGTH).toBeLessThan(2000);
  });

  it('accepts a raw JSON string body', () => {
    expect(parseNotifyBody(JSON.stringify({ text: ' hi ' }))).toBe('hi');
  });
});

describe('/api/notify — delivery', () => {
  const mockRes = () => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) { res.statusCode = code; return res; },
      json(body: unknown) { res.body = body; return body; },
    };
    return res;
  };

  const post = async (text = 'circle confirmed') => {
    const res = mockRes();
    await handler({ method: 'POST', body: { text } }, res);
    return res;
  };

  it('responds 503 when the webhook is not configured, without exposing env details', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', '');
    const res = await post();
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'notify_unavailable' });
  });

  it('POSTs { content } to the configured webhook', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    const fetchMock = stubFetch(async () => ({ ok: true, status: 204 }));

    const res = await post('circle confirmed');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FAKE_WEBHOOK);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'circle confirmed' });
    expect(res.statusCode).toBe(200);
  });

  it('treats a Discord 204 as success', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    stubFetch(async () => ({ ok: true, status: 204 }));
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('handles a Discord non-2xx response safely', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    stubFetch(async () => ({ ok: false, status: 429 }));
    const res = await post();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'notify_failed' });
  });

  it('handles a Discord fetch rejection safely', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    stubFetch(async () => { throw new Error('socket hang up'); });
    const res = await post();
    expect(res.statusCode).toBe(502);
  });

  it('never returns the webhook URL or token in an error body', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    stubFetch(async () => { throw new Error(`failed calling ${FAKE_WEBHOOK}`); });

    const res = await post();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(FAKE_WEBHOOK);
    expect(serialized).not.toContain('fake-token');
    expect(serialized).not.toContain('discord');
  });

  it('forwards only the capped content for oversized input', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', FAKE_WEBHOOK);
    const fetchMock = stubFetch(async () => ({ ok: true, status: 204 }));

    await post('b'.repeat(5000));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).content).toHaveLength(MAX_CONTENT_LENGTH);
  });
});
