import { useEffect, useMemo, useRef, useState } from 'react';
import { SPEEDS, clock } from '../../ui/kit';
import type { TabProps } from '../types';
import { MockPhone, type MockAction, type MockChatItem } from './MockPhone';
import { MockSwap, type MockState, type StateChange } from './mockSwap';
import { MOCK_SEEKER, SOLO_SEEKER, createMockSeed } from './seed';
import type { Skill } from '../../engine/types';
import type { Rating } from '../trust/ledger';
import { trust as sharedTrust } from '../trust/network';
import { personOf } from '../trust/people';
import { EvidenceCard, RatingCard } from '../trust/TrustCards';
import { useTrust } from '../trust/useTrust';
import { applyStore } from '../apply/store';

/** The job the seeker's round is for (from the mock seed's own pipeline field). */
const SEEKER_JOB = createMockSeed().find((p) => p.agent_id === MOCK_SEEKER)!.pipeline;

const PEOPLE: Record<string, string> = { m1: 'Aditya', m4: 'Jordan', m5: 'Priya', m8: 'Riya' };

interface Reply {
  after: number;
  text: string;
  time: string;
}

const stateAt = (history: StateChange[], cursor: number): MockState =>
  history.reduce<MockState>((s, h) => (h.afterEvents <= cursor ? h.to : s), 'IDLE');


function heroStatus(state: MockState, solo: boolean): { text: string; tone: string } {
  if (state === 'COMPLETED') return { text: solo ? '✓ Practice done · self-scores saved privately' : '✓ Mock swap done · scores went privately to each person', tone: 'good' };
  if (state === 'ROUND_1' || state === 'ROUND_2') return { text: `${state === 'ROUND_1' ? 'Round 1' : 'Round 2'} of 2 is live. Timer's running`, tone: 'human' };
  if (state === 'SCORING') return { text: 'Rounds done. Each side scores the other, privately.', tone: 'human' };
  if (state === 'AWAITING_HUMANS' || state === 'AWAITING_CONSENT') return { text: 'Over to the students. Check their phones', tone: 'human' };
  if (state === 'NO_PEER' || state === 'SOLO') return { text: 'No one free in this round, so the agent offers practice instead', tone: 'warn' };
  if (state === 'DECLINED') return { text: 'Partner couldn’t make it. Trying the backup…', tone: 'warn' };
  return { text: "Aditya's agent is finding a mock partner…", tone: 'busy' };
}

