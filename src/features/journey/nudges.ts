import { isClosed, type Application } from '../apply/applications';
import { createMockSeed } from '../mock/seed';
import { personOf } from '../trust/people';
import { range12 } from '../../ui/copy';
import { intelAvailable, readiness } from './readiness';

// The proactive agent: timed nudges planned from the application record and the demo clock. Pure and deterministic.
// Nothing here sends anything; the caller delivers what planNudges returns (to the phone, and to Discord in live mode).

export type NudgeKind = 'mock' | 'circle' | 'intel';

export interface Nudge {
  /** `${appId}|${kind}`: each kind goes out at most once per application. */
  id: string;
  appId: string;
  owner: string;
  kind: NudgeKind;
  /** Demo-clock time it was planned ("YYYY-MM-DDTHH:MM"). */
  at: string;
  text: string;
  action: { label: string; tab: 'mock' | 'prep' | 'intel' };
  /** Structured fields for the Discord copy (built server-side from these, never from free text). */
  details: Record<string, string>;
}

export interface NudgeState {
  sent: Nudge[];
  /** Muted application ids. */
  muted: string[];
  mutedAll: boolean;
}

export const EMPTY_NUDGES: NudgeState = { sent: [], muted: [], mutedAll: false };
/** Rate limits: per application per day, and per student per day. */
export const PER_APP_PER_DAY = 1;
export const PER_STUDENT_PER_DAY = 2;
const MOCK_WINDOW_HOURS = 48;
const SOON_DAYS = 7;

const hoursUntil = (now: string, ymd: string) => (Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${now}:00Z`)) / 3_600_000;

/**
 * A peer from the mock network who covers the topic and is free this evening: never the student themselves, and
 * never someone they've already practiced with as often as the mock network allows (the Mock tab's own rule).
 */
export function eveningPeer(company: string, topic: string | undefined, owner: string) {
  const seed = createMockSeed();
  const me = seed.find((p) => personOf(p.agent_id) === owner);
  const repeatsLeft = (p: (typeof seed)[number]) =>
    !me || ((p.practiced[me.agent_id] ?? 0) < p.max_repeats && (me.practiced[p.agent_id] ?? 0) < me.max_repeats);
  return (
    seed.find(
      (p) =>
        p.pipeline.company === company &&
        personOf(p.agent_id) !== owner &&
        repeatsLeft(p) &&
        (!topic || p.offers.includes(topic as never)) &&
        p.availability.some((w) => w.start >= '17:00'),
    ) ?? null
  );
}

/** What to send now, after mutes and rate limits. Highest-priority candidate per application. */
export function planNudges(apps: Application[], now: string, state: NudgeState): Nudge[] {
  const today = now.slice(0, 10);
  const sentToday = state.sent.filter((n) => n.at.slice(0, 10) === today);
  const out: Nudge[] = [];
  for (const app of apps) {
    if (state.mutedAll || state.muted.includes(app.id)) continue;
    if (isClosed(app.stage) || (app.stage !== 'Interview' && app.stage !== 'OA') || !app.interviewDate) continue;
    const r = readiness(app, today);
    if (!r.ready) continue;
    if ([...sentToday, ...out].filter((n) => n.appId === app.id).length >= PER_APP_PER_DAY) continue;
    if ([...sentToday, ...out].filter((n) => n.owner === app.owner).length >= PER_STUDENT_PER_DAY) continue;
    const already = new Set(state.sent.filter((n) => n.appId === app.id).map((n) => n.kind));
    const next = candidates(app, now, r).find((c) => !already.has(c.kind));
    if (next) out.push({ ...next, id: `${app.id}|${next.kind}`, appId: app.id, owner: app.owner, at: now });
  }
  return out;
}

type Candidate = Pick<Nudge, 'kind' | 'text' | 'action' | 'details'>;

function candidates(app: Application, now: string, r: Extract<ReturnType<typeof readiness>, { ready: true }>): Candidate[] {
  const out: Candidate[] = [];
  const hours = hoursUntil(now, app.interviewDate!);
  const has = (k: string) => app.links.some((l) => l.kind === k);
  const mocks = r.parts.find((p) => p.id === 'mocks')!;
  if (hours <= MOCK_WINDOW_HOURS && (r.missingTopics.length || mocks.points < mocks.max)) {
    const topic = r.missingTopics[0];
    const peer = eveningPeer(app.company, topic, app.owner);
    if (peer) {
      const slot = peer.availability.find((w) => w.start >= '17:00')!;
      const when = range12(slot.start, slot.end);
      const skill = topic ?? 'your round';
      out.push({
        kind: 'mock',
        text: `Under 48 hours to your ${app.company} interview. A student in your pipeline who's strong in ${skill} is free tonight, ${when}. Want a mock?`,
        action: { label: 'Set up the mock', tab: 'mock' },
        details: { status: 'mock', company: app.company, text: skill, window: when },
      });
    }
  }
  if (r.daysLeft <= SOON_DAYS && !has('prep')) {
    out.push({
      kind: 'circle',
      text: `Your ${app.company} interview is in ${r.daysLeft} ${r.daysLeft === 1 ? 'day' : 'days'} and you don't have a prep circle yet. Want me to find one?`,
      action: { label: 'Find a prep circle', tab: 'prep' },
      details: { status: 'circle', company: app.company, text: String(r.daysLeft) },
    });
  }
  const intel = r.parts.find((p) => p.id === 'intel');
  if (r.daysLeft <= SOON_DAYS && intel && intel.points < intel.max) {
    const n = intelAvailable(app.company);
    out.push({
      kind: 'intel',
      text: `${n} anonymous ${app.company} interview reports are waiting. Read them before your interview?`,
      action: { label: 'Read the intel', tab: 'intel' },
      details: { status: 'intel', company: app.company, text: String(n) },
    });
  }
  return out;
}
