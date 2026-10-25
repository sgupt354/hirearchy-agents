import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SPEEDS, clock } from '../../ui/kit';
import type { Speed } from '../../app/speed';
import { LevelProgress, PointsCard, RulesCard } from './cards';
import type { CommunityHub, CommunityMessage } from './community';
import { CommunityPhone, type CommunityChatItem } from './CommunityPhone';
import type { PointEntry } from './points';
import { DEMO_PROJECT, JUNIORS, SENIOR, STANDING_SEED } from './seed';

const JUNIOR = 'a9';
const NAMES: Record<string, string> = { [SENIOR]: 'Sam', [JUNIOR]: 'Priya' };
const LABELS: Record<string, string> = { a7: 'Applicant #7', a9: 'Newcomer #9', a2: 'Applicant #2', a8: 'Applicant #8' };

interface Reply {
  after: number;
  text: string;
  time: string;
}

/** Project collaboration board: Sam (a senior) posts, junior agents apply anonymously, Sam picks, Priya joins. */
export function ProjectBoardView({ hub, speed, resetKey, viewSwitch, hidden }: { hub: CommunityHub; speed: Speed; resetKey: number; viewSwitch: ReactNode; hidden: boolean }) {
  const board = hub.projects;
  const [, setVersion] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const run = useRef(0);

  const events = board.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);

  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].step);
    return () => clearTimeout(t);
  }, [cursor, caughtUp, speed]);

  // The hub (and its board) is reset by the Community tab; here we only drop this view's own state.
  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    run.current += 1;
    setProjectId(null);
    setCursor(0);
    setReplies({});
    setError('');
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

  const inbox = (id: string) => board.phone(id).filter((m) => m.at <= cursor);
  const say = (id: string, text: string) => {
    const after = inbox(id).at(-1)?.id ?? 0;
    setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text, time: clock() }] }));
  };
  const doThen = (id: string, bubble: string, fn: () => void) => act(fn) && say(id, bubble);

  const post = () =>
    act(() => {
      const id = board.post(SENIOR, DEMO_PROJECT);
      for (const j of JUNIORS) board.apply(id, j);
      board.review(id);
      setProjectId(id);
    });

  const apps = projectId ? board.applications(projectId) : [];
  const teamFull = apps.filter((a) => a.status === 'PICKED' || a.status === 'JOINED').length >= 2;

  function toItem(id: string, m: CommunityMessage): CommunityChatItem {
    const item: CommunityChatItem = { key: `m${m.id}`, from: 'agent', text: m.text, needsHuman: m.needsHuman };
    const pid = m.data?.project as string | undefined;
    switch (m.kind) {
      case 'shortlist':
        item.custom = (
          <RulesCard
            results={apps.map((a) => ({ label: `${a.handle} · ${a.skills.join(', ')}`, pass: a.status !== 'FILTERED', observed: a.status === 'FILTERED' ? a.checks.filter((c) => !c.pass).map((c) => c.observed).join('; ') : `${a.hoursPerWeek} h · ${a.role.toLowerCase()}` }))}
            foot="Anonymous applicants. Your rules stay with your agent."
          />
        );
        item.replies = teamFull ? undefined : apps.filter((a) => a.status === 'SHORTLISTED').map((a) => ({ label: `Pick ${a.handle}`, tone: a.junior === JUNIOR ? 'yes' as const : undefined, onClick: () => doThen(id, `Pick ${a.handle}`, () => board.pick(pid!, SENIOR, a.junior)) }));
        break;
      case 'ask-match':
        item.replies = [
          { label: 'Join', tone: 'yes', onClick: () => doThen(id, 'Join', () => board.respond(pid!, id, 'accept')) },
          { label: 'Not this time', tone: 'no', onClick: () => doThen(id, 'Not this time', () => board.respond(pid!, id, 'decline')) },
        ];
        break;
      case 'ask-hours': {
        const hours = Number(m.data!.hours);
        item.replies = [
          { label: `Log ${hours} hours`, tone: 'yes', onClick: () => doThen(id, `Logged ${hours} hours`, () => board.logHours(pid!, id, hours)) },
          { label: 'Leave the project', tone: 'no', onClick: () => doThen(id, 'Leave the project', () => board.leave(pid!, id)) },
        ];
        break;
      }
      case 'ask-confirm':
        item.replies = [{ label: 'Confirm the week', tone: 'yes', onClick: () => doThen(id, 'Confirmed the week', () => board.confirmWeek(pid!, id, m.data!.junior as string, m.data!.week as string)) }];
        break;
      case 'ask-leave':
        item.replies = [
          { label: 'Keep going', tone: 'yes', onClick: () => say(id, 'Keep going') },
          { label: 'Leave the project', tone: 'no', onClick: () => doThen(id, 'Leave the project', () => board.leave(pid!, id)) },
        ];
        break;
      case 'points': {
        const entry = m.data!.entry as PointEntry;
        item.custom = <PointsCard entry={entry} before={STANDING_SEED[entry.person]?.points ?? 0} />;
        break;
      }
    }
    return item;
  }

  const chatFor = (id: string): CommunityChatItem[] => {
    const items: CommunityChatItem[] = [];
    for (const m of inbox(id)) {
      items.push(toItem(id, m));
      for (const [i, r] of (replies[id] ?? []).entries()) if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
    }
    return items;
  };

  const entries = shown.filter((e) => e.payload.kind === 'points').map((e) => e.payload.entry as PointEntry);
  const seniorPoints = STANDING_SEED[SENIOR].points + entries.reduce((a, e) => a + e.points, 0);
  const credits = projectId ? board.credits(projectId) : [];
  const nameOf = (junior: string) => {
    try {
      return board.getIdentity(SENIOR, junior).name;
    } catch {
      return LABELS[junior];
    }
  };
  const status = statusOf(apps, caughtUp, entries.length > 0);

  return (
    <div className={`app ${projectId ? 'started' : ''}`} hidden={hidden}>
      <header className="hero">
        <h1>Build together. <span className="accent">Seniors lead, juniors get credited.</span></h1>
        <p className="sub">A senior posts a project. Junior agents apply anonymously, the senior's agent shortlists by private rules, and the senior picks. Names unlock only after both agree.</p>
        <div className="cta-row">
          {viewSwitch}
          {projectId ? (
            <span key={status.text} className={`live-status ${status.tone}`}>{status.text}</span>
          ) : (
            <button className="cta" onClick={post}>Sam posts a project: {DEMO_PROJECT.title} →</button>
          )}
        </div>
      </header>

      <main className="phones">
        {[SENIOR, JUNIOR].map((id) => (
          <CommunityPhone key={`${run.current}:${id}`} owner={NAMES[id]} caption={`others see “${LABELS[id]}”`} items={chatFor(id)} interactive={caughtUp} pace={SPEEDS[speed].pace} />
        ))}
        <section className="card cm-side" aria-label="Project">
          <h3>{DEMO_PROJECT.title}</h3>
          <p className="board-note">{DEMO_PROJECT.scope}</p>
          <ul className="board-list">
            <li className="board-row tone-info"><b>Stack</b><span>{DEMO_PROJECT.stack.join(', ')}</span></li>
            <li className="board-row tone-info"><b>Roles</b><span>{DEMO_PROJECT.roles.join(', ')}</span></li>
            <li className="board-row tone-info"><b>Hours cap</b><span>{DEMO_PROJECT.hoursPerWeek} h per junior per week</span></li>
          </ul>
          <h3>Team credits</h3>
          {credits.length ? (
            <ul className="board-list">
              {credits.map((c) => (
                <li key={c.junior} className={`board-row tone-${c.status === 'LEFT' ? 'muted' : 'good'}`}>
                  <b>{nameOf(c.junior)}</b>
                  <span>{c.hours} h{c.status === 'LEFT' ? ' · left, still credited' : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="board-note">Nobody on the team yet.</p>
          )}
          <h3>Sam's mentor points</h3>
          <LevelProgress name="Sam" points={seniorPoints} />
          <p className="board-note">Each week a junior and Sam both confirm earns Sam points, with the same rules as help sessions. Juniors never lose points for leaving.</p>
        </section>
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

    </div>
  );
}

function statusOf(apps: { status: string }[], caughtUp: boolean, earned: boolean): { text: string; tone: string } {
  if (!caughtUp) return { text: "Sam's agent is shortlisting…", tone: 'busy' };
  if (apps.some((a) => a.status === 'LEFT')) return { text: 'Priya left. Her hours stay credited, no points lost', tone: 'warn' };
  if (earned) return { text: 'Week confirmed. Sam earned mentor points', tone: 'good' };
  if (apps.some((a) => a.status === 'JOINED')) return { text: 'Names unlocked. Priya joined the team', tone: 'good' };
  if (apps.some((a) => a.status === 'PICKED')) return { text: 'Sam picked. Over to the junior', tone: 'human' };
  return { text: 'Shortlist ready. Sam picks', tone: 'human' };
}
