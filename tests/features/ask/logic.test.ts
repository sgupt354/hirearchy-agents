import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_COUNTS,
  FORBIDDEN_IDENTITY,
  SUGGESTED_QUESTIONS,
  answerContainsIdentity,
  answerQuestion,
  parseQuestion,
  parseQuestionWithLlm,
  scrubQuestion,
  startIntroConsent,
} from '../../../src/features/ask/logic';

const EXAMPLES: { q: string; intent: string; company: string }[] = [
  { q: 'I have a Microsoft final Thursday and need system design help', intent: 'find-help', company: 'Microsoft' },
  { q: 'What did Microsoft ask this week?', intent: 'intel', company: 'Microsoft' },
  { q: 'Has anyone heard back from Datadog?', intent: 'pipeline-status', company: 'Datadog' },
  { q: "Does anyone have a connection at BlackRock?", intent: 'connection', company: 'BlackRock' },
];

function serializedAnswer(raw: string) {
  return JSON.stringify(answerQuestion(parseQuestion(raw)));
}

describe('parseQuestion', () => {
  it.each(EXAMPLES)('$q → $intent ($company)', ({ q, intent, company }) => {
    const parsed = parseQuestion(q);
    expect(parsed.intent).toBe(intent);
    expect(parsed.company).toBe(company);
    expect(parsed.question).toBe(q);
  });

  it('maps system design onto the Community help topic', () => {
    expect(parseQuestion(EXAMPLES[0].q).topic).toBe('System Design');
    expect(parseQuestion(EXAMPLES[0].q).round).toBe('Final');
  });

  it('does not treat "ask for an intro" as intel', () => {
    expect(parseQuestion('Can anyone intro me to Stripe?').intent).toBe('connection');
  });

  it.each(['', '   ', 'asdfghjkl', '???', 'DROP TABLE students;', 12, null, undefined, { text: 'hi' }])(
    'handles junk %j as unknown without throwing',
    (raw) => {
      expect(() => parseQuestion(raw)).not.toThrow();
      expect(parseQuestion(raw).intent).toBe('unknown');
    },
  );
});

describe('scrubQuestion', () => {
  it('strips emails and phones before a question is stored', () => {
    const scrubbed = scrubQuestion('Help me, I am Maya Okonkwo at maya.o@example.edu or 555-123-4567');
    expect(scrubbed).not.toMatch(/maya\.o@example\.edu/i);
    expect(scrubbed).not.toContain('555-123-4567');
    expect(scrubbed).not.toMatch(/Maya Okonkwo/i);
    expect(parseQuestion('Email jordan.ellis@example.edu about Microsoft intel').question).not.toContain('jordan.ellis');
  });
});

describe('answers never carry names', () => {
  it.each(SUGGESTED_QUESTIONS)('answer for %s has no identity strings', (q) => {
    const blob = serializedAnswer(q);
    for (const ident of FORBIDDEN_IDENTITY) {
      expect(blob.toLowerCase()).not.toContain(ident.toLowerCase());
    }
    expect(answerContainsIdentity(blob)).toBe(false);
  });

  it('the BlackRock connection question never reveals who could intro', () => {
    const answer = answerQuestion(parseQuestion('Does anyone have a connection at BlackRock?'));
    expect(answer.intent).toBe('connection');
    expect(answer.lines.join(' ')).toBe('2 students could help; ask for an intro?');
    expect(answer.canStartConsent).toBe(true);
    expect(CONNECTION_COUNTS.BlackRock).toBe(2);
    const blob = JSON.stringify(answer);
    expect(blob).not.toMatch(/Nadia|Jordan|Theo|Priya|Aditya Raman|r1|p4/i);
  });

  it('starting consent still names no one', () => {
    const next = startIntroConsent('BlackRock');
    expect(next.lines.join(' ')).toMatch(/both people say yes/i);
    expect(JSON.stringify(next)).not.toMatch(/Nadia|Jordan|Theo/i);
  });

  it('pipeline answers hide stats below 3 reports and still have no people', () => {
    const answer = answerQuestion(parseQuestion('Has anyone heard back from Datadog?'));
    expect(answer.intent).toBe('pipeline-status');
    expect(answer.lines.join(' ')).toMatch(/Not enough reports yet/);
    expect(answer.lines.join(' ')).toMatch(/7 in your pipeline/);
    expect(JSON.stringify(answer)).not.toMatch(/Maya|Aditya|student #/i);
  });

  it('intel answers are anonymized reports, not authors', () => {
    const blob = serializedAnswer('What did Microsoft ask this week?');
    expect(blob).toMatch(/Technical screen/);
    expect(blob).not.toMatch(/Aditya|Sumit|written by/i);
  });

  it('find-help posts an anonymous request, not a named student', () => {
    const answer = answerQuestion(parseQuestion('I have a Microsoft final Thursday and need system design help'));
    expect(answer.intent).toBe('find-help');
    expect(answer.helpRequestId).toMatch(/^need-/);
    expect(answer.lines.join(' ')).toMatch(/anonymous help request/);
    expect(answer.lines.join(' ')).toMatch(/System Design/);
    expect(JSON.stringify(answer)).not.toMatch(/Priya Nair|Aditya Raman/i);
  });
});

describe('optional LLM overlay', () => {
  it('falls back to the deterministic parser when the LLM call fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const parsed = await parseQuestionWithLlm('What did Microsoft ask this week?', fetchImpl);
    expect(parsed.intent).toBe('intel');
    expect(parsed.company).toBe('Microsoft');
  });

  it('falls back when the LLM returns an invalid intent', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ intent: 'doxx-everyone' }), { status: 200 })) as unknown as typeof fetch;
    const parsed = await parseQuestionWithLlm('What did Microsoft ask this week?', fetchImpl);
    expect(parsed.intent).toBe('intel');
  });

  it('sends only the scrubbed question to the LLM endpoint', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).text).not.toContain('@');
      expect(JSON.parse(String(init?.body)).text).not.toMatch(/maya\.o@/i);
      return new Response(JSON.stringify({ intent: 'intel', company: 'Microsoft' }), { status: 200 });
    }) as unknown as typeof fetch;
    await parseQuestionWithLlm('What did Microsoft ask this week? ping maya.o@example.edu', fetchImpl);
    expect(fetchImpl).toHaveBeenCalled();
  });
});
