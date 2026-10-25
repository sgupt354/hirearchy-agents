import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '../../engine/types';
import { Drawer, Inspector, JudgeLegend, SPEEDS, clock, type Lens } from '../../ui/kit';
import type { TabProps } from '../types';
import { trust as sharedTrust } from '../trust/network';
import { ApplicationPacket, JORDAN_PROFILE } from '../apply/packet';
import { describePacket } from '../apply/packetCopy';
import { DEMO_POSTINGS } from '../apply/postings';
import { PacketCard } from '../apply/ui/PacketCard';
import { describeReferral } from './copy';
import { ReferralBridge, type ReferralState, type StateChange } from './referralBridge';
import { ReferralPhone, type ReferralAction, type ReferralChatItem } from './ReferralPhone';
import type { RuleResult } from './rules';
import { DECOY, REFERRER, SEEKER } from './seed';

const PEOPLE: Record<string, string> = { p4: 'Jordan', p10: 'Theo', r1: 'Nadia' };
const LABELS: Record<string, string> = { p4: 'Applicant #4', p10: 'Applicant #10', r1: 'Stripe alum' };

interface Reply {
  after: number;
  text: string;
  time: string;
}

const stateAt = (history: StateChange[], cursor: number): ReferralState =>
  history.reduce<ReferralState>((s, h) => (h.afterEvents <= cursor ? h.to : s), 'IDLE');

const STATE_TEXT: Record<ReferralState, string> = {
  IDLE: 'Ready',
  OFFERED: 'Asking the seeker',
  WITHDRAWN: 'Seeker said not now',
  FIT_CHECK: 'Fit check',
  NOT_A_FIT: 'Not a fit',
  NEGOTIATING: 'Negotiating',
  AWAITING_HUMANS: 'Waiting on students',
  AWAITING_CONSENT: 'Waiting on students',
  DECLINED: 'Chat called off',
  CONFIRMED: 'Chat booked',
  CHAT_DONE: 'Referrer decides',
  REFERRED: 'Referred',
  NOT_YET: 'Not yet',
  NO_REFERRAL: 'No referral',
};

function heroStatus(state: ReferralState, seeker: string): { text: string; tone: string } {
  const name = PEOPLE[seeker] ?? 'The student';
  switch (state) {
    case 'REFERRED': return { text: `✓ Nadia referred ${name}, by their own call. +1 give-back credit`, tone: 'good' };
    case 'NOT_YET': return { text: `Not yet: ${name} got a coaching note. No referral used`, tone: 'warn' };
    case 'NO_REFERRAL': return { text: 'No referral this time. The human decided', tone: 'warn' };
    case 'NOT_A_FIT': return { text: `Not a fit. ${name} never learned the rules; Nadia never learned the name`, tone: 'warn' };
    case 'WITHDRAWN': return { text: 'Nothing shared. The student said not now', tone: 'warn' };
    case 'DECLINED': return { text: 'Chat called off. No names shared', tone: 'warn' };
    case 'CONFIRMED': return { text: 'Names unlocked. Coffee chat booked', tone: 'good' };
    case 'CHAT_DONE': return { text: "Only Nadia can refer. Check Nadia's phone", tone: 'human' };
    case 'OFFERED':
    case 'AWAITING_HUMANS':
    case 'AWAITING_CONSENT': return { text: 'Over to the students. Check their phones', tone: 'human' };
    default: return { text: "The agents are checking the fit…", tone: 'busy' };
  }
}

const DONE: ReferralState[] = ['REFERRED', 'NOT_YET', 'NO_REFERRAL', 'NOT_A_FIT', 'WITHDRAWN', 'DECLINED'];

