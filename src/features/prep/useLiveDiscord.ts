import { useEffect, useRef, useState } from 'react';
import type { HumanReply, PhoneMessage } from '../../engine/types';
import { LIVE_POLL_MS, liveApi } from '../../live/client';
import { LivePoller } from '../../live/poller';
import { toHumanReply } from '../../live/protocol';

export type LiveStatus = 'off' | 'connecting' | 'live' | 'unavailable';

const newSession = () => crypto.randomUUID();

/**
 * Live Discord mode for Aditya: check the server is configured, DM them each prompt that needs them,
 * poll for their answer and apply it once, exactly like a tap on the simulated phone. Any failure flips
 * to 'unavailable' and the simulated phone keeps working.
 */
export function useLiveDiscord({ enabled, runKey, pending, onReply }: {
  enabled: boolean;
  /** Changes on every Reset: a new demo session id, nothing carried over. */
  runKey: number;
  /** Aditya's latest message if it's waiting for them, else null. */
  pending: PhoneMessage | null;
  onReply: (reply: HumanReply, bubble: string) => void;
}): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(enabled ? 'connecting' : 'off');
  const session = useRef(newSession());
  const notified = useRef(new Set<number>());
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const api = useRef(liveApi()).current;
  const poller = useRef<LivePoller | null>(null);

  // New run: new session, fresh poller, health check.
  useEffect(() => {
    if (!enabled) return setStatus('off');
    session.current = newSession();
    notified.current = new Set();
    poller.current = new LivePoller({
      fetchReply: api.reply,
      apply: (r) => {
        const { reply, bubble } = toHumanReply(r);
        onReplyRef.current(reply, bubble);
      },
      onUnavailable: () => setStatus('unavailable'),
    });
    let alive = true;
    setStatus('connecting');
    api.health().then((ok) => alive && setStatus(ok ? 'live' : 'unavailable'));
    return () => {
      alive = false;
    };
  }, [enabled, runKey, api]);

  // DM each new prompt once.
  const promptId = pending?.id ?? null;
  useEffect(() => {
    if (status !== 'live' || !pending || !pending.kind || notified.current.has(pending.id)) return;
    if (pending.kind !== 'proposal' && pending.kind !== 'counter') return;
    notified.current.add(pending.id);
    api
      .notify({ session: session.current, prompt: pending.id, kind: pending.kind, details: pending.details ?? {} })
      .then((ok) => !ok && setStatus('unavailable'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, promptId, runKey]);

  // Poll for their answer while the prompt is open.
  useEffect(() => {
    if (status !== 'live' || promptId === null) return;
    const id = promptId;
    const t = setInterval(() => void poller.current?.tick(session.current, id), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [status, promptId, runKey]);

  return status;
}
