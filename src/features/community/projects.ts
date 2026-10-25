import { allConsented, newConsent, recordConsent, type ConsentMap } from '../../engine/consent';
import { BROKER, EventLog } from '../../engine/events';
import type { IdentityVault } from '../../engine/identity';
import type { AgentEvent, Draft, Identity } from '../../engine/types';
import type { CommunityMessage, CommunityMsgKind } from './community';
import type { PointEntry, PointsLedger } from './points';
import { DEMO_WEEK, type JuniorProfile, type ProjectInput, type SeniorRules } from './seed';

export type ApplicationStatus = 'SHORTLISTED' | 'FILTERED' | 'PICKED' | 'JOINED' | 'DECLINED' | 'LEFT';

/** What the senior's agent receives: no name, just what the junior's agent may share. */
export interface AnonymousApplication {
  handle: string;
  skills: string[];
  hoursPerWeek: number;
  role: string;
}

export interface ShortlistCheck {
  id: 'stack' | 'hours' | 'role';
  label: string;
  pass: boolean;
  observed: string;
}

export interface Application extends AnonymousApplication {
  junior: string;
  status: ApplicationStatus;
  checks: ShortlistCheck[];
  /** Hours logged per week. A junior who leaves keeps their credit. */
  hours: Record<string, number>;
}

export interface Project extends ProjectInput {
  id: string;
  owner: string;
}

export class HoursCapError extends Error {}

/**
 * Project collaboration board. A senior posts a project; junior agents apply with anonymous profiles; the senior's
 * agent shortlists by the senior's PRIVATE rules; the senior picks; names unlock only after both agree. The weekly
 * hours cap is enforced; juniors are credited for their hours, can leave anytime and never lose points for it. The
 * senior earns mentor points for each week both sides confirm.
 */
export class ProjectBoard {
  #log = new EventLog('projects-1');
  #projects: Project[] = [];
  #apps = new Map<string, Application[]>();
  #consents = new Map<string, ConsentMap>();
  #phones = new Map<string, CommunityMessage[]>();

  constructor(
    private readonly ledger: PointsLedger,
    private readonly vault: IdentityVault,
    private readonly label: (id: string) => string,
    private readonly juniors: Record<string, JuniorProfile>,
    private readonly rules: Record<string, SeniorRules>,
  ) {}

  events(): AgentEvent[] {
    return this.#log.all();
  }