/** Referral Bridge: connection first, proof of work, the referrer's human decides. */
export function ReferralTab({ speed, resetKey }: TabProps) {
  const bridge = useMemo(() => new ReferralBridge(sharedTrust), []);
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const run = useRef(0);
  // Apply-suite tie-in: the seeker's application packet, shared only after the referrer asks and the seeker agrees.
  const unlocked = useRef(false);
  const [packet, setPacket] = useState(() => new ApplicationPacket(SEEKER, REFERRER, () => unlocked.current));

  const events = bridge.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(bridge.history(), cursor);
  const seeker = bridge.seeker;
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

  const clearRun = () => {
    run.current += 1;
    unlocked.current = false;
    setPacket(new ApplicationPacket(SEEKER, REFERRER, () => unlocked.current));
    setCursor(0);
    setReplies({});
  };

  function reset() {
    bridge.reset();
    sharedTrust.resetFor(resetKey);
    clearRun();
    setDrawer(false);
    setLenses([]);
    act(() => {});
  }

  /** Fresh start (the referrer has 1 referral left this month). */
  const begin = (who: string) => {
    bridge.reset();
    clearRun();
    act(() => bridge.offer(who));
  };

  /** Another applicant for the same referrer: their monthly count and credits carry over. */
  const nextApplicant = (who: string) => {
    bridge.nextSeeker();
    clearRun();
    act(() => bridge.offer(who));
  };

  const inbox = (id: string) => bridge.phone(id).filter((m) => m.at <= cursor);

  const handle = (id: string, a: ReferralAction, bubble: string) => {
    const after = inbox(id).at(-1)?.id ?? 0;
    const ok = act(() => {
      if (a.type === 'share' || a.type === 'not-now') bridge.seekerShares(id, a.type === 'share');
      else if (a.type === 'accept' || a.type === 'decline') bridge.reply(id, a.type);
      else if (a.type === 'chat-done') bridge.chatDone(id);
      else if (a.type === 'refer') bridge.decide(id, 'refer');
      else if (a.type === 'no') bridge.decide(id, 'no');
      else if (a.type === 'not-yet') bridge.decide(id, 'not_yet', a.note);
    });
    if (ok) setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text: bubble, time: clock() }] }));
  };

  // Names are unlocked once the chat is booked; then Jordan's agent prepares the packet (it stays with Jordan).
  unlocked.current = ['CONFIRMED', 'CHAT_DONE', 'REFERRED', 'NOT_YET', 'NO_REFERRAL'].includes(state);
  useEffect(() => {
    if (!caughtUp || !unlocked.current || seeker !== SEEKER || packet.state !== 'NONE') return;
    act(() => packet.prepare(JORDAN_PROFILE, DEMO_POSTINGS[0], PEOPLE[REFERRER]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtUp, state, seeker, packet]);

  const chatFor = (id: string): ReferralChatItem[] => {
    const items: ReferralChatItem[] = [];
    for (const m of inbox(id)) {
      items.push({ key: `m${m.id}`, from: 'agent', text: m.text, needsHuman: m.needsHuman, kind: m.kind, data: m.data });
      for (const [i, r] of (replies[id] ?? []).entries()) if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
      if (m.kind === 'chat' && packet.summary() && seeker === SEEKER) {
        items.push({
          key: 'packet',
          from: 'agent',
          text: '',
          custom: <PacketCard packet={packet} viewer={id === REFERRER ? 'referrer' : 'seeker'} referrerName={PEOPLE[REFERRER]} seekerName={PEOPLE[SEEKER]} onChange={(fn) => act(fn)} />,
        });
      }
    }
    return items;
  };

  const idle = bridge.state === 'IDLE';
  const finished = caughtUp && DONE.includes(bridge.state);
  const other = seeker === SEEKER ? DECOY : SEEKER;
  const status = heroStatus(state, seeker);
  const left = bridge.referrerStatus();

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <header className="hero">
        <h1>Earn the referral. <span className="accent">Your prep circle becomes your proof of work.</span></h1>
        <p className="sub">An alum's agent checks your anonymous record against their private rules. If it fits, you meet. They decide.</p>
        <div className="cta-row">
          {idle ? (
            <>
              <button className="cta" onClick={() => begin(SEEKER)}>Jordan applied to Stripe SWE Intern →</button>
              <button className="ghost" onClick={() => begin(DECOY)}>Not a fit? See Theo's application</button>
            </>
          ) : (
            <>
              <span key={status.text} className={`live-status ${status.tone}`}>
                {status.tone === 'busy' && <span className="spinner" />}
                {status.text}
              </span>
              {finished && (
                <button className="ghost" onClick={() => nextApplicant(other)}>
                  Next applicant: {PEOPLE[other]} → ({left.left} of {left.limit} referrals left)
                </button>
              )}
            </>
          )}
        </div>
        <div className="hero-meta">
          <span className="proof-pill">Stats first · links only if it fits · names after both say yes · only a human refers</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>See what the agents are doing</button>
        </div>
      </header>

      <main className="phones">
        {(seeker ? [seeker, REFERRER] : [SEEKER, REFERRER]).map((id) => (
          <ReferralPhone
            key={`${run.current}:${id}`}
            owner={PEOPLE[id]}
            caption={`others see “${LABELS[id]}”`}
            items={chatFor(id)}
            interactive={caughtUp}
            pace={SPEEDS[speed].pace}
            onAction={(a, bubble) => handle(id, a, bubble)}
          />
        ))}
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Under the hood"
        subtitle="How the agents handled the referral. Students never see this."
        badge={<span className={`state-pill ref-${state}`}>{STATE_TEXT[state]}</span>}
      >
        <JudgeLegend active={lenses} onToggle={(l) => setLenses((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))} />
        <div className="drawer-body">
          <section className="card">
            <h3>Fit check · Stripe alum's private view</h3>
            <FitBoard events={shown} />
            <h3>Staged disclosure</h3>
            <Stages events={shown} />
            <p className="board-note">
              Referrals left this month: {left.left} of {left.limit} · Give-back credit: {left.credits}
            </p>
          </section>
          <section className="card feed-card">
            <h3>Agent conversation</h3>
            <Inspector events={[...shown, ...(caughtUp ? packet.events() : [])]} label={label} lenses={lenses} describeEvent={(e, ctx) => describePacket(e) ?? describeReferral(e, ctx)} />
          </section>
        </div>
      </Drawer>
    </div>
  );
}

