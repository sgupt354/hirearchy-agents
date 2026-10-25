import type { LiveRating, LiveReply, NotifyBody, RatingNotifyBody } from './protocol';

export const LIVE_POLL_MS = 800;

/** Live mode is opt-in per page load: ?live=1 */
export const isLiveRequested = (search = typeof window === 'undefined' ? '' : window.location.search) =>
  new URLSearchParams(search).get('live') === '1';

/** Browser calls to the live functions. Never throws except from reply(), so the poller can count failures. */
export function liveApi(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return {
    async health(): Promise<boolean> {
      try {
        const r = await fetchImpl('/api/live-state?health=1', { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return false;
        const b = (await r.json()) as { ok?: unknown };
        return b?.ok === true;
      } catch {
        return false;
      }
    },
    async notify(body: NotifyBody | RatingNotifyBody): Promise<boolean> {
      try {
        const r = await fetchImpl('/api/live-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        return r.ok;
      } catch {
        return false;
      }
    },
    async reply(session: string, prompt: number, student = 'a1'): Promise<LiveReply | null> {
      const r = await fetchImpl(`/api/live-state?session=${encodeURIComponent(session)}&prompt=${prompt}&student=${encodeURIComponent(student)}`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`live_state_${r.status}`);
      const b = (await r.json()) as { reply?: LiveReply | null };
      return b.reply ?? null;
    },
    /** The student's private ratings from Discord for this session, by member. */
    async ratings(session: string, student = 'a1'): Promise<Record<string, LiveRating>> {
      const r = await fetchImpl(`/api/live-state?session=${encodeURIComponent(session)}&ratings=1&student=${encodeURIComponent(student)}`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`live_state_${r.status}`);
      const b = (await r.json()) as { ratings?: Record<string, LiveRating> };
      return b.ratings ?? {};
    },
  };
}