/** The mock-interview swap: reciprocal mocks with students in the same pipeline and round. */
export function MockTab({ speed, resetKey }: TabProps) {
  // Reliability (from the shared trust network) breaks ties between equally good partners.
  const mock = useMemo(() => new MockSwap(createMockSeed(), (id) => sharedTrust.reliability(personOf(id))), []);
  const trustNet = useTrust();
  const [ratedAt, setRatedAt] = useState<Record<string, string>>({});
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [solo, setSolo] = useState(false);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const run = useRef(0);

  const events = mock.events();
  const caughtUp = cursor >= events.length;
  const state = stateAt(mock.history(), cursor);
  const labels = mock.labels();

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

  function reset() {
    run.current += 1;
    mock.reset();
    trustNet.resetFor(resetKey);
    setRatedAt({});
    setCursor(0);
    setSolo(false);
    setReplies({});
    act(() => {});
  }

  const begin = (asSolo: boolean) => {
    setSolo(asSolo);
    act(() => mock.start(asSolo ? SOLO_SEEKER : MOCK_SEEKER));
  };

  const inbox = (id: string) => mock.phone(id).filter((m) => m.at <= cursor);

  const handle = (id: string, a: MockAction, bubble: string) => {
    const after = inbox(id).at(-1)?.id ?? 0;
    const ok = act(() => {
      if (a.type === 'accept' || a.type === 'decline') mock.reply(id, a.type);
      else if (a.type === 'solo') mock.practiceWithAgent(id);
      else if (a.type === 'solo-no') mock.declineSolo(id);
      else if (a.type === 'done') mock.soloDone(id);
      else if (a.type === 'end-round') mock.endRound(id);
      else if (a.type === 'scores') mock.submitScores(id, a.rubric, a.note);
      else if (a.type === 'self-scores') mock.submitSelfScores(id, a.rubric);
    });
    if (ok) setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text: bubble, time: clock() }] }));
  };

  // A finished peer mock becomes a session on both records; each side's own scores go into their own evidence file.
  const sessionId = `mock-${run.current}`;
  useEffect(() => {
    const pair = mock.pair;
    if (solo || mock.state !== 'COMPLETED' || !caughtUp || !pair || trustNet.hasSession(sessionId)) return;
    const match = [...events].reverse().find((e) => e.type === 'DISCOVER' && e.payload.match)?.payload.match as { teaches: Record<string, Skill[]> } | undefined;
    const taught = Object.fromEntries(pair.map((id) => [personOf(id), match?.teaches[id] ?? []]));
    trustNet.recordSession({ id: sessionId, kind: 'mock', members: pair.map(personOf), taught });
    for (const id of pair) trustNet.addMockScores(personOf(id), ownScores(id).filter((s) => !s.practice).map((s) => s.rubric));
    // The seeker's application for this job gets the mock and the topics both sides practiced.
    if (pair.includes(MOCK_SEEKER)) {
      const topics = [...new Set(pair.flatMap((id) => match?.teaches[id] ?? []))];
      applyStore.linkApplication(
        { owner: personOf(MOCK_SEEKER), company: SEEKER_JOB.company, role: SEEKER_JOB.role, stage: 'Interview' },
        { kind: 'mock', ref: sessionId, summary: 'Swapped with a peer, scored privately', topics },
      );
    }
  });

  const ratePartner = (id: string, ratings: Record<string, Rating>) => {
    if (act(() => Object.entries(ratings).forEach(([other, r]) => trustNet.rate(personOf(id), personOf(other), sessionId, r)))) {
      setRatedAt((all) => ({ ...all, [id]: clock() }));
    }
  };

  const trustItems = (id: string): MockChatItem[] => {
    const pair = mock.pair;
    if (solo || !pair || !trustNet.hasSession(sessionId)) return [];
    const other = pair.find((x) => x !== id)!;
    const me = personOf(id);
    let name = 'your partner';
    try {
      name = mock.getIdentity(id, other).name.split(' ')[0];
    } catch {
      // names are unlocked by now; fall back to a neutral label if not
    }
    const items: MockChatItem[] = [{ key: 't-ask', from: 'agent', text: `One more thing: did ${name} show up, and how helpful were they? Private, and it only counts once someone has two or more ratings.`, needsHuman: true }];
    if (!trustNet.hasRated(me, personOf(other), sessionId)) {
      items.push({ key: 't-rate', from: 'agent', text: '', custom: <RatingCard people={[{ id: other, name }]} onSubmit={(r) => ratePartner(id, r)} /> });
      return items;
    }
    items.push({ key: 't-done', from: 'me', text: 'Rated privately', time: ratedAt[id] });
    items.push({ key: 't-thanks', from: 'agent', text: "Thanks! Here's your proof of work so far:" });
    items.push({ key: 't-evidence', from: 'agent', text: '', custom: <EvidenceCard file={trustNet.evidence(me, me)} /> });
    return items;
  };

  const chatFor = (id: string): MockChatItem[] => {
    const items: MockChatItem[] = [];
    for (const m of inbox(id)) {
      items.push({ key: `m${m.id}`, from: 'agent', text: m.text, needsHuman: m.needsHuman, kind: m.kind, data: m.data });
      for (const [i, r] of (replies[id] ?? []).entries()) if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
      if (m.kind === 'scores') items.push(...trustItems(id));
    }
    return items;
  };

  // Own scores only: each phone reads its owner's scores through the private vault.
  const ownScores = (id: string) => {
    try {
      return mock.getScores(id, id);
    } catch {
      return [];
    }
  };

  const idle = mock.state === 'IDLE';
  const phones = solo ? [SOLO_SEEKER] : ['m1', 'm4', ...(inbox('m5').length ? ['m5'] : [])];
  const liveRound = state === 'ROUND_1' ? 1 : state === 'ROUND_2' ? 2 : null;
  const status = heroStatus(state, solo);

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <header className="hero">
        <h1>Practice the real round. <span className="accent">Swap mock interviews with your pipeline.</span></h1>
        <p className="sub">Same company, same round. You interview them, they interview you. Your scores stay yours.</p>
        <div className="cta-row">
          {idle ? (
            <>
              <button className="cta" onClick={() => begin(false)}>Aditya's Microsoft technical round is Thursday →</button>
              <button className="ghost" onClick={() => begin(true)}>No one in your round? See Riya's Google round</button>
            </>
          ) : (
            <span key={status.text} className={`live-status ${status.tone}`}>
              {status.tone === 'busy' && <span className="spinner" />}
              {status.text}
            </span>
          )}
        </div>
      </header>

      <main className="phones">
        {phones.map((id) => (
          <MockPhone
            key={`${run.current}:${id}`}
            owner={PEOPLE[id]}
            caption={`others see “${labels[id]}”`}
            items={chatFor(id)}
            interactive={caughtUp}
            pace={SPEEDS[speed].pace}
            timerRate={speed}
            liveRound={liveRound}
            scores={ownScores(id)}
            onAction={(a, bubble) => handle(id, a, bubble)}
          />
        ))}
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

    </div>
  );
}
