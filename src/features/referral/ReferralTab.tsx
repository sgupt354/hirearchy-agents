import { useEffect, useMemo, useRef, useState } from 'react';
import { SPEEDS, clock } from '../../ui/kit';
import type { TabProps } from '../types';
import { trust as sharedTrust } from '../trust/network';
import { ApplicationPacket, JORDAN_PROFILE } from '../apply/packet';
import { DEMO_POSTINGS } from '../apply/postings';
import { PacketCard } from '../apply/ui/PacketCard';
import { ReferralBridge, type ReferralState, type StateChange } from './referralBridge';
import { ReferralPhone, type ReferralAction, type ReferralChatItem } from './ReferralPhone';
import { DECOY, OPENING, REFERRER, SEEKER } from './seed';
import { applyStore } from '../apply/store';

const PEOPLE: Record<string, string> = { p4: 'Jordan', p10: 'Theo', r1: 'Nadia' };
const LABELS: Record<string, string> = { p4: 'Applicant #4', p10: 'Applicant #10', r1: 'Stripe alum' };

interface Reply {
  after: number;
  text: string;
  time: string;
}

const stateAt = (history: StateChange[], cursor: number): ReferralState =>
  history.reduce<ReferralState>((s, h) => (h.afterEvents <= cursor ? h.to : s), 'IDLE');


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

/** How each outcome reads on the seeker's application timeline. */
const OUTCOME: Partial<Record<ReferralState, string>> = {
  REFERRED: 'Referred by an alum',
  NOT_YET: 'Not yet: got a coaching note from an alum',
  NO_REFERRAL: 'An alum decided not to refer this time',
  NOT_A_FIT: 'Asked for a referral: not a fit right now',
};

const DONE: ReferralState[] = ['REFERRED', 'NOT_YET', 'NO_REFERRAL', 'NOT_A_FIT', 'WITHDRAWN', 'DECLINED'];

/** Referral Bridge: connection first, proof of work, the referrer's human decides. */
export function ReferralTab({ speed, resetKey }: TabProps) {
  const bridge = useMemo(() => new ReferralBridge(sharedTrust), []);
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const run = useRef(0);
  // Apply-suite tie-in: the seeker's application packet, shared only after the referrer asks and the seeker agrees.
  const unlocked = useRef(false);
  const [packet, setPacket] = useState(() => new ApplicationPacket(SEEKER, REFERRER, () => unlocked.current));

  const events = bridge.events();
  const caughtUp = cursor >= events.length;
  const state = stateAt(bridge.history(), cursor);
  const seeker = bridge.seeker;

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

  // The outcome lands on the seeker's own application for this job (they applied, so it's at least Applied).
  useEffect(() => {
    const summary = OUTCOME[bridge.state];
    if (!caughtUp || !summary || !seeker) return;
    applyStore.linkApplication({ owner: seeker, company: OPENING.company, role: OPENING.role, stage: 'Applied' }, { kind: 'referral', ref: `referral-${run.current}-${seeker}`, summary });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtUp, bridge.state, seeker]);

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

    </div>
  );
}
