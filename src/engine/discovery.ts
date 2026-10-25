import { abstract, canShare } from './policy';
import { fromMinutes, toMinutes } from './time';
import type { AgentProfile, Disclosure, Listing, TimeWindow } from './types';

const IDENTITY_FIELDS = ['name', 'email', 'discord', 'notes'];

export interface ListingResult {
  listing: Listing | null;
  disclosure: Disclosure;
}

/** Widen to 30-minute boundaries so only an approximate band leaves the agent. */
export function approxBand(windows: TimeWindow[]): TimeWindow[] {
  return windows.map((w) => ({
    start: fromMinutes(Math.floor(toMinutes(w.start) / 30) * 30),
    end: fromMinutes(Math.ceil(toMinutes(w.end) / 30) * 30),
  }));
}

/** Built by each agent from its own policy. Returns null when the agent shares no skills. */
export function buildListing(agent: AgentProfile): ListingResult {
  if (!canShare(agent, 'offers')) {
    return {
      listing: null,
      disclosure: { shared: [], abstracted: [], withheld: ['skills', 'availability', 'stage', ...IDENTITY_FIELDS] },
    };
  }

  const shared = ['pipeline', 'stage', 'offers', 'needs', 'min session length'];
  const abstracted: string[] = [];
  const withheld: string[] = [];
  const listing: Listing = {
    handle: agent.agent_id,
    label: agent.label,
    pipeline: { ...agent.pipeline },
    stage: agent.stage_public,
    offers: [...agent.offers],
    needs: [...agent.needs],
    min_session_minutes: agent.policy.min_session_minutes,
  };

  if (canShare(agent, 'stage_exact')) {
    listing.stage_detail = agent.private.stage;
    shared.push('exact stage');
  } else {
    withheld.push('exact stage');
  }

  if (canShare(agent, 'availability')) {
    listing.availability = approxBand(agent.availability);
    shared.push('availability (approx)');
  } else {
    withheld.push('availability');
  }

  const urgency = abstract(agent, 'interview_date');
  if (urgency) {
    listing.urgency = urgency;
    abstracted.push(`interview date -> "${urgency}"`);
  } else {
    withheld.push('interview date');
  }

  withheld.push(...IDENTITY_FIELDS);
  return { listing, disclosure: { shared, abstracted, withheld } };
}

export interface FilterResult {
  candidates: Listing[];
  filtered: { handle: string; reason: string }[];
}

/**
 * Broker-side filtering over anonymized listings, in a fixed order:
 * pipeline -> visibility (no listing) -> stage -> complementary skills.
 */
export function filterListings(
  trigger: Listing,
  responses: { handle: string; listing: Listing | null }[],
): FilterResult {
  const filtered: FilterResult['filtered'] = [];
  const others = responses.filter((r) => r.handle !== trigger.handle);

  const samePipeline = (l: Listing) =>
    l.pipeline.company === trigger.pipeline.company && l.pipeline.role === trigger.pipeline.role;

  const visible: Listing[] = [];
  for (const r of others) {
    if (r.listing && !samePipeline(r.listing)) {
      filtered.push({ handle: r.handle, reason: `different pipeline (${r.listing.pipeline.company} / ${r.listing.pipeline.role})` });
    }
  }
  for (const r of others) {
    if (!r.listing) filtered.push({ handle: r.handle, reason: 'invisible to discovery (shares no skills)' });
  }
  for (const r of others) {
    if (!r.listing || !samePipeline(r.listing)) continue;
    if (r.listing.stage !== 'interview') {
      filtered.push({ handle: r.handle, reason: 'not at interview stage' });
    } else if (!hasComplementarySkills(r.listing)) {
      filtered.push({ handle: r.handle, reason: 'no complementary skills (needs only what it already offers)' });
    } else {
      visible.push(r.listing);
    }
  }

  return { candidates: [trigger, ...visible], filtered };
}

/** A listing can only trade if it needs something it doesn't already offer. */
export function hasComplementarySkills(l: Pick<Listing, 'offers' | 'needs'>): boolean {
  return l.needs.some((n) => !l.offers.includes(n));
}
