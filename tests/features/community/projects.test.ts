import { describe, expect, it } from 'vitest';
import { IdentityLockedError, IdentityVault } from '../../../src/engine/identity';
import { CommunityHub } from '../../../src/features/community/community';
import { HoursCapError, ProjectBoard } from '../../../src/features/community/projects';
import { PointsLedger } from '../../../src/features/community/points';
import { DEMO_PROJECT, JUNIORS, JUNIOR_PROFILES, MENTOR_RULES, ONLINE_AT_START, SENIOR, STANDING_SEED, createCommunitySeed } from '../../../src/features/community/seed';
import { TrustNetwork } from '../../../src/features/trust/network';

const setup = () => {
  const hub = new CommunityHub(new TrustNetwork(), createCommunitySeed, MENTOR_RULES, STANDING_SEED, ONLINE_AT_START);
  const board = hub.projects;
  const id = board.post(SENIOR, DEMO_PROJECT);
  for (const j of JUNIORS) board.apply(id, j);
  return { hub, board, id };
};

describe('pay it forward: project board', () => {
  it("juniors apply anonymously; the senior's agent shortlists by private rules, including the hours cap", () => {
    const { board, id } = setup();
    expect(board.applications(id).map((a) => [a.junior, a.status])).toEqual([['a9', 'SHORTLISTED'], ['a2', 'SHORTLISTED'], ['a8', 'FILTERED']]);
    const riya = board.applications(id).find((a) => a.junior === 'a8')!;
    expect(riya.checks.filter((c) => !c.pass).map((c) => c.id)).toEqual(['stack', 'hours']); // 8 h > 5 h cap
    const seen = JSON.stringify([board.anonymousApplications(id), board.events()]);
    for (const s of ['Priya', 'Nair', 'Sumit', 'Kulkarni', 'Riya', 'Kapoor', 'Sam', 'Okafor', '@example']) expect(seen).not.toContain(s);
    // Shortlist decisions go only to the senior's own agent.
    expect(board.events().filter((e) => e.payload.kind === 'shortlist').every((e) => e.to.length === 1 && e.to[0] === SENIOR)).toBe(true);
    expect(() => board.pick(id, SENIOR, 'a8')).toThrow(/shortlisted/);
    expect(() => board.pick(id, 'a9', 'a9')).toThrow(/senior/);
  });

  it('names unlock only after both agree; the pick alone is not enough', () => {
    const { board, id } = setup();
    board.pick(id, SENIOR, 'a9');
    expect(() => board.getIdentity(SENIOR, 'a9')).toThrow(IdentityLockedError);
    expect(() => board.getIdentity('a9', SENIOR)).toThrow(IdentityLockedError);
    board.respond(id, 'a9', 'accept');
    expect(board.getIdentity(SENIOR, 'a9').name).toBe('Priya Nair');
    expect(board.getIdentity('a9', SENIOR).name).toBe('Sam Okafor');
    expect(() => board.getIdentity('a2', SENIOR)).toThrow(IdentityLockedError); // not on the team
  });

  it('a decline shares nothing and costs nothing', () => {
    const { hub, board, id } = setup();
    board.pick(id, SENIOR, 'a2');
    const before = hub.points.standing('a2');
    board.respond(id, 'a2', 'decline');
    expect(hub.points.standing('a2')).toEqual(before);
    expect(() => board.getIdentity(SENIOR, 'a2')).toThrow(IdentityLockedError);
  });

  it('the weekly hours cap is enforced', () => {
    const { board, id } = setup();
    board.pick(id, SENIOR, 'a9');
    board.respond(id, 'a9', 'accept');
    board.logHours(id, 'a9', 3);
    expect(() => board.logHours(id, 'a9', 3)).toThrow(HoursCapError);
    board.logHours(id, 'a9', 2);
    expect(() => board.logHours(id, 'a9', 0.5)).toThrow(HoursCapError);
    board.logHours(id, 'a9', 4, '2026-W45'); // a new week starts over
    expect(board.credits(id)).toEqual([{ junior: 'a9', handle: 'Newcomer #9', hours: 9, status: 'JOINED' }]);
    expect(() => board.logHours(id, 'a2', 1)).toThrow(/team members/);
  });

  it('the senior earns mentor points only after both confirm a week; juniors never lose points for leaving', () => {
    const { hub, board, id } = setup();
    board.pick(id, SENIOR, 'a9');
    board.respond(id, 'a9', 'accept');
    board.logHours(id, 'a9', 4);
    const senior = hub.points.pointsOf(SENIOR);
    expect(board.confirmWeek(id, SENIOR, 'a9')).toBeNull();
    expect(hub.points.pointsOf(SENIOR)).toBe(senior);
    const entry = board.confirmWeek(id, 'a9', 'a9')!;
    expect(entry).toMatchObject({ person: SENIOR, points: 30, multiplier: 3 }); // Priya is a newcomer
    expect(hub.points.pointsOf(SENIOR)).toBe(senior + 30);

    const junior = hub.points.standing('a9');
    board.leave(id, 'a9');
    expect(hub.points.standing('a9')).toEqual(junior);
    expect(board.credits(id)).toEqual([{ junior: 'a9', handle: 'Newcomer #9', hours: 4, status: 'LEFT' }]);
    expect(() => board.logHours(id, 'a9', 1)).toThrow();
  });

  it("the team size is capped by the senior's private rules", () => {
    const board = new ProjectBoard(new PointsLedger(STANDING_SEED), new IdentityVault(createCommunitySeed()), (id) => id, JUNIOR_PROFILES, { [SENIOR]: { minStackOverlap: 1, maxJuniors: 1 } });
    const id = board.post(SENIOR, DEMO_PROJECT);
    for (const j of JUNIORS) board.apply(id, j);
    board.pick(id, SENIOR, 'a9');
    expect(() => board.pick(id, SENIOR, 'a2')).toThrow(/full/);
    board.respond(id, 'a9', 'decline'); // a no frees the seat
    board.pick(id, SENIOR, 'a2');
    expect(board.applications(id).find((a) => a.junior === 'a2')!.status).toBe('PICKED');
  });
});
