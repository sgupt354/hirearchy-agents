import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine, PIPELINE, TRIGGER_AGENT_ID, type CoordinationState, type HumanReply, type PhoneMessage } from '../../engine';
import { prettify, studentCopy, windowText } from '../../ui/copy';
import { USE_LLM_COPY, downloadIcs, generateMessage, notifyPhone, parseInvite } from '../../ui/integrations';
import { InviteModal } from '../../ui/InviteModal';
import { IPhone, type ChatItem } from '../../ui/IPhone';
import { UnderTheHood } from '../../ui/UnderTheHood';
import { deriveGraph, inviteOutcome, messagesAvailable, stateAt, type InviteOutcome, type Lens } from '../../ui/view';
import { SPEEDS } from '../../app/speed';
import type { TabProps } from '../types';
import { isLiveRequested } from '../../live/client';
import { useLiveDiscord, type LiveStatus } from './useLiveDiscord';
import { personOf } from '../trust/people';
import { EvidenceCard, RatingCard } from '../trust/TrustCards';
import { useTrust } from '../trust/useTrust';
import type { Rating } from '../trust/ledger';
import type { Skill } from '../../engine/types';
import { TRIGGER_INVITE } from '../../engine/seed';
import { applyStore } from '../apply/store';

const IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const VIEWER = TRIGGER_AGENT_ID;
// Each student's own phone. Jordan's only appears once Jordan's agent sends a message (backup branch).
const PEOPLE = [
  { id: 'a1', name: 'Aditya' },
  { id: 'a2', name: 'Sumit' },
  { id: 'a3', name: 'Maya' },
  { id: 'a4', name: 'Jordan' },
];

