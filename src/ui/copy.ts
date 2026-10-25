import type { Edge } from '../engine/cycles.js';
import { to12h } from '../engine/time.js';
import type { AgentEvent, Identity, Listing, PhoneMessage, TimeWindow } from '../engine/types.js';

// Presentation copy. The engine's own strings stay as the audit record; everything a person reads goes
// through here: 12-hour times, real arrows, labels instead of ids, short plain English.

/** "19:30","21:00" -> "7:30–9:00 PM" (suffix once when both match). */
export function range12(start: string, end: string): string {
  const [s, e] = [to12h(start), to12h(end)];
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)}–${e}` : `${s}–${e}`;
}

export const windowText = (w: TimeWindow) => range12(w.start, w.end);

/** Clean up any engine string: 24h ranges, "7:30 PM-9:00 PM", "->" arrows. */
export function prettify(text: string): string {
  return text
    .replace(/\b(\d{2}:\d{2})-(\d{2}:\d{2})\b/g, (_, a, b) => range12(a, b))
    .replace(/\b(\d{1,2}:\d{2}) (AM|PM) ?[-–] ?(\d{1,2}:\d{2}) (AM|PM)\b/g, (_, a, p, b, q) =>
      p === q ? `${a}–${b} ${q}` : `${a} ${p}–${b} ${q}`,
    )
    .replaceAll('->', '→');
}

/** Short label for a greyed-out node, from the broker's filter reason. */
export function shortReason(reason: string): string {
  if (/pipeline/.test(reason)) return 'Other pipeline';
  if (/invisible|no skills/.test(reason)) return 'Private profile';
  if (/complementary/.test(reason)) return 'Same skill only';
  if (/rejected/.test(reason)) return 'Busy tonight';
  if (/interview stage/.test(reason)) return 'Not interviewing';
  return 'Filtered';
}

/** Full, friendly filter reason for tooltips and the feed. */
export function longReason(reason: string): string {
  if (/pipeline/.test(reason)) return `Interviewing in a different pipeline ${reason.match(/\(.*\)/)?.[0] ?? ''}`.trim();
  if (/invisible|no skills/.test(reason)) return 'Keeps its skills private, so it never shows up';
  if (/complementary/.test(reason)) return 'Only needs the skill it already has, so no trade works';
  if (/rejected/.test(reason)) return "Its agent said no to the evening window on its own";
  return prettify(reason);
}

// ---- student chat ---------------------------------------------------------------------------------

const firstSentence = (s: string) => s.split('. ')[0];

/** Warm, short chat copy for a phone message (used when no integration rewrote it). */
export function studentCopy(m: PhoneMessage, company: string): string {
  const d = m.details ?? {};
  switch (m.kind) {
    case 'proposal':
      return d.updated === 'true'
        ? `New time suggested: tonight ${prettify(d.window)}. Same circle, same plan. Still in?`
        : `Found you a prep circle 🙌 ${d.circleSize} students in your ${company} pipeline. ` +
            `They'll help you with ${d.gets}; you help with ${d.gives}. Tonight ${prettify(d.window)}. ` +
            `Names stay hidden until everyone says yes. Are you in?`;
    case 'counter':
      if (d.status === 'proposing') return `Got it. Checking ${prettify(d.window)} with the others…`;
      if (d.status === 'rejected') return "That time doesn't work for someone in the circle, so the original time stands. Still in?";
      if (d.status === 'own_conflict') return `${prettify(d.window)} clashes with your own schedule. Want to try another time?`;
      return "I didn't catch a time there. Pick one below or try something like “8pm”.";
    case 'reveal':
      return '🔓 Everyone said yes! Names are unlocked.';
    case 'complete':
      return `You're all set for tonight, ${prettify(d.window)}.`;
  }
  const t = m.text;
  if (t.startsWith('Congrats')) return `Congrats on the ${company} interview! 🎉 I'm finding students in your pipeline to prep with.`;
  if (t.startsWith('You accepted')) return "You're in ✅ I'll let you know once everyone says yes.";
  if (t.startsWith('You declined')) return "No worries. Nothing about you was shared, and no one will know it was you.";
  if (t.startsWith("One member couldn't join")) return "Someone couldn't make it, so that circle is off. Nothing about you was shared. Finding you a new match…";
  return prettify(firstSentence(t));
}

// ---- under the hood ---------------------------------------------------------------------------------

export type Tone = 'info' | 'good' | 'warn' | 'human' | 'muted';

export interface EventView {
  title: string;
  body: string;
  tone: Tone;
  icon: string;
}

export interface FeedContext {
  label: (id: string) => string; // "You", "Applicant #3", "Broker"
  byId: Map<string, AgentEvent>;
}

const list = (items: string[]) => items.join(', ');

