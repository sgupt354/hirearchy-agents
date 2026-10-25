import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Privacy proof: plant a privacy bug, run the suite, and require the tests to catch it.
// Every file is restored afterwards, even if a run fails or is interrupted.

interface Sabotage {
  name: string;
  file: string;
  find: string;
  replace: string;
}

const SABOTAGES: Sabotage[] = [
  {
    name: 'Broker names the decliner when dissolving',
    file: 'src/engine/broker.ts',
    find: `payload: { reason: "One member couldn't join", revealed: [] },`,
    replace: `payload: { reason: "One member couldn't join", revealed: [], who: from },`,
  },
  {
    name: 'Broker reveals at 2 of 3 consents',
    file: 'src/engine/broker.ts',
    find: 'if (allConsented(this.#consents)) return this.#reveal();',
    replace: "if (Object.values(this.#consents).filter((s) => s === 'accepted').length >= 2) return this.#reveal();",
  },
  {
    name: 'Identity gate removed from the vault',
    file: 'src/engine/identity.ts',
    find: 'if (!canReveal(consents, requester, target)) {',
    replace: 'if (false && !canReveal(consents, requester, target)) {',
  },
  {
    name: 'Listing carries the private name',
    file: 'src/engine/discovery.ts',
    find: '    min_session_minutes: agent.policy.min_session_minutes,\n  };',
    replace: '    min_session_minutes: agent.policy.min_session_minutes,\n    ...({ name: agent.private.name } as object),\n  };',
  },
  {
    name: 'Interview date shared raw instead of abstracted',
    file: 'src/engine/discovery.ts',
    find: 'listing.urgency = urgency;',
    replace: 'listing.urgency = agent.private.interview_date!;',
  },
  {
    name: 'share_skills=false agent still publishes a listing',
    file: 'src/engine/discovery.ts',
    find: "if (!canShare(agent, 'offers')) {",
    replace: "if (false && !canShare(agent, 'offers')) {",
  },
  {
    name: 'Rating leak: trust summary carries the individual ratings',
    file: 'src/features/trust/ledger.ts',
    find: '      showUpRate: round1(list.filter((e) => e.showedUp).length / list.length),\n    };',
    replace: '      showUpRate: round1(list.filter((e) => e.showedUp).length / list.length),\n      ...({ ratings: list } as object),\n    };',
  },
  {
    name: 'Referral auto-approved by the agent after the chat',
    file: 'src/features/referral/referralBridge.ts',
    find: "    this.#set('CHAT_DONE');",
    replace: "    this.#set('CHAT_DONE');\n    return this.decide(REFERRER, 'refer');",
  },
  {
    name: 'Evidence file (links + rubric) sent at stage 1, before the fit check',
    file: 'src/features/referral/referralBridge.ts',
    find: 'const stage1 = this.trust.disclose(seeker, 1);',
    replace: 'const stage1 = this.trust.disclose(seeker, 2) as never;',
  },
  {
    name: 'Mock scores readable by anyone, without the subject\'s grant',
    file: 'src/features/mock/scores.ts',
    find: 'if (requester !== subject && !this.#grants.has(`${subject}→${requester}`)) {',
    replace: 'if (false && requester !== subject && !this.#grants.has(`${subject}→${requester}`)) {',
  },
  {
    name: 'Outreach draft auto-sent without the student',
    file: 'api/outreach-draft.ts',
    find: '    const base = templateDraft(input);\n',
    replace:
      "    const base = templateDraft(input);\n    await (deps.fetchImpl ?? fetch)('https://api.mailgun.net/v3/messages', { method: 'POST', body: JSON.stringify({ to: input.contact.email, text: base.body }) }).catch(() => undefined);\n",
  },
  {
    name: 'Resume export adds skills the student never listed',
    file: 'src/features/apply/resume/tailor.ts',
    find: '    .map((x) => x.s);',
    replace: '    .map((x) => x.s)\n    .concat([...want].filter((t) => !profile.skills.some((s) => s.toLowerCase() === t)).map(label));',
  },
];

const RAW = 'node_modules/.cache/sabotage-results.json';
mkdirSync('node_modules/.cache', { recursive: true });

const originals = new Map<string, string>();
const restore = () => originals.forEach((text, file) => writeFileSync(file, text));
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});

interface Result { title: string; status: string }
let missed = 0;

try {
  for (const s of SABOTAGES) {
    const original = readFileSync(s.file, 'utf8');
    if (!original.includes(s.find)) throw new Error(`Sabotage "${s.name}" no longer applies to ${s.file}; update scripts/sabotage.ts`);
    originals.set(s.file, original);
    writeFileSync(s.file, original.replace(s.find, s.replace));
    try {
      spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', `--outputFile=${RAW}`], { stdio: 'ignore' });
    } finally {
      writeFileSync(s.file, original);
      originals.delete(s.file);
    }
    const report = JSON.parse(readFileSync(RAW, 'utf8')) as { testResults: { assertionResults: Result[] }[] };
    const failed = report.testResults.flatMap((f) => f.assertionResults).filter((t) => t.status === 'failed');
    if (failed.length) {
      console.log(`✓ caught   ${s.name}\n           by ${failed.length} test(s), e.g. "${failed[0].title}"`);
    } else {
      missed += 1;
      console.log(`✗ MISSED   ${s.name}`);
    }
  }
} finally {
  restore();
}

console.log(missed ? `\n${missed} sabotage(s) went undetected.` : `\nAll ${SABOTAGES.length} privacy sabotages were caught.`);
process.exit(missed ? 1 : 0);
