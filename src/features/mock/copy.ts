import type { AgentEvent, Identity, Skill, TimeWindow } from '../../engine/types';
import { longReason, prettify, windowText, type EventView, type FeedContext } from '../../ui/copy';
import type { MockListing } from './matching';

const list = (xs: string[]) => xs.join(', ');

/** Plain-English feed rows for the mock-interview swap. */
export function describeMock(e: AgentEvent, ctx: FeedContext): EventView {
  const p = e.payload;
  const who = ctx.label(e.from);
  const whose = who === 'You' ? 'Your' : `${who}'s`;
  switch (e.type) {
    case 'TRIGGER': {
      const pl = p.pipeline as { company: string };
      return { title: 'Mock round coming up', icon: '🎤', tone: 'info', body: `${who} has a ${pl.company} ${String(p.round).toLowerCase()} round coming up. ${whose} agent looks for a mock partner.` };
    }
    case 'DISCOVER': {
      if (p.request === 'listing') return { title: 'Asked the network', icon: '📡', tone: 'info', body: `The broker asked all ${e.to.length} agents for anonymous mock listings.` };
      if ('listing' in p) {
        const l = p.listing as MockListing | null;
        if (!l) return { title: 'Stayed invisible', icon: '🔒', tone: 'muted', body: `${who} keeps its skills private.` };
        return { title: 'Published anonymous listing', icon: '↗', tone: 'info', body: `${l.pipeline.company} ${l.round.toLowerCase()} round · strong in ${list(l.offers)} · working on ${list(l.needs)} · ${l.difficulty} difficulty` };
      }
      if (p.match) {
        const m = p.match as { members: string[]; teaches: Record<string, Skill[]> };
        const covers = [...new Set(Object.values(m.teaches).flat())];
        const backups = (p.backups as string[]).map(ctx.label);
        return {
          title: 'Mock partner found',
          icon: '✓',
          tone: 'good',
          body: `${m.members.map(ctx.label).join(' ↔ ')}${covers.length ? `, covering ${covers.join(' + ')}` : ''}${backups.length ? ` · Backup: ${list(backups)}` : ''}`,
        };
      }
      break;
    }
    case 'FILTERED':
      return { title: 'Filtered out', icon: '⨯', tone: 'muted', body: `${ctx.label(p.handle as string)}: ${longReason(p.reason as string)}.` };
    case 'REJECT':
      if (p.handle) return { title: 'Skipped on a private rule', icon: '✗', tone: 'warn', body: `${whose} agent skipped ${ctx.label(p.handle as string)}. Why stays private.` };
      return { title: 'Rejected on its own', icon: '✗', tone: 'warn', body: `${whose} agent: that hour doesn't work.` };
    case 'PROPOSE': {
      const w = p.window as TimeWindow | undefined;
      if (p.kind === 'schedule') return { title: 'Negotiating', icon: '↔', tone: 'info', body: `Proposed ${windowText(w!)}, the first hour both are free. Each agent checks its private hours.` };
      if (p.kind === 'join') return { title: 'Invited to swap', icon: '↔', tone: 'info', body: `Both are invited to swap mocks ${windowText(w!)}: 30 minutes each way.` };
      if (p.kind === 'pack') return { title: 'Question pack ready', icon: '📋', tone: 'info', body: `${ctx.label(e.to[0])} gets ${p.count} ${list(p.areas as string[])} questions from anonymized reports, plus the rubric.` };
      break;
    }
    case 'ACCEPT':
      return { title: 'Agreed on a time', icon: '✓', tone: 'good', body: `${whose} agent: that hour works. Decided on its own.` };
    case 'CONFLICT':
      return { title: 'No hour works', icon: '⚠', tone: 'warn', body: 'No shared hour; trying the next partner.' };
    case 'ESCALATE':
      return { title: 'Needs a human', icon: '⏸️', tone: 'human', body: `${whose} agent can't agree to a mock on its own.` };
    case 'CONSENT':
      if (p.kind === 'solo') return { title: 'Chose agent practice', icon: '🤖', tone: 'good', body: `${who} chose to practice with their own agent.` };
      return { title: 'Said yes', icon: '✓', tone: 'good', body: `${who} said yes.` };
    case 'DECLINE':
      return { title: 'Said no', icon: '✗', tone: 'muted', body: `${who} said no. Only the broker sees who.` };
    case 'DISSOLVED':
      return { title: p.reason === "One person couldn't make it" ? 'Pair dissolved' : 'No peer free', icon: '∅', tone: 'muted', body: `${prettify(p.reason as string)}. Nothing was revealed.` };
    case 'REVEAL':
      return { title: 'Name unlocked', icon: '🔓', tone: 'good', body: `${ctx.label(e.to[0])} can now see ${list((p.identities as Identity[]).map((i) => i.name))}.` };
    case 'COMPLETE':
      if (p.kind === 'round') return { title: `Round ${p.n} done`, icon: '⏱', tone: 'good', body: p.n === 1 ? 'Seats swap: the candidate interviews now.' : 'Both rounds done. Time to score.' };
      if (p.kind === 'feedback') return { title: 'Feedback sent privately', icon: '🔒', tone: 'good', body: `${who} scored ${ctx.label(p.subject as string)}. Only they can see it.` };
      if (p.kind === 'done') return { title: 'Mock swap complete', icon: '🎉', tone: 'good', body: 'Each person got their own scores, privately.' };
      if (p.kind === 'solo-done') return { title: 'Practice finished', icon: '🎉', tone: 'good', body: `${who} finished a practice mock. Self-scores stay on their phone.` };
      break;
  }
  return { title: e.type, icon: '•', tone: 'info', body: prettify(e.human_readable) };
}