interface Reply {
  after: number; // id of the agent message it answers
  text: string;
  time: string;
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function heroStatus(state: CoordinationState, window: string): { text: string; tone: string } {
  if (['CONSENT_COMPLETE', 'IDENTITIES_REVEALED', 'COMPLETED'].includes(state)) return { text: `✓ Prep circle created · Tonight ${window}`, tone: 'good' };
  if (['AWAITING_HUMANS', 'AWAITING_CONSENT', 'COUNTERED'].includes(state)) return { text: 'Over to the students. Check their phones', tone: 'human' };
  if (['DECLINED', 'DISSOLVED', 'REDISCOVERING'].includes(state)) return { text: "Someone couldn't make it. Finding a new match…", tone: 'warn' };
  return { text: "Aditya's agent is finding a prep circle…", tone: 'busy' };
}

/** The prep-circle tab: students' phones coordinating a session. */
export function PrepCircleTab({ speed, resetKey }: TabProps) {
  const engine = useMemo(() => new Engine(), []);
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const [howItWorks, setHowItWorks] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteOutcome | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const requested = useRef(new Set<string>());
  const trustNet = useTrust();
  const [ratedAt, setRatedAt] = useState<Record<string, string>>({});
  const [ratedVia, setRatedVia] = useState<Record<string, 'discord'>>({});
  // Bumped on reset so async results and phone state from a previous run are dropped.
  const run = useRef(0);

  const events = engine.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(engine.history(), cursor);
  const labels = engine.labels();
  const label = (id: string) => (id === VIEWER ? 'You' : id === 'broker' ? 'Broker' : (labels[id] ?? id));
  const view = deriveGraph(shown, IDS, VIEWER);

  // Replay new events one by one so the agents' conversation unfolds live.
  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].step);
    return () => clearTimeout(t);
  }, [cursor, caughtUp, speed]);

  useEffect(() => {
    if (!howItWorks) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setHowItWorks(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [howItWorks]);

  // Each phone only shows messages whose causing event has been replayed.
  const inbox: Record<string, PhoneMessage[]> = {};
  for (const p of PEOPLE) {
    const all = engine.phone(p.id);
    inbox[p.id] = all.slice(0, messagesAvailable(events, cursor, p.id, all.length));
  }

  // Phone text is the student copy from copy.ts. With VITE_USE_LLM_COPY=true, structured messages are
  // worded by generateMessage() instead (it falls back on its own if /api/voice is unavailable).
  // Aditya's "needs you" messages are also pushed with notifyPhone().
  useEffect(() => {
    const thisRun = run.current;
    for (const p of PEOPLE) {
      for (const m of inbox[p.id]) {
        const key = `${thisRun}:${p.id}:${m.id}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        const llm = USE_LLM_COPY && Boolean(m.kind);
        const text = llm
          ? generateMessage({ recipientLabel: labels[p.id], kind: m.kind!, details: m.details ?? {} }).catch(() => studentCopy(m, PIPELINE.company))
          : Promise.resolve(studentCopy(m, PIPELINE.company));
        text.then((t) => {
          if (run.current !== thisRun) return;
          if (llm) setGenerated((g) => ({ ...g, [key]: t }));
          if (p.id === VIEWER && m.actions.length) notifyPhone(t).catch(() => {});
        });
      }
    }
  });

  const keyOf = (id: string, m: PhoneMessage) => `${run.current}:${id}:${m.id}`;
  const display = (id: string, m: PhoneMessage) => {
    const g = USE_LLM_COPY ? generated[keyOf(id, m)] : undefined;
    return g ? prettify(g) : studentCopy(m, PIPELINE.company);
  };
  // In LLM mode a structured message waits for its wording (generateMessage resolves within ~3 s).
  const ready = (id: string, m: PhoneMessage) => !USE_LLM_COPY || !m.kind || keyOf(id, m) in generated;

  const namesFor = (owner: string) => {
    const names: Record<string, string> = {};
    for (const id of IDS) {
      try {
        names[id] = engine.getIdentity(owner, id).name;
      } catch {
        // locked: not in the circle or consent incomplete
      }
    }
    return names;
  };
  const graphNames = view.revealed ? namesFor(VIEWER) : {};

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

  const start = () =>
    act(() => {
      engine.simulateInterviewInvite();
      // The invite is the source of truth for the stage and the date on Aditya's application record.
      applyStore.recordApplication({ owner: personOf(VIEWER), company: PIPELINE.company, role: PIPELINE.role, stage: 'Interview', interviewDate: TRIGGER_INVITE.interview_date });
    });

  const reply = (id: string, r: HumanReply, bubble: string) => {
    const after = inbox[id].at(-1)?.id ?? 0;
    if (act(() => engine.reply(id, r))) {
      setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text: bubble, time: clock() }] }));
    }
  };

  /** Back to the exact start state (global Reset). The presenter's speed setting lives in the shell. */
  const reset = () => {
    run.current += 1;
    engine.resetDemo();
    trustNet.resetFor(resetKey);
    setRatedAt({});
    setRatedVia({});
    requested.current.clear();
    setGenerated({});
    setReplies({});
    setCursor(0);
    setInviteOpen(false);
    setInvitePending(false);
    setInviteStatus(null);
    setHowItWorks(false);
    setLenses([]);
    act(() => {});
  };

  const sessionId = `prep-${run.current}`;

  // Live Discord mode (?live=1): Aditya answers their prompts in Discord; the simulated phone still works.
  // Once the circle has met, Aditya can also rate it privately from Discord.
  const liveRequested = useMemo(() => isLiveRequested(), []);
  const adityaLast = inbox[VIEWER].at(-1);
  const adityaOthers = (engine.circle?.members ?? []).filter((x) => x !== VIEWER);
  const adityaRates =
    trustNet.hasSession(sessionId) && adityaOthers.length > 0 && !trustNet.hasRated(personOf(VIEWER), personOf(adityaOthers[0]), sessionId)
      ? { people: adityaOthers.map((x) => ({ id: x, name: (namesFor(VIEWER)[x] ?? 'Member').split(' ')[0] })) }
      : null;
  // Proposal/counter need a reply; complete goes to Discord as calendar first (rating waits until that lands).
  const livePending =
    adityaLast && (adityaLast.actions.length || adityaLast.kind === 'complete')
      ? {
          ...adityaLast,
          details: {
            ...(adityaLast.details ?? {}),
            company: PIPELINE.company,
            role: PIPELINE.role,
            // Calendar link uses today's date for "tonight" (the circle's slot), never the interview date.
            date: today(),
            window: adityaLast.details?.window ?? (engine.window ? windowText(engine.window) : ''),
          },
        }
      : null;
  // Rating survey only after the complete (calendar) message exists, so Discord order is calendar → rate.
  const liveRating = adityaRates && inbox[VIEWER].some((m) => m.kind === 'complete') ? adityaRates : null;
  const live = useLiveDiscord({
    enabled: liveRequested,
    runKey: run.current,
    pending: livePending,
    onReply: (r, bubble) => reply(VIEWER, r, bubble),
    rating: liveRating,
    onRated: (ratings) => rateCircle(VIEWER, ratings, 'discord'),
  });

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const checkInvite = async (text: string) => {
    const thisRun = run.current;
    setInvitePending(true);
    setInviteStatus(null);
    const parsed = await parseInvite(text).catch(() => null);
    if (run.current !== thisRun) return;
    setInvitePending(false);
    const outcome = inviteOutcome(parsed, PIPELINE);
    setInviteStatus(outcome);
    if (outcome.start) {
      setInviteOpen(false);
      start();
    }
  };

  // After the circle meets, it becomes a session on everyone's record and each member rates the others privately.
  useEffect(() => {
    const circle = engine.circle;
    if (engine.state !== 'COMPLETED' || !caughtUp || !circle || trustNet.hasSession(sessionId)) return;
    const taught: Record<string, Skill[]> = {};
    for (const e of circle.edges) taught[personOf(e.from)] = [...(taught[personOf(e.from)] ?? []), ...e.skills];
    trustNet.recordSession({ id: sessionId, kind: 'prep', members: circle.members.map(personOf), taught });
    // Aditya's application for this job gets the circle, with the topics he taught and was taught.
    const topics = [...new Set(circle.edges.filter((e) => e.from === VIEWER || e.to === VIEWER).flatMap((e) => e.skills))];
    applyStore.linkApplication(
      { owner: personOf(VIEWER), company: PIPELINE.company, role: PIPELINE.role, stage: 'Interview' },
      { kind: 'prep', ref: sessionId, summary: `With ${circle.members.length - 1} students in your pipeline`, topics },
    );
  });

  const rateCircle = (id: string, ratings: Record<string, Rating>, via?: 'discord') => {
    const others = Object.keys(ratings);
    if (others.length && trustNet.hasRated(personOf(id), personOf(others[0]), sessionId)) return; // already rated on the phone
    if (act(() => Object.entries(ratings).forEach(([other, r]) => trustNet.rate(personOf(id), personOf(other), sessionId, r)))) {
      setRatedAt((all) => ({ ...all, [id]: clock() }));
      if (via) setRatedVia((all) => ({ ...all, [id]: via }));
    }
  };

  const trustItems = (id: string, members: string[], names: Record<string, string>): ChatItem[] => {
    if (!trustNet.hasSession(sessionId)) return [];
    const me = personOf(id);
    const others = members.filter((x) => x !== id);
    const items: ChatItem[] = [
      { key: 't-ask', from: 'agent', text: "Tonight's session is done. How did it go? Rate your circle privately. Nobody ever sees a single rating.", needsHuman: true },
    ];
    if (!trustNet.hasRated(me, personOf(others[0]), sessionId)) {
      items.push({ key: 't-rate', from: 'agent', text: '', custom: <RatingCard people={others.map((x) => ({ id: x, name: (names[x] ?? 'Member').split(' ')[0] }))} onSubmit={(r) => rateCircle(id, r)} /> });
      return items;
    }
    items.push({ key: 't-done', from: 'me', text: ratedVia[id] ? 'Rated privately · via Discord' : 'Rated privately', time: ratedAt[id] });
    items.push({ key: 't-thanks', from: 'agent', text: "Thanks! A rating only counts once someone has two or more. Here's your proof of work so far:" });
    items.push({ key: 't-evidence', from: 'agent', text: '', custom: <EvidenceCard file={trustNet.evidence(me, me)} /> });
    return items;
  };

  const chatFor = (id: string): ChatItem[] => {
    const items: ChatItem[] = [];
    for (const m of inbox[id]) {
      if (!ready(id, m)) break;
      const item: ChatItem = { key: `m${m.id}`, from: 'agent', text: display(id, m), needsHuman: m.actions.length > 0 };
      if (m.kind === 'complete' && engine.window) {
        const slot = engine.window;
        const members = engine.circle?.members ?? [];
        const names = namesFor(id);
        item.card = {
          title: `${PIPELINE.company} ${PIPELINE.role} prep circle`,
          when: `Tonight · ${windowText(slot)}`,
          skills: (m.details?.skills ?? '').split(', '),
          people: [id, ...members.filter((x) => x !== id)].map((x) => ({ name: names[x] ?? 'Hidden', you: x === id })),
          onAdd: () =>
            downloadIcs({
              title: `${PIPELINE.company} ${PIPELINE.role} prep circle`,
              start: slot.start,
              end: slot.end,
              date: today(),
              description: `Skills: ${m.details?.skills}\nWith: ${members.filter((x) => x !== id).map((x) => names[x]).join(', ')}`,
            }),
        };
      }
      items.push(item);
      for (const [i, r] of (replies[id] ?? []).entries()) {
        if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
      }
      if (m.kind === 'complete') items.push(...trustItems(id, engine.circle?.members ?? [], namesFor(id)));
    }
    return items;
  };

  const idle = engine.state === 'IDLE';
  const status = heroStatus(state, engine.window ? windowText(engine.window) : '');
  const phones = PEOPLE.filter((p) => p.id !== 'a4' || inbox.a4.length > 0);
  const pace = SPEEDS[speed].pace;

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <header className="hero">
        <h1>Land the interview. <span className="accent">Your agent finds your prep circle.</span></h1>
        <p className="sub">Agents negotiate. You only decide what matters. Names stay hidden until everyone says yes.</p>
        <div className="cta-row">
          {idle ? (
            <>
              <button className="cta" onClick={start}>Aditya just got a Microsoft interview invite →</button>
              <button className="ghost" onClick={() => setInviteOpen(true)}>Paste a real invite</button>
            </>
          ) : (
            <span key={status.text} className={`live-status ${status.tone}`}>
              {status.tone === 'busy' && <span className="spinner" />}
              {status.text}
            </span>
          )}
        </div>
        <div className="hero-meta">
          <button type="button" className="ghost small" onClick={() => setHowItWorks(true)}>How it works</button>
          {live !== 'off' && <LiveBadge status={live} />}
        </div>
      </header>

      <main className="phones">
        {phones.map((p) => (
          <IPhone
            key={`${run.current}:${p.id}`}
            owner={p.name}
            caption={`others see “${labels[p.id]}”`}
            items={chatFor(p.id)}
            interactive={caughtUp}
            pace={pace}
            onReply={(r, bubble) => reply(p.id, r, bubble)}
          />
        ))}
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

      <InviteModal
        key={run.current}
        open={inviteOpen}
        pending={invitePending}
        status={inviteStatus}
        onCheck={checkInvite}
        onClose={() => {
          setInviteOpen(false);
          setInviteStatus(null);
        }}
      />

      <UnderTheHood
        open={howItWorks}
        onClose={() => setHowItWorks(false)}
        state={state}
        events={shown}
        ids={IDS}
        labels={labels}
        label={label}
        view={view}
        names={graphNames}
        lenses={lenses}
        onToggleLens={(l) => setLenses((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))}
      />
    </div>
  );
}

function LiveBadge({ status }: { status: Exclude<LiveStatus, 'off'> }) {
  const text = {
    connecting: 'Connecting to Discord…',
    live: 'Live: Aditya is on Discord',
    unavailable: 'Live mode unavailable, using simulated phone',
  }[status];
  return (
    <span className={`live-pill ${status}`} role="status">
      <i aria-hidden />
      {text}
    </span>
  );
}
