import { useEffect, useRef, useState } from 'react';
import type { HumanReply, PhoneMessage } from '../../engine/types';
import { LIVE_POLL_MS, liveApi } from '../../live/client';
import { LivePoller } from '../../live/poller';
import { toHumanReply, type RatingPerson } from '../../live/protocol';
import type { Rating } from '../trust/ledger';

export type LiveStatus = 'off' | 'connecting' | 'live' | 'unavailable';

const newSession = () => crypto.randomUUID();

/**
 * Live Discord mode for Aditya: check the server is configured, DM them each prompt that needs them,
 * poll for their answer and apply it once, exactly like a tap on the simulated phone. Any failure flips
 * to 'unavailable' and the simulated phone keeps working.
 */
export function useLiveDiscord({ enabled, runKey, pending, onReply, rating = null, onRated }: {
  enabled: boolean;
  /** Changes on every Reset: a new demo session id, nothing carried over. */
  runKey: number;
  /** Aditya's latest message if it's waiting for them, else null. */
  pending: PhoneMessage | null;
  onReply: (reply: HumanReply, bubble: string) => void;
  /** Set once the circle has met and Aditya hasn't rated it yet: who to rate. */
  rating?: { people: RatingPerson[] } | null;
  /** All of Aditya's ratings arrived from Discord (a no-show counts as helpful 1, like the web card). */
  onRated?: (ratings: Record<string, Rating>) => void;
}): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(enabled ? 'connecting' : 'off');
  const session = useRef(newSession());
  const notified = useRef(new Set<number>());
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const onRatedRef = useRef(onRated);
  onRatedRef.current = onRated;
  const ratingSent = useRef(false);
  const ratingApplied = useRef(false);
  const api = useRef(liveApi()).current;
  const poller = useRef<LivePoller | null>(null);

  // New run: new session, fresh poller, health check.
  useEffect(() => {
    if (!enabled) return setStatus('off');
    session.current = newSession();
    notified.current = new Set();
    ratingSent.current = false;
    ratingApplied.current = false;
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
      .notify({ session: session.current, prompt: pending.id, student: 'a1', kind: pending.kind, details: pending.details ?? {} })
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

  // After the session: DM the rating selects once, then poll until every member is rated.
  const ratingKey = rating ? rating.people.map((p) => p.id).join(',') : '';
  useEffect(() => {
    if (status !== 'live' || !rating || ratingSent.current) return;
    ratingSent.current = true;
    void api.notify({ session: session.current, student: 'a1', kind: 'rating', people: rating.people });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ratingKey, runKey]);

  useEffect(() => {
    if (status !== 'live' || !rating) return;
    const ids = rating.people.map((p) => p.id);
    const t = setInterval(() => {
      const thisSession = session.current;
      api
        .ratings(thisSession)
        .then((got) => {
          if (ratingApplied.current || thisSession !== session.current || !ids.every((id) => got[id])) return;
          ratingApplied.current = true;
          onRatedRef.current?.(Object.fromEntries(ids.map((id) => [id, { showedUp: got[id].showedUp, helpful: got[id].helpful ?? 1 }])));
        })
        .catch(() => undefined); // the rating card on the web phone still works
    }, LIVE_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ratingKey, runKey]);

  return status;
}
