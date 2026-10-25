import type { AgentEvent, Identity, TimeWindow } from '../../engine/types';
import { prettify, windowText, type EventView, type FeedContext } from '../../ui/copy';
import type { Listing, RuleCheck } from './community';
import type { PointEntry } from './points';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Plain-English feed rows for Pay it forward. */
export function describeCommunity(e: AgentEvent, ctx: FeedContext): EventView {
  const p = e.payload;
  const who = ctx.label(e.from);
  const project = describeProject(e, who);
  if (project) return project;
  switch (e.type) {
    case 'TRIGGER':
      if (p.kind === 'online') return { title: 'A mentor came online', icon: '📡', tone: 'info', body: `${who}'s agent can take help requests now. Open requests get re-matched.` };
      return { title: 'Asked for help', icon: '🎯', tone: 'info', body: `${who} needs help with ${p.topic} for a ${p.company} ${String(p.round).toLowerCase()} round.` };
    case 'CONFLICT':
      return { title: 'No prep circle possible', icon: '⚠', tone: 'warn', body: `A circle is a trade, and ${ctx.label(e.to[0])} has nothing to trade yet. So the agent asks for help instead.` };
    case 'DISCOVER': {
      const l = p.listing as Listing;
      return { title: 'Anonymous help request', icon: '↗', tone: 'info', body: `${l.topic} for ${l.company} ${l.round.toLowerCase()}, deadline "${l.deadline}". No name, no exact date. It stays open until the deadline.` };
    }
    case 'ACCEPT':
    case 'REJECT': {
      const results = (p.results as RuleCheck[]) ?? [];
      const failed = results.filter((r) => !r.pass).map((r) => `${lowerFirst(r.label)} (${r.observed})`);
      return e.type === 'ACCEPT'
        ? { title: 'Capacity check passed', icon: '✓', tone: 'good', body: `${who}'s agent checked its human's private rules (${results.map((r) => lowerFirst(r.label)).join('; ')}) and offered to help.` }
        : { title: 'Capacity check: not a fit', icon: '✗', tone: 'warn', body: `${who}'s agent passed on its own: ${failed.join('; ')}. Only its human sees why.` };
    }
    case 'PROPOSE':
      return { title: 'Matched', icon: '↔', tone: 'info', body: `Proposed ${windowText(p.window as TimeWindow)} for ${p.topic}. Both humans decide; names stay hidden until both say yes.` };
    case 'ESCALATE':
      return { title: 'Needs a human', icon: '⏸️', tone: 'human', body: `${who}'s agent can't agree to meet on its own.` };
    case 'CONSENT':
      return { title: 'Said yes', icon: '✓', tone: 'good', body: `${who} said yes, and to sharing names with the other side.` };
    case 'DECLINE':
      return { title: 'Said no', icon: '✗', tone: 'muted', body: `${who} said no. It costs no points, nothing was shared, and the request stays open.` };
    case 'REVEAL':
      return { title: 'Name unlocked', icon: '🔓', tone: 'good', body: `${ctx.label(e.to[0])} can now see ${(p.identities as Identity[]).map((i) => i.name).join(', ')}.` };
    case 'DISSOLVED':
      return p.kind === 'expired'
        ? { title: 'Request expired', icon: '∅', tone: 'muted', body: 'The deadline passed, so the request closed on its own.' }
        : { title: 'Request withdrawn', icon: '∅', tone: 'muted', body: 'The newcomer cancelled. No names were shared, and nobody lost points.' };
    case 'COMPLETE':
      if (p.kind === 'confirm') return { title: 'Confirmed the session', icon: '✓', tone: 'good', body: `${who} confirmed it happened. Points need both confirmations.` };
      if (p.kind === 'points') {
        const x = p.entry as PointEntry;
        return x.capped
          ? { title: 'Session counted, no points', icon: '⭐', tone: 'muted', body: `${ctx.label(e.to[0])}: ${x.reason}.` }
          : { title: `+${x.points} points`, icon: '⭐', tone: 'good', body: `${ctx.label(e.to[0])}: ${x.base} base x ${x.multiplier} (${x.reason}). Both sides confirmed; deterministic, no model involved.` };
      }
      if (p.kind === 'level-up') return { title: `Level up: ${p.to}`, icon: '⭐', tone: 'good', body: `${ctx.label(e.to[0])} went from ${p.from} to ${p.to}. Perks: matching priority, a badge, more packs and a stronger mentor profile.` };
      if (p.kind === 'rated') return { title: 'Rated privately', icon: '✓', tone: 'good', body: `${who} rated the other side. Only aggregates are ever shown.` };
      break;
  }
  return { title: e.type, icon: '•', tone: 'info', body: prettify(e.human_readable) };
}

/** Project board rows (Phase C), or null for anything else. */
function describeProject(e: AgentEvent, who: string): EventView | null {
  const p = e.payload;
  switch (p.kind) {
    case 'project': {
      const x = p.project as { title: string; stack: string[]; hoursPerWeek: number; roles: string[] };
      return { title: 'Project posted', icon: '📋', tone: 'info', body: `${who} posted "${x.title}": ${x.stack.join(', ')}, up to ${x.hoursPerWeek} h/week, roles ${x.roles.join(' and ').toLowerCase()}. The shortlist rules stay private.` };
    }
    case 'application': {
      const a = p.application as { handle: string; skills: string[]; hoursPerWeek: number; role: string };
      return { title: 'Anonymous application', icon: '↗', tone: 'info', body: `${a.handle}: ${a.skills.join(', ')}, ${a.hoursPerWeek} h/week, ${a.role.toLowerCase()}. No name.` };
    }
    case 'shortlist': {
      const checks = p.checks as { label: string; pass: boolean; observed: string }[];
      const failed = checks.filter((c) => !c.pass).map((c) => `${lowerFirst(c.label)} (${c.observed})`);
      return e.type === 'ACCEPT'
        ? { title: 'Shortlisted', icon: '✓', tone: 'good', body: `${who}'s agent shortlisted ${p.handle} by its human's private rules.` }
        : { title: 'Not shortlisted', icon: '✗', tone: 'warn', body: `${who}'s agent passed on ${p.handle}: ${failed.join('; ')}. Only the senior sees why.` };
    }
    case 'pick':
      return { title: 'Senior picked an applicant', icon: '✓', tone: 'good', body: `${who} picked ${p.handle}. That is the senior's yes; names still wait for the junior's.` };
    case 'join':
      if (e.type === 'ESCALATE') return { title: 'Needs a human', icon: '⏸️', tone: 'human', body: `${who}'s agent can't join a project on its own.` };
      if (e.type === 'DECLINE') return { title: 'Said no', icon: '✗', tone: 'muted', body: `${who} said no. Nothing shared, nothing lost.` };
      return { title: 'Said yes to joining', icon: '✓', tone: 'good', body: `${who} said yes, and to sharing names with the senior.` };
    case 'hours':
      return { title: `Logged ${p.hours} h`, icon: '⏱', tone: 'info', body: `${who} logged ${p.hours} hours for ${p.week}. The weekly cap is a hard limit.` };
    case 'left':
      return { title: 'Left the project', icon: '∅', tone: 'muted', body: `${who} left. Their hours stay credited and they lose no points.` };
  }
  return null;
}