  phone(id: string): CommunityMessage[] {
    return structuredClone(this.#phones.get(id) ?? []);
  }

  project(id: string): Project | null {
    const p = this.#projects.find((x) => x.id === id);
    return p ? structuredClone(p) : null;
  }

  applications(projectId: string): Application[] {
    return structuredClone(this.#apps.get(projectId) ?? []);
  }

  /** What the senior's agent saw for each applicant (never a name). */
  anonymousApplications(projectId: string): AnonymousApplication[] {
    return (this.#apps.get(projectId) ?? []).map(({ handle, skills, hoursPerWeek, role }) => ({ handle, skills: [...skills], hoursPerWeek, role }));
  }

  /** Credit for everyone who worked on it, including people who left. Names only once both agreed. */
  credits(projectId: string): { junior: string; handle: string; hours: number; status: ApplicationStatus }[] {
    return (this.#apps.get(projectId) ?? [])
      .filter((a) => a.status === 'JOINED' || a.status === 'LEFT')
      .map((a) => ({ junior: a.junior, handle: a.handle, hours: Object.values(a.hours).reduce((x, y) => x + y, 0), status: a.status }));
  }

  getIdentity(requester: string, target: string): Identity {
    for (const [key, consents] of this.#consents) {
      if (key.split('|').slice(1).every((x) => [requester, target].includes(x)) && requester in consents && target in consents) {
        return this.vault.read(consents, requester, target);
      }
    }
    return this.vault.read({}, requester, target);
  }

  // ---- flow ----------------------------------------------------------------------------------------

  post(owner: string, input: ProjectInput): string {
    if (!this.rules[owner]) throw new Error('Only a senior with project rules can post');
    const id = `project-${this.#projects.length + 1}`;
    this.#projects.push({ id, owner, ...structuredClone(input) });
    this.#apps.set(id, []);
    this.#emit(owner, {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { kind: 'project', project: { title: input.title, stack: input.stack, hoursPerWeek: input.hoursPerWeek, roles: input.roles } },
      human_readable: `${this.label(owner)} posted a project: ${input.title}`,
      disclosure: { shared: ['title', 'stack', 'hours cap', 'roles', 'scope'], withheld: ['identity', 'shortlist rules'] },
    });
    this.#notify(owner, 'text', `Posted "${input.title}": ${input.stack.join(', ')}, up to ${input.hoursPerWeek} hours a week. Your agent shortlists applicants by your private rules; you pick.`);
    return id;
  }

  /** A junior's agent applies with an anonymous profile; the senior's agent shortlists it on its own. */
  apply(projectId: string, junior: string): Application {
    const project = this.#get(projectId);
    const me = this.juniors[junior];
    if (!me) throw new Error('Unknown junior');
    const apps = this.#apps.get(projectId)!;
    if (apps.some((a) => a.junior === junior)) throw new Error('Already applied');
    const anon: AnonymousApplication = { handle: this.label(junior), skills: [...me.skills], hoursPerWeek: me.hoursPerWeek, role: me.role };
    this.#emit(junior, {
      type: 'DISCOVER',
      to: [BROKER, project.owner],
      payload: { kind: 'application', project: projectId, application: anon },
      human_readable: `${anon.handle} applied anonymously`,
      disclosure: { shared: ['skills', 'hours per week', 'role'], withheld: ['identity'] },
    });
    const rules = this.rules[project.owner];
    const overlap = me.skills.filter((s) => project.stack.includes(s));
    const checks: ShortlistCheck[] = [
      { id: 'stack', label: `Knows ${rules.minStackOverlap}+ of the stack`, pass: overlap.length >= rules.minStackOverlap, observed: overlap.length ? overlap.join(', ') : 'none of it' },
      { id: 'hours', label: `Within the ${project.hoursPerWeek} h/week cap`, pass: me.hoursPerWeek <= project.hoursPerWeek, observed: `${me.hoursPerWeek} h/week` },
      { id: 'role', label: 'Wants an open role', pass: project.roles.includes(me.role), observed: me.role },
    ];
    const pass = checks.every((c) => c.pass);
    this.#emit(project.owner, {
      type: pass ? 'ACCEPT' : 'REJECT',
      to: [project.owner],
      payload: { kind: 'shortlist', project: projectId, handle: anon.handle, checks },
      human_readable: `${this.label(project.owner)}'s agent ${pass ? 'shortlisted' : 'passed on'} ${anon.handle}`,
      disclosure: { withheld: ['shortlist rules'] },
    });
    const app: Application = { ...anon, junior, status: pass ? 'SHORTLISTED' : 'FILTERED', checks, hours: {} };
    apps.push(app);
    this.#notify(junior, 'text', pass ? `Applied to "${project.title}" anonymously. You're on the shortlist; the senior picks next.` : `Applied to "${project.title}" anonymously. Not a fit this time (${checks.filter((c) => !c.pass).map((c) => c.label.toLowerCase()).join('; ')}). Nothing about you was shared.`);
    return structuredClone(app);
  }

  /** The senior's agent hands its human the shortlist (anonymous handles and its own rule checks). */
  review(projectId: string): void {
    const project = this.#get(projectId);
    const apps = this.#apps.get(projectId)!;
    const n = apps.filter((a) => a.status === 'SHORTLISTED').length;
    this.#notify(project.owner, 'shortlist', `${apps.length} juniors applied. Your agent shortlisted ${n} by your private rules. Your pick; names unlock only if they say yes too.`, true, { project: projectId });
  }

  /** The senior's human picks someone from the shortlist (saying yes for their side). */
  pick(projectId: string, by: string, junior: string): void {
    const project = this.#get(projectId);
    if (by !== project.owner) throw new Error('Only the senior picks');
    const app = this.#app(projectId, junior);
    if (app.status !== 'SHORTLISTED') throw new Error('Only shortlisted applicants can be picked');
    const team = this.#apps.get(projectId)!.filter((a) => a.status === 'JOINED' || a.status === 'PICKED').length;
    if (team >= this.rules[project.owner].maxJuniors) throw new Error('The team is full');
    app.status = 'PICKED';
    const key = `${projectId}|${project.owner}|${junior}`;
    this.#consents.set(key, recordConsent(newConsent([project.owner, junior]), project.owner, 'accepted'));
    this.#emit(project.owner, { type: 'CONSENT', to: [BROKER], payload: { kind: 'pick', project: projectId, handle: app.handle }, human_readable: `${this.label(project.owner)} picked ${app.handle}`, disclosure: { shared: ['consent'], withheld: ['identity'] } });
    this.#emit(junior, { type: 'ESCALATE', to: [junior], payload: { kind: 'join', project: projectId }, human_readable: `${app.handle}'s agent asks its human` });
    this.#notify(
      junior,
      'ask-match',
      `A senior picked you for "${project.title}": ${app.role.toLowerCase()}, up to ${project.hoursPerWeek} hours a week. You can leave anytime and never lose points for it. Names unlock if you say yes. Join?`,
      true,
      { project: projectId },
    );
  }

  respond(projectId: string, junior: string, choice: 'accept' | 'decline'): void {
    const project = this.#get(projectId);
    const app = this.#app(projectId, junior);
    if (app.status !== 'PICKED') throw new Error('No pending invite');
    const key = `${projectId}|${project.owner}|${junior}`;
    if (choice === 'decline') {
      app.status = 'DECLINED';
      this.#consents.delete(key);
      this.#emit(junior, { type: 'DECLINE', to: [BROKER, project.owner], payload: { kind: 'join', project: projectId }, human_readable: `${app.handle} said no. Nothing shared`, disclosure: { withheld: ['identity', 'reason'] } });
      this.#notify(junior, 'text', 'No problem. Nothing about you was shared, and it costs you nothing.');
      this.#notify(project.owner, 'text', `${app.handle} passed this time. Their name stayed private.`);
      return;
    }
    const consents = recordConsent(this.#consents.get(key)!, junior, 'accepted');
    this.#consents.set(key, consents);
    this.#emit(junior, { type: 'CONSENT', to: [BROKER], payload: { kind: 'join', project: projectId }, human_readable: `${app.handle} said yes (and to sharing names)`, disclosure: { shared: ['consent'] } });
    if (!allConsented(consents)) return;
    for (const [me, other] of [[project.owner, junior], [junior, project.owner]] as const) {
      const identity = this.vault.read(consents, me, other);
      this.#emit(BROKER, { type: 'REVEAL', to: [me], payload: { identities: [identity] }, human_readable: `Name unlocked for ${this.label(me)}: ${identity.name}`, disclosure: { shared: ['name', 'email', 'discord'] } });
    }
    app.status = 'JOINED';
    const senior = this.vault.read(consents, junior, project.owner).name.split(' ')[0];
    const them = this.vault.read(consents, project.owner, junior).name.split(' ')[0];
    this.#notify(junior, 'ask-hours', `You're on "${project.title}" with ${senior}. Log your hours each week (up to ${project.hoursPerWeek}); you're credited for every one.`, true, { project: projectId, hours: this.juniors[junior].hoursPerWeek });
    this.#notify(project.owner, 'text', `${them} joined "${project.title}". Each week you both confirm earns you mentor points.`);
  }

  /** Hours count toward the junior's credit; the weekly cap is a hard limit. */
  logHours(projectId: string, junior: string, hours: number, week = DEMO_WEEK): void {
    const project = this.#get(projectId);
    const app = this.#app(projectId, junior);
    if (app.status !== 'JOINED') throw new Error('Only team members log hours');
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('Log a positive number of hours');
    const total = (app.hours[week] ?? 0) + hours;
    if (total > project.hoursPerWeek) throw new HoursCapError(`That would be ${total} hours this week; the cap is ${project.hoursPerWeek}`);
    app.hours[week] = total;
    this.ledger.register({ id: this.#weekId(projectId, junior, week), helper: project.owner, helped: junior, week, topic: project.title });
    this.#emit(junior, { type: 'COMPLETE', to: [BROKER, project.owner], payload: { kind: 'hours', project: projectId, hours, week }, human_readable: `${app.handle} logged ${hours} h (${total} of ${project.hoursPerWeek} this week)` });
    for (const id of [junior, project.owner]) {
      this.#notify(id, 'ask-confirm', `${id === junior ? 'You' : app.handle} logged ${total} of ${project.hoursPerWeek} hours this week. Confirm the week? Points only count once you both do.`, true, { project: projectId, junior, week });
    }
  }

  /** Both confirm a week of work; once both have, the senior earns mentor points (same rules as help sessions). */
  confirmWeek(projectId: string, person: string, junior: string, week = DEMO_WEEK): PointEntry | null {
    const project = this.#get(projectId);
    const app = this.#app(projectId, junior);
    if (!(app.hours[week] > 0)) throw new Error('No hours logged that week');
    const entry = this.ledger.confirm(this.#weekId(projectId, junior, week), person);
    this.#emit(person, { type: 'COMPLETE', to: [BROKER], payload: { kind: 'confirm', project: projectId, week }, human_readable: `${this.label(person)} confirmed the week` });
    if (!entry) this.#notify(person, 'text', 'Thanks. Waiting for the other side to confirm.');
    if (entry) {
      this.#emit(BROKER, { type: 'COMPLETE', to: [project.owner], payload: { kind: 'points', entry }, human_readable: `${this.label(project.owner)} +${entry.points} points (${entry.base} x ${entry.multiplier}: ${entry.reason})`, disclosure: { shared: ['points'] } });
      this.#notify(project.owner, 'points', `You both confirmed the week. +${entry.points} mentor points.`, false, { entry });
      this.#notify(junior, 'ask-leave', 'Week confirmed and credited. Keep going, or leave anytime: your hours stay credited and you never lose points.', true, { project: projectId });
    }
    return entry;
  }

  /** A junior can leave anytime: their credit stays, their points never go down. */
  leave(projectId: string, junior: string): void {
    const project = this.#get(projectId);
    const app = this.#app(projectId, junior);
    if (app.status !== 'JOINED' && app.status !== 'PICKED') throw new Error('Not on this project');
    app.status = 'LEFT';
    this.#emit(junior, { type: 'DISSOLVED', to: [BROKER, project.owner], payload: { kind: 'left', project: projectId }, human_readable: `${app.handle} left the project. Credit kept, no points lost`, disclosure: { withheld: ['reason'] } });
    this.#notify(junior, 'text', `You left "${project.title}". Your ${Object.values(app.hours).reduce((a, b) => a + b, 0)} hours stay credited, and you lost no points.`);
    this.#notify(project.owner, 'text', `${app.handle} left the project. Their hours stay credited to them.`);
  }

  // ---- internals -----------------------------------------------------------------------------------

  #weekId(projectId: string, junior: string, week: string) {
    return `${projectId}-${junior}-${week}`;
  }

  #get(id: string): Project {
    const p = this.#projects.find((x) => x.id === id);
    if (!p) throw new Error('No such project');
    return p;
  }

  #app(projectId: string, junior: string): Application {
    const a = (this.#apps.get(projectId) ?? []).find((x) => x.junior === junior);
    if (!a) throw new Error('No application from this junior');
    return a;
  }

  #notify(id: string, kind: CommunityMsgKind, text: string, needsHuman = false, data?: Record<string, unknown>) {
    const list = this.#phones.get(id) ?? [];
    list.push({ id: list.length + 1, at: this.#log.all().length, kind, text, needsHuman, data });
    this.#phones.set(id, list);
  }

  #emit(from: string, draft: Draft): AgentEvent {
    return this.#log.append(from, draft);
  }
}
