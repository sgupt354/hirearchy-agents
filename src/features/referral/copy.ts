import type { AgentEvent, Identity, TimeWindow } from '../../engine/types';
import { prettify, windowText, type EventView, type FeedContext } from '../../ui/copy';
import type { RuleResult } from './rules';

/** Plain-English feed rows for the Referral Bridge. */
export function describeReferral(e: AgentEvent, ctx: FeedContext): EventView {
  const p = e.payload;
  const who = ctx.label(e.from);
  const whose = who === 'You' ? 'Your' : `${who}'s`;
  switch (e.type) {
    case 'TRIGGER': {
      const o = p.opening as { company: string; role: string };
      return { title: 'Applied, looking for a referrer', icon: '🎯', tone: 'info', body: `${who} applied to ${o.company} ${o.role}. ${whose} agent looks for a referrer in the network.` };
    }
    case 'ESCALATE':
      if (p.kind === 'share') return { title: 'Asked before sharing', icon: '⏸️', tone: 'human', body: `${whose} agent asks its human before sharing anything.` };
      if (p.kind === 'decide') return { title: 'Referral needs a human', icon: '⏸️', tone: 'human', body: `Only ${ctx.label(e.from)}'s human can refer. The agent never does.` };
      return { title: 'Needs a human', icon: '⏸️', tone: 'human', body: `${whose} agent can't agree to meet on its own.` };
    case 'CONSENT':
      if (p.kind === 'share') return { title: 'OK to share, step by step', icon: '✓', tone: 'good', body: `${who} said yes: anonymous stats first, more only if it's a fit.` };
      return { title: 'Said yes to the chat', icon: '✓', tone: 'good', body: `${who} said yes to the chat, and to sharing names with the other side.` };
    case 'DISCOVER':
      return p.stage === 1
        ? { title: 'Stage 1: anonymous stats', icon: '↗', tone: 'info', body: `${who} shared sessions, rating, mock average, skills and target roles. No links, no name.` }
        : { title: 'Stage 2: project links + mock breakdown', icon: '↗', tone: 'info', body: `${who} shared project links and the rubric breakdown, now that it's a fit. Still no name.` };
    case 'ACCEPT':
    case 'REJECT':
      if (p.kind === 'fit') {
        const results = p.results as RuleResult[];
        const failed = results.filter((r) => !r.pass).map((r) => r.label.toLowerCase());
        return e.type === 'ACCEPT'
          ? { title: 'Fit check passed', icon: '✓', tone: 'good', body: `${whose} agent checked all ${results.length} private rules. Only its own human sees the result.` }
          : { title: 'Fit check failed', icon: '✗', tone: 'warn', body: `Failed: ${failed.join('; ')}. The seeker only hears "not right now".` };
      }
      return e.type === 'ACCEPT'
        ? { title: 'Agreed on a time', icon: '✓', tone: 'good', body: `${whose} agent: that time works. Decided on its own.` }
        : { title: 'Rejected on its own', icon: '✗', tone: 'warn', body: `${whose} agent: that time doesn't work.` };
    case 'PROPOSE':
      return { title: 'Negotiating a coffee chat', icon: '↔', tone: 'info', body: `Proposed ${windowText(p.window as TimeWindow)}, the first 15 minutes both are free. Each agent checks its private hours.` };
    case 'CONFLICT':
      return { title: 'No time works', icon: '⚠', tone: 'warn', body: 'No 15 minutes work for both.' };
    case 'DECLINE':
      if (p.kind === 'referral') return { title: 'Decided not to refer', icon: '✗', tone: 'muted', body: `${who}'s human decided not to refer this time.` };
      return { title: 'Said no', icon: '✗', tone: 'muted', body: `${who} said no to the chat. No names were shared.` };
    case 'DISSOLVED':
      return { title: p.reason === 'Not a fit right now' ? 'Not a fit right now' : 'Chat called off', icon: '∅', tone: 'muted', body: `${prettify(p.reason as string)}. No rule, threshold or name was shared.` };
    case 'REVEAL':
      return { title: 'Name unlocked', icon: '🔓', tone: 'good', body: `${ctx.label(e.to[0])} can now see ${(p.identities as Identity[]).map((i) => i.name).join(', ')}.` };
    case 'COMPLETE':
      if (p.kind === 'chat-done') return { title: 'Coffee chat happened', icon: '☕', tone: 'good', body: 'The 15-minute chat is done. Now the referrer decides.' };
      if (p.kind === 'referred') return { title: 'Referred', icon: '🤝', tone: 'good', body: "Referred, by the referrer's own decision. The agent only carried the message." };
      if (p.kind === 'credit') return { title: 'Give-back credit', icon: '⭐', tone: 'good', body: `+1 give-back credit for the referrer (${p.credits} total).` };
      if (p.kind === 'not-yet') return { title: 'Not yet, with coaching', icon: '🕗', tone: 'info', body: 'No referral used. The seeker got a coaching note on what to do next.' };
      break;
  }
  return { title: e.type, icon: '•', tone: 'info', body: prettify(e.human_readable) };
}