/** Human title + one-line body for the feed, built from the structured payload. */
export function describe(e: AgentEvent, ctx: FeedContext): EventView {
  const p = e.payload;
  const who = ctx.label(e.from);
  const whose = who === 'You' ? 'Your' : `${who}'s`;
  const replyWindow = () => {
    const src = ctx.byId.get(p.in_reply_to as string)?.payload;
    const w = (src?.window as TimeWindow | undefined) ?? (src?.windows as TimeWindow[] | undefined)?.[0];
    return w ? windowText(w) : 'the time';
  };

  switch (e.type) {
    case 'TRIGGER': {
      const pl = p.pipeline as { company: string; role: string };
      return { title: 'Interview detected', icon: '📩', tone: 'info', body: `${who} landed a ${pl.company} ${pl.role} interview. ${whose} agent wakes up.` };
    }
    case 'DISCOVER': {
      if (p.request === 'listing') return { title: 'Asked the network', icon: '📡', tone: 'info', body: `The broker asked all ${e.to.length} agents for anonymous listings.` };
      if ('listing' in p) {
        const l = p.listing as Listing | null;
        return l
          ? { title: 'Published anonymous listing', icon: '↗', tone: 'info', body: `${who} can help with ${list(l.offers)} and needs ${list(l.needs)}.` }
          : { title: 'Stayed invisible', icon: '🔒', tone: 'muted', body: `${who} keeps its skills private, so it publishes nothing.` };
      }
      if ('discovered' in p) return { title: 'Network scanned', icon: '📡', tone: 'info', body: `${p.discovered} agents found, ${p.listings} shared a listing. Every identity stays hidden.` };
      if (p.match) {
        const m = p.match as { edges: Edge[] };
        const chain = m.edges.map((x) => `${ctx.label(x.from)} → ${ctx.label(x.to)} (${list(x.skills)})`).join(' · ');
        const backups = [...new Set((p.backups as string[][]).flat())].filter((id) => !m.edges.some((x) => x.from === id));
        return { title: 'Circle found', icon: '✓', tone: 'good', body: chain + (backups.length ? ` · Backup: ${list(backups.map(ctx.label))}` : '') };
      }
      if (p.rediscover) return { title: 'Looking for another match', icon: '🔁', tone: 'info', body: 'Re-matching without the student who couldn’t join.' };
      break;
    }
    case 'FILTERED':
      return { title: 'Filtered out', icon: '⨯', tone: 'muted', body: `${ctx.label(p.handle as string)}: ${longReason(p.reason as string)}.` };
    case 'PROPOSE': {
      const w = p.window as TimeWindow | undefined;
      if (p.kind === 'availability_check') {
        return { title: 'Checked availability', icon: '↔', tone: 'info', body: `Asked ${list(e.to.map(ctx.label))} whether ${windowText((p.windows as TimeWindow[])[0])} works. Its hours are private.` };
      }
      if (p.kind === 'schedule' && p.counter) return { title: 'Checking the counter-offer', icon: '↔', tone: 'info', body: `Each agent checks ${windowText(w!)} against its own private hours.` };
      if (p.kind === 'schedule') return { title: 'Negotiating', icon: '↔', tone: 'info', body: `Proposed ${windowText(w!)}, the overlap everyone shares. Each agent checks its private hours.` };
      return p.updated
        ? { title: 'New time sent', icon: '↔', tone: 'info', body: `Everyone is asked again for ${windowText(w!)}.` }
        : { title: 'Invited to join', icon: '↔', tone: 'info', body: `The circle is invited to meet ${windowText(w!)}.` };
    }
    case 'ACCEPT':
      return { title: 'Agreed on a time', icon: '✓', tone: 'good', body: `${whose} agent: ${replyWindow()} works. Decided on its own.` };
    case 'REJECT':
      return { title: 'Rejected on its own', icon: '✗', tone: 'warn', body: `${whose} agent: ${replyWindow()} is outside my hours.` };
    case 'CONFLICT':
      if (p.resolved) return { title: 'Window agreed', icon: '✓', tone: 'good', body: `Common window: ${windowText(p.window as TimeWindow)}.` };
      if (p.counter_rejected) return { title: "Counter-offer didn't fit", icon: '⚠', tone: 'warn', body: 'It falls outside someone’s hours, so the original time stands.' };
      return { title: 'Schedules conflict', icon: '⚠', tone: 'warn', body: prettify(p.reason as string).replace(/^Schedules conflict: /, '') };
    case 'ESCALATE':
      return { title: 'Needs a human', icon: '⏸️', tone: 'human', body: `${whose} agent can't decide this alone: join, and share name and contact?` };
    case 'COUNTER':
      return { title: 'Counter-offer', icon: '🕗', tone: 'warn', body: `${who} suggested ${windowText(p.window as TimeWindow)}.` };
    case 'CONSENT':
      return { title: 'Said yes', icon: '✓', tone: 'good', body: `${who} said yes.` };
    case 'DECLINE':
      return { title: 'Said no', icon: '✗', tone: 'muted', body: `${who} said no. Only the broker sees who.` };
    case 'DISSOLVED':
      return { title: 'Circle dissolved', icon: '∅', tone: 'muted', body: `${prettify(p.reason as string)}. Nothing was revealed, and no one is told who left.` };
    case 'REVEAL':
      return { title: 'Names unlocked', icon: '🔓', tone: 'good', body: `${ctx.label(e.to[0])} can now see ${list((p.identities as Identity[]).map((i) => i.name))}.` };
    case 'COMPLETE': {
      const pl = p.pipeline as { company: string; role: string };
      return { title: 'Circle created', icon: '🎉', tone: 'good', body: `${pl.company} ${pl.role} · ${windowText(p.window as TimeWindow)} · ${list(p.skills as string[])}` };
    }
  }
  return { title: e.type, icon: '•', tone: 'info', body: prettify(e.human_readable) };
}

/** Friendly coordination state for badges. */
export const STATE_TEXT: Record<string, string> = {
  IDLE: 'Ready',
  TRIGGERED: 'Interview detected',
  DISCOVERING: 'Scanning the network',
  MATCH_FOUND: 'Circle found',
  NEGOTIATING: 'Negotiating',
  CONFLICT_FOUND: 'Resolving a conflict',
  CONFLICT_RESOLVED: 'Window agreed',
  AWAITING_HUMANS: 'Waiting on students',
  COUNTERED: 'Counter-offer',
  AWAITING_CONSENT: 'Waiting on students',
  CONSENT_COMPLETE: 'Everyone said yes',
  IDENTITIES_REVEALED: 'Names unlocked',
  COMPLETED: 'Circle created',
  DECLINED: 'Someone said no',
  DISSOLVED: 'Circle dissolved',
  REDISCOVERING: 'Finding a new match',
};