/** Pass/fail per private rule, from the referrer agent's own fit-check event. */
function FitBoard({ events }: { events: AgentEvent[] }) {
  const fit = events.find((e) => e.payload.kind === 'fit');
  if (!fit) return <p className="board-note">{events.length ? 'Waiting for the anonymous stats…' : 'Waiting'}</p>;
  return (
    <ul className="board-list">
      {(fit.payload.results as RuleResult[]).map((r) => (
        <li key={r.id} className={`board-row tone-${r.pass ? 'good' : 'warn'}`}>
          <b>{r.label}</b>
          <span>{r.pass ? '✓' : '✗'} {r.observed}</span>
        </li>
      ))}
    </ul>
  );
}

/** Which stage of the seeker's evidence has left their agent so far. */
function Stages({ events }: { events: AgentEvent[] }) {
  const has = (pred: (e: AgentEvent) => boolean) => events.some(pred);
  const failed = has((e) => e.type === 'DISSOLVED');
  const stage1 = has((e) => e.type === 'DISCOVER' && e.payload.stage === 1);
  const stage2 = has((e) => e.type === 'DISCOVER' && e.payload.stage === 2);
  const stage3 = has((e) => e.type === 'REVEAL');
  const row = (n: number, what: string, done: boolean, when: string) => (
    <li key={n} className={`board-row tone-${done ? 'good' : failed ? 'muted' : 'idle'}`}>
      <b>Stage {n} · {what}</b>
      <span>{done ? 'Shared ✓' : failed ? 'Never shared' : when}</span>
    </li>
  );
  return (
    <ul className="board-list">
      {row(1, 'anonymous stats', stage1, 'After the student says yes')}
      {row(2, 'project links + mock breakdown', stage2, 'Only if the fit check passes')}
      {row(3, 'names and contact', stage3, 'Only after both say yes')}
    </ul>
  );
}
