import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { generateMessage, parseInvite } from '../src/ui/integrationsStub';

describe('integrations stub', () => {
  it('parseInvite recognises a Microsoft SWE Intern interview invite', async () => {
    const text = 'Hi Aditya, we would like to invite you to interview for the Software Engineer Intern role at Microsoft.';
    expect(await parseInvite(text)).toEqual({ company: 'Microsoft', role: 'SWE Intern', stage: 'interview' });
  });

  it('parseInvite returns null for non-invites', async () => {
    expect(await parseInvite('Your Microsoft order has shipped')).toBeNull();
    expect(await parseInvite('Unfortunately we will not be moving forward with your Microsoft interview')).toBeNull();
    expect(await parseInvite('Please schedule your interview with us')).toBeNull(); // no known company
  });

  it('generateMessage reproduces every structured engine message exactly (template fallback parity)', async () => {
    const engine = new Engine();
    engine.simulateInterviewInvite();
    engine.reply('a3', { kind: 'counter', text: 'whenever' });
    engine.reply('a3', { kind: 'counter', text: '8pm?' });
    for (const id of ['a1', 'a2', 'a3']) engine.reply(id, { kind: 'accept' });
    const messages = ['a1', 'a2', 'a3'].flatMap((id) => engine.phone(id).map((m) => ({ id, m })));
    const structured = messages.filter(({ m }) => m.kind);
    expect(new Set(structured.map(({ m }) => m.kind))).toEqual(new Set(['proposal', 'counter', 'reveal', 'complete']));
    for (const { id, m } of structured) {
      expect(await generateMessage({ recipientLabel: engine.labels()[id], kind: m.kind!, details: m.details! })).toBe(m.text);
    }
  });
});
