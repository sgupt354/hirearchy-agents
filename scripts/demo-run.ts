import { Engine, type AgentEvent, type StateChange } from '../src/engine';

// Prints the golden path and the backup branch as event lines, straight from the engine.

const ICON: Record<string, string> = {
  TRIGGER: '📩', DISCOVER: '🔎', FILTERED: '⨯', PROPOSE: '↔', COUNTER: '↔', ACCEPT: '✓', REJECT: '✗',
  CONFLICT: '⚠', ESCALATE: '⏸', CONSENT: '✓', DECLINE: '✗', DISSOLVED: '∅', REVEAL: '🔓', COMPLETE: '✓',
};

function print(engine: Engine, fromEvent: number, fromState: number) {
  const labels = engine.labels();
  const name = (id: string) => labels[id] ?? id;
  const events = engine.events().slice(fromEvent);
  const states = engine.history().slice(fromState);
  const line = (e: AgentEvent) => {
    const d = e.disclosure;
    const tags = [
      d.shared.length && `↗ ${d.shared.join(', ')}`,
      d.abstracted.length && `≈ ${d.abstracted.join(', ')}`,
      d.withheld.length && `🔒 ${d.withheld.join(', ')}`,
    ].filter(Boolean);
    const route = `${name(e.from)} -> ${e.to.map(name).join(', ')}`;
    console.log(`${e.id} ${ICON[e.type]} ${e.type.padEnd(9)} ${route}`);
    console.log(`        ${e.human_readable}`);
    if (tags.length) console.log(`        ${tags.join('  |  ')}`);
  };
  const stateLine = (s: StateChange) => console.log(`   ── state: ${s.from} -> ${s.to}`);
  let si = 0;
  events.forEach((e, i) => {
    while (si < states.length && states[si].afterEvents <= fromEvent + i) stateLine(states[si++]);
    line(e);
  });
  while (si < states.length) stateLine(states[si++]);
}

function step(engine: Engine, title: string, run: () => void) {
  const e = engine.events().length;
  const s = engine.history().length;
  console.log(`\n▶ ${title}`);
  run();
  print(engine, e, s);
}

function phones(engine: Engine, ids: string[]) {
  for (const id of ids) {
    console.log(`\n📱 ${engine.labels()[id]}`);
    for (const m of engine.phone(id)) console.log(`   ${m.id}. ${m.text}${m.actions.length ? `  [${m.actions.join(' / ')}]` : ''}`);
  }
}

const engine = new Engine();

console.log('═══════════ GOLDEN PATH ═══════════');
step(engine, 'Simulate interview invite (Applicant #1)', () => engine.simulateInterviewInvite());
step(engine, 'Applicant #3 (Maya) counters "8pm?"', () => engine.reply('a3', { kind: 'counter', text: '8pm?' }));
step(engine, 'Applicant #1 accepts', () => engine.reply('a1', { kind: 'accept' }));
step(engine, 'Applicant #2 accepts', () => engine.reply('a2', { kind: 'accept' }));
step(engine, 'Applicant #3 accepts', () => engine.reply('a3', { kind: 'accept' }));
phones(engine, ['a1', 'a2', 'a3']);
console.log(`\nFinal state: ${engine.state}`);

console.log('\n═══════════ BACKUP BRANCH (after resetDemo) ═══════════');
engine.resetDemo();
step(engine, 'Simulate interview invite (Applicant #1)', () => engine.simulateInterviewInvite());
step(engine, 'Applicant #3 (Maya) declines', () => engine.reply('a3', { kind: 'decline' }));
phones(engine, ['a1', 'a2', 'a4']);
console.log(`\nFinal state: ${engine.state}`);
