import { describe, expect, it } from 'vitest';
import { CommunityHub } from '../../../src/features/community/community';
import { PACKS, packLimit, starterPackFor, unlockedPacks } from '../../../src/features/community/packs';
import { DEMO_NEED, MENTOR, MENTOR_RULES, NEWCOMER, ONLINE_AT_START, STANDING_SEED, createCommunitySeed } from '../../../src/features/community/seed';
import { createSeed } from '../../../src/engine/seed';
import { MICROSOFT_SEED_INTEL } from '../../../src/features/intel/logic';
import { REPORTS } from '../../../src/features/mock/questions';
import { createReferralSeed } from '../../../src/features/referral/seed';
import { TrustNetwork } from '../../../src/features/trust/network';

describe('pay it forward: question packs', () => {
  it('every item is copied word for word from an existing anonymized source, with that source named', () => {
    for (const pack of PACKS) {
      expect(pack.items.length).toBeGreaterThan(0);
      for (const item of pack.items) {
        if (item.source === 'Anonymized interview report') {
          const r = REPORTS.find((x) => x.id === item.sourceId)!;
          expect(r).toBeDefined();
          expect(item).toEqual({ sourceId: r.id, source: 'Anonymized interview report', kind: 'question', text: r.prompt, lookFor: r.lookFor });
          expect(r.company).toBe(pack.company);
        } else {
          const i = Number(item.sourceId.replace('intel-', ''));
          expect(item).toEqual({ sourceId: `intel-${i}`, source: 'Shared intel report', kind: 'tip', text: MICROSOFT_SEED_INTEL[i].tip });
          expect(pack.company).toBe('Microsoft');
        }
      }
    }
    // No pack for a company with no reports (there is no Amazon data, so there is no Amazon pack).
    expect(PACKS.every((p) => REPORTS.some((r) => r.company === p.company))).toBe(true);
  });

  it('unlock rules: one free starter for a Newcomer, 3 for a Contributor, all for a Mentor and up', () => {
    expect(packLimit('Newcomer')).toBe(1);
    expect(packLimit('Contributor')).toBe(3);
    expect(packLimit('Mentor')).toBe(PACKS.length);
    expect(packLimit('Senior mentor')).toBe(PACKS.length);
    expect(unlockedPacks('Newcomer', 'ms-sd').map((p) => p.id)).toEqual(['ms-sd']);
    expect(unlockedPacks('Contributor', 'ms-sd').map((p) => p.id)).toEqual(['ms-sd', 'ms-dsa', 'ms-behavioral']);
    expect(unlockedPacks('Mentor').map((p) => p.id)).toEqual(PACKS.map((p) => p.id));
    expect(starterPackFor({ company: 'Microsoft', topic: 'DSA' })).toBe('ms-dsa');
    expect(starterPackFor({ company: 'Microsoft', topic: 'Behavioral' })).toBe('ms-behavioral');
    expect(starterPackFor({ company: 'Google', topic: 'System Design' })).toBe('google-tech');
  });

  it('no identity in any pack: no author fields, no names, emails or handles from any seed', () => {
    const text = JSON.stringify(PACKS);
    const people = [...createSeed(), ...createCommunitySeed(), ...createReferralSeed()];
    for (const p of people) {
      for (const v of [p.private.name, ...p.private.name.split(' '), p.private.email, p.private.discord_id]) expect(text).not.toContain(v);
    }
    expect(text).not.toMatch(/@|author|student|contributor_id/i);
    for (const item of PACKS.flatMap((p) => p.items)) {
      expect(Object.keys(item).every((k) => ['sourceId', 'source', 'kind', 'text', 'lookFor'].includes(k))).toBe(true);
    }
  });

  it('in the hub: Priya gets her starter when she posts; Aditya unlocks 3 when he reaches Contributor', () => {
    const h = new CommunityHub(new TrustNetwork(), createCommunitySeed, MENTOR_RULES, STANDING_SEED, ONLINE_AT_START);
    expect(h.packsFor(NEWCOMER).map((p) => p.id)).toEqual(['ms-dsa']); // Newcomer level: catalog's first by default
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    expect(h.starterOf(NEWCOMER)).toBe('ms-dsa');
    expect(h.phone(NEWCOMER).some((m) => m.kind === 'packs')).toBe(true);
    expect(h.packsFor(MENTOR)).toHaveLength(1);
    h.mentorOnline(MENTOR);
    h.reply(id, MENTOR, 'accept');
    h.reply(id, NEWCOMER, 'accept');
    h.confirm(id, MENTOR);
    h.confirm(id, NEWCOMER);
    expect(h.packsFor(MENTOR)).toHaveLength(3);
    const unlock = h.phone(MENTOR).find((m) => m.kind === 'packs')!;
    expect(unlock.data!.packs).toEqual(['ms-dsa', 'ms-sd', 'ms-behavioral']);
    // Unlocking is by level only: Priya's packs didn't change, and nobody spent anything.
    expect(h.packsFor(NEWCOMER).map((p) => p.id)).toEqual(['ms-dsa']);
    expect(h.points.pointsOf(MENTOR)).toBe(30);
  });
});
