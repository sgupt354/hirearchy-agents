import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '../../engine/types';
import { isLiveRequested } from '../../live/client';
import { downloadIcs } from '../../ui/integrations';
import { CalendarCard, Drawer, Inspector, JudgeLegend, SPEEDS, clock, range12, type Lens } from '../../ui/kit';
import type { TabProps } from '../types';
import { trust as sharedTrust } from '../trust/network';
import { personOf } from '../trust/people';
import { EvidenceCard, RatingCard } from '../trust/TrustCards';
import { useTrust } from '../trust/useTrust';
import { CommunityHub, PointsCannotBuyReferralError, type CommunityMessage, type NeedChange, type NeedState, type RuleCheck } from './community';
import { CommunityPhone, type CommunityChatItem } from './CommunityPhone';
import { describeCommunity } from './copy';
import { levelOf, nextLevel, perksFor, type PointEntry } from './points';
import { DEMO_NEED, MENTOR, NEWCOMER, ONLINE_AT_START, STANDING_SEED, createCommunitySeed, MENTOR_RULES } from './seed';
import { useLiveHelp, type LiveHelpStatus } from './useLiveHelp';

const NAMES: Record<string, string> = { [NEWCOMER]: 'Priya', [MENTOR]: 'Aditya' };
const LABELS: Record<string, string> = { a9: 'Newcomer #9', a1: 'Applicant #1', a6: 'Applicant #6', a7: 'Applicant #7' };
const NEED_TEXT: Record<NeedState, string> = {
  OPEN: 'Waiting for a mentor',
  MATCHED: 'Asking both students',
  BOOKED: 'Session booked',
  DONE: 'Done',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

interface Reply {
  after: number;
  text: string;
  time: string;
}

const stateAt = (history: NeedChange[], cursor: number, need: string | null): NeedState | null =>
  need ? history.filter((h) => h.need === need && h.afterEvents <= cursor).at(-1)?.to ?? null : null;

const first = (name: string) => name.split(' ')[0];

/** Pay it forward: a newcomer with nothing to trade asks for help; a mentor's agent decides from private rules. */
export function CommunityTab({ speed, resetKey }: TabProps) {
  const hub = useMemo(() => new CommunityHub(sharedTrust, createCommunitySeed, MENTOR_RULES, STANDING_SEED, ONLINE_AT_START), []);
  const trustNet = useTrust();
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const [refusal, setRefusal] = useState('');
  const [needId, setNeedId] = useState<string | null>(null);
  const run = useRef(0);

  const events = hub.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(hub.history(), cursor, needId);
  const label = (id: string) => (id === 'broker' ? 'Broker' : (LABELS[id] ?? id));

  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].step);
    return () => clearTimeout(t);
  }, [cursor, caughtUp, speed]);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

  const act = (fn: () => void): boolean => {
    setError('');
    let ok = true;
    try {
      fn();
    } catch (e) {
      ok = false;
      setError((e as Error).message);
    }
    setVersion((v) => v + 1);
    return ok;
  };

  function reset() {
    run.current += 1;
    hub.reset();
    sharedTrust.resetFor(resetKey);
    setNeedId(null);
    setCursor(0);
    setReplies({});
    setRefusal('');
    setDrawer(false);
    setLenses([]);
    act(() => {});
  }

  const inbox = (id: string) => hub.phone(id).filter((m) => m.at <= cursor);
  const say = (id: string, text: string) => {
    const after = inbox(id).at(-1)?.id ?? 0;
    setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text, time: clock() }] }));
  };
  const answer = (id: string, need: string, choice: 'accept' | 'decline', bubble: string) => {
    if (act(() => hub.reply(need, id, choice))) say(id, bubble);
  };

  const post = () => {
    run.current += 1;
    hub.reset();
    setReplies({});
    setRefusal('');
    setCursor(0);
    act(() => setNeedId(hub.postNeed(NEWCOMER, DEMO_NEED)));
  };

  // Live Discord mode (?live=1): Aditya's "can you help?" goes to a real DM; his simulated phone still works.
  const liveRequested = useMemo(() => isLiveRequested(), []);
  const ask = inbox(MENTOR).filter((m) => m.kind === 'ask-help').at(-1);
  const askNeed = (ask?.data?.need as string | undefined) ?? null;
  const live = useLiveHelp({
    enabled: liveRequested,
    runKey: run.current,
    pending: ask && askNeed && hub.awaiting(askNeed, MENTOR) ? { prompt: ask.id, details: helpDetails(ask) } : null,
    onReply: (choice, bubble) => askNeed && answer(MENTOR, askNeed, choice, bubble),
  });

  const chatFor = (id: string): CommunityChatItem[] => {
    const items: CommunityChatItem[] = [];
    for (const m of inbox(id)) {
      items.push(toItem(id, m));
      for (const [i, r] of (replies[id] ?? []).entries()) if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
    }
    return items;
  };

  function toItem(id: string, m: CommunityMessage): CommunityChatItem {
    const item: CommunityChatItem = { key: `m${m.id}`, from: 'agent', text: m.text, needsHuman: m.needsHuman };
    const need = m.data?.need as string | undefined;
    switch (m.kind) {
      case 'capacity':
        item.custom = <RulesCard results={m.data!.results as RuleCheck[]} />;
        break;
      case 'ask-help':
      case 'ask-match':
        item.replies = [
          { label: m.kind === 'ask-help' ? 'I can help' : "I'm in", tone: 'yes', onClick: () => answer(id, need!, 'accept', m.kind === 'ask-help' ? 'I can help' : "I'm in") },
          { label: 'Not this time', tone: 'no', onClick: () => answer(id, need!, 'decline', 'Not this time') },
        ];
        break;
      case 'booked': {
        const other = m.data!.with as string;
        const otherName = safeName(id, other);
        item.custom = (
          <CalendarCard
            title={`${DEMO_NEED.company} ${DEMO_NEED.round.toLowerCase()} prep · ${m.data!.topic}`}
            when={`Tonight · ${m.data!.when}`}
            skills={[String(m.data!.topic)]}
            people={[{ name: NAMES[id], you: true }, { name: otherName, you: false }]}
            onAdd={() => {
              const n = hub.need(need!);
              if (n?.window) downloadIcs({ title: `${DEMO_NEED.company} prep · ${m.data!.topic}`, start: n.window.start, end: n.window.end, date: new Date().toLocaleDateString('en-CA'), description: `With ${otherName}` });
            }}
          />
        );
        break;
      }
      case 'ask-confirm':
        item.replies = [{ label: 'We had the session', tone: 'yes', onClick: () => act(() => hub.confirm(need!, id)) && say(id, 'We had the session') }];
        break;
      case 'rate': {
        const other = m.data!.other as string;
        if (!hub.hasRated(need!, id)) {
          item.custom = <RatingCard people={[{ id: other, name: first(safeName(id, other)) }]} onSubmit={(r) => act(() => hub.rate(need!, id, r[other])) && say(id, 'Rated privately')} />;
        }
        break;
      }
      case 'points':
        item.custom = <PointsCard entry={m.data!.entry as PointEntry} />;
        break;
      case 'evidence': {
        const person = personOf(id);
        item.custom = <EvidenceCard file={trustNet.evidence(person, person)} badge={perksFor(hub.points.levelOf(id)).badge} />;
        break;
      }
    }
    return item;
  }

  /** Names come only through the consent gate. */
  function safeName(requester: string, target: string) {
    try {
      return hub.getIdentity(requester, target).name;
    } catch {
      return 'Hidden';
    }
  }

  // The side card follows the replay: only points whose event has been shown.
  const entries = shown.filter((e) => e.payload.kind === 'points').map((e) => e.payload.entry as PointEntry);
  const mentorPoints = STANDING_SEED[MENTOR].points + entries.filter((e) => e.person === MENTOR).reduce((a, e) => a + e.points, 0);
  const mentorOnline = hub.online().includes(MENTOR);
  const idle = !needId;
  const status = heroStatus(state, entries.at(-1) ?? null);

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <header className="hero">
        <h1>Pay it forward. <span className="accent">Help a newcomer, earn your way up.</span></h1>
        <p className="sub">Newcomers post what they need. Mentor agents decide from their human's private rules. Points come only when both sides confirm, and never buy a referral.</p>
        <div className="cta-row">
          {idle ? (
            <button className="cta" onClick={post}>Priya, a freshman, needs help with DSA for Microsoft →</button>
          ) : (
            <>
              <span key={status.text} className={`live-status ${status.tone}`}>
                {!caughtUp && status.tone === 'busy' && <span className="spinner" />}
                {status.text}
              </span>
              {caughtUp && state === 'OPEN' && !mentorOnline && (
                <>
                  <button className="cta small" onClick={() => act(() => hub.mentorOnline(MENTOR))}>A mentor comes online →</button>
                  <button className="ghost" onClick={() => act(() => hub.cancel(needId!, NEWCOMER))}>Priya cancels</button>
                </>
              )}
            </>
          )}
        </div>
        <div className="hero-meta">
          <span className="proof-pill">Anonymous until both say yes · points only after both confirm · points never buy a referral</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>See what the agents are doing</button>
          {live !== 'off' && <LiveBadge status={live} />}
        </div>
      </header>

      <main className="phones">
        {[NEWCOMER, MENTOR].map((id) => (
          <CommunityPhone
            key={`${run.current}:${id}`}
            owner={NAMES[id]}
            caption={`others see “${LABELS[id]}”`}
            items={chatFor(id)}
            interactive={caughtUp}
            pace={SPEEDS[speed].pace}
          />
        ))}
        <section className="card cm-side" aria-label="Points and levels">
          <h3>Points and levels</h3>
          <LevelProgress name="Aditya" points={mentorPoints} />
          {entries.length ? (
            <ul className="board-list">
              {entries.map((e) => (
                <li key={e.session} className={`board-row tone-${e.capped ? 'muted' : 'good'}`}>
                  <b>{NAMES[e.person] ?? label(e.person)} · {e.base} x {e.multiplier}</b>
                  <span>+{e.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="board-note">No points yet. A session earns points only after both people confirm it happened.</p>
          )}
          <h3>Open requests</h3>
          <ul className="board-list">
            {hub.needs().length === 0 && <li className="board-row tone-muted"><b>None yet</b><span /></li>}
            {hub.needs().map((n) => {
              const l = hub.listing(n.id)!;
              const s = n.id === needId ? state ?? n.state : n.state;
              return (
                <li key={n.id} className={`board-row tone-${s === 'DONE' || s === 'BOOKED' ? 'good' : s === 'OPEN' || s === 'MATCHED' ? 'info' : 'muted'}`}>
                  <b>{l.handle} · {l.topic} · {l.company} {l.round.toLowerCase()}</b>
                  <span>{NEED_TEXT[s]}</span>
                </li>
              );
            })}
          </ul>
          <h3>House rules</h3>
          <ul className="cm-rules">
            <li>Base 10 points. Helping a newcomer 3x, someone a level below 2x, a peer 1x.</li>
            <li>One pair earns points at most twice a week.</li>
            <li>Saying no never costs points. Newcomer status ends after 3 sessions.</li>
            <li>Levels: Contributor 30, Mentor 100, Senior mentor 250.</li>
          </ul>
          <button
            className="ghost small"
            onClick={() => {
              try {
                hub.redeemForReferral(MENTOR);
              } catch (e) {
                if (e instanceof PointsCannotBuyReferralError) setRefusal(e.message);
              }
            }}
          >
            Trade points for a referral?
          </button>
          {refusal && <p className="cm-refusal" role="status">{refusal}</p>}
        </section>
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Under the hood"
        subtitle="How the agents handled the help request. Students never see this."
        badge={<span className={`state-pill cm-${state ?? 'OPEN'}`}>{state ? NEED_TEXT[state] : 'Ready'}</span>}
      >
        <JudgeLegend active={lenses} onToggle={(l) => setLenses((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))} />
        <div className="drawer-body">
          <section className="card">
            <h3>Capacity checks · each mentor's private view</h3>
            <CapacityBoard events={shown} label={label} />
            <h3>Points</h3>
            {entries.length ? (
              <ul className="board-list">
                {entries.map((e) => (
                  <li key={e.session} className="board-row tone-good">
                    <b>{label(e.person)}: {e.base} x {e.multiplier}</b>
                    <span>{e.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="board-note">Nothing yet. Points need both confirmations.</p>
            )}
          </section>
          <section className="card feed-card">
            <h3>Agent conversation</h3>
            <Inspector events={shown} label={label} lenses={lenses} describeEvent={describeCommunity} />
          </section>
        </div>
      </Drawer>
    </div>
  );
}

function heroStatus(state: NeedState | null, last: PointEntry | null): { text: string; tone: string } {
  switch (state) {
    case 'OPEN': return { text: 'Waiting for a mentor. The request stays open this week', tone: 'human' };
    case 'MATCHED': return { text: "A mentor's agent found a fit. Over to the students", tone: 'human' };
    case 'BOOKED': return { text: 'Names unlocked. Session booked for tonight', tone: 'good' };
    case 'DONE': return last && !last.capped ? { text: `Aditya earned ${last.points} points (${last.base} x ${last.multiplier})${last.levelAfter !== last.levelBefore ? ` and reached ${last.levelAfter}` : ''}`, tone: 'good' } : { text: 'Session counted', tone: 'good' };
    case 'CANCELLED': return { text: 'Priya cancelled. Nothing was shared', tone: 'warn' };
    case 'EXPIRED': return { text: 'The deadline passed. The request closed', tone: 'warn' };
    default: return { text: "Priya's agent is looking for help…", tone: 'busy' };
  }
}

/** What Aditya's live DM says, from the anonymous listing only. */
function helpDetails(m: CommunityMessage): Record<string, string> {
  const w = m.data?.window as { start: string; end: string } | undefined;
  return {
    company: String(m.data?.company ?? ''),
    role: String(m.data?.round ?? ''),
    text: String(m.data?.topic ?? ''),
    window: w ? range12(w.start, w.end) : '',
  };
}

function LevelProgress({ name, points }: { name: string; points: number }) {
  const level = levelOf(points);
  const next = nextLevel(points);
  const floor = [0, 30, 100, 250].filter((m) => m <= points).at(-1) ?? 0;
  const pct = next ? Math.round(((points - floor) / (next.min - floor)) * 100) : 100;
  return (
    <div className="lvl">
      <div className="lvl-head">
        <b>{name} · {level}</b>
        <span>{points} pts{next ? ` · ${next.min - points} to ${next.level}` : ''}</span>
      </div>
      <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${name}'s progress to the next level`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PointsCard({ entry }: { entry: PointEntry }) {
  return (
    <div className="points-card">
      <span className="pts">{entry.capped ? '+0' : `+${entry.points}`} points</span>
      <small>{entry.capped ? entry.reason : `${entry.base} base x ${entry.multiplier}: ${entry.reason}. Both of you confirmed.`}</small>
      <LevelProgress name="You" points={STANDING_SEED[MENTOR].points + entry.points} />
      {entry.levelAfter !== entry.levelBefore && <small>New level: {entry.levelAfter}. You get matching priority, a badge and more question packs. Never a referral.</small>}
    </div>
  );
}

function RulesCard({ results }: { results: RuleCheck[] }) {
  return (
    <ul className="fit-card">
      {results.map((r) => (
        <li key={r.id} className={r.pass ? 'pass' : 'fail'}>
          <span aria-hidden>{r.pass ? '✓' : '✗'}</span>
          <span>{r.label}</span>
          <small>{r.observed}</small>
        </li>
      ))}
      <li className="fit-foot">Your rules stay with your agent. The newcomer never sees them.</li>
    </ul>
  );
}

function CapacityBoard({ events, label }: { events: AgentEvent[]; label: (id: string) => string }) {
  const checks = events.filter((e) => e.payload.kind === 'capacity');
  if (!checks.length) return <p className="board-note">{events.length ? 'Waiting for a mentor agent…' : 'Waiting'}</p>;
  return (
    <ul className="board-list">
      {checks.map((e) => {
        const failed = (e.payload.results as RuleCheck[]).filter((r) => !r.pass);
        return (
          <li key={e.id} className={`board-row tone-${e.type === 'ACCEPT' ? 'good' : 'warn'}`}>
            <b>{label(e.from)}</b>
            <span>{e.type === 'ACCEPT' ? '✓ fits' : `✗ ${failed.map((r) => r.observed).join('; ')}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function LiveBadge({ status }: { status: Exclude<LiveHelpStatus, 'off'> }) {
  const text = { connecting: 'Connecting to Discord…', live: 'Live: Aditya is on Discord', unavailable: 'Live mode unavailable, using simulated phone' }[status];
  return (
    <span className={`live-pill ${status}`} role="status">
      <i aria-hidden />
      {text}
    </span>
  );
}
