import { useEffect, useRef, useState } from 'react';
import { LIVE_POLL_MS, liveApi } from '../../live/client';
import { LivePoller } from '../../live/poller';

export type LiveHelpStatus = 'off' | 'connecting' | 'live' | 'unavailable';

const newSession = () => crypto.randomUUID();

/**
 * Live Discord mode for Pay it forward: Aditya's "can you help?" goes out as a real DM through the existing
 * live-notify path (buttons, or typed yes / no), and his answer is applied once, like a tap on his phone.
 * Any failure flips to 'unavailable' and the simulated phone keeps working.
 */
export function useLiveHelp({ enabled, runKey, pending, onReply }: {
  enabled: boolean;
  /** Changes on every new run: a new demo session id, nothing carried over. */
  runKey: number;
  /** Aditya's open ask (its phone message id, and the anonymous details for the DM), else null. */
  pending: { prompt: number; details: Record<string, string> } | null;
  onReply: (choice: 'accept' | 'decline', bubble: string) => void;
}): LiveHelpStatus {
  const [status, setStatus] = useState<LiveHelpStatus>(enabled ? 'connecting' : 'off');
  const session = useRef(newSession());
  const notified = useRef(new Set<number>());
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const api = useRef(liveApi()).current;
  const poller = useRef<LivePoller | null>(null);

  useEffect(() => {
    if (!enabled) return setStatus('off');
    session.current = newSession();
    notified.current = new Set();
    poller.current = new LivePoller({
      fetchReply: api.reply,
      // A typed time ("8pm") means they want to help; the slot their agent already found is kept.
      apply: (r) => onReplyRef.current(r.action === 'decline' ? 'decline' : 'accept', r.action === 'decline' ? 'Not this time · via Discord' : 'I can help · via Discord'),
      onUnavailable: () => setStatus('unavailable'),
    });
    let alive = true;
    setStatus('connecting');
    api.health().then((ok) => alive && setStatus(ok ? 'live' : 'unavailable'));
    return () => {
      alive = false;
    };
  }, [enabled, runKey, api]);

  const prompt = pending?.prompt ?? null;
  useEffect(() => {
    if (status !== 'live' || !pending || notified.current.has(pending.prompt)) return;
    notified.current.add(pending.prompt);
    api
      .notify({ session: session.current, prompt: pending.prompt, student: 'a1', kind: 'help', details: pending.details })
      .then((ok) => !ok && setStatus('unavailable'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, prompt, runKey]);

  useEffect(() => {
    if (status !== 'live' || prompt === null) return;
    const t = setInterval(() => void poller.current?.tick(session.current, prompt), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [status, prompt, runKey]);

  return status;
}
