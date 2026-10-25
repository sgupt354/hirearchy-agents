import { useSyncExternalStore } from 'react';
import type { ScoredPosting } from './jobs/match';
import { DEMO_PROFILE, type Profile } from './resume/profile';
import type { TrackerStatus } from './tracker/stages';
import { addLink, applicationId, mergeApplication, newApplication, type Application, type JourneyLink, type Stage } from './applications';
import type { Nudge, NudgeState } from '../journey/nudges';

// Session-only state for the apply suite: tracked postings, the student's profile and the posting being applied to.
// Nothing is persisted; global Reset clears it.

export { TRACKER_STATUSES, type TrackerStatus } from './tracker/stages';

export interface TrackedPosting extends ScoredPosting {
  /** "live" from the public boards, or "demo" when live search was unavailable. */
  source: 'live' | 'demo';
  trackedAt: string;
  /** Defaults to "Saved" when absent. */
  status?: TrackerStatus;
}

/** The student using Find and Apply (Aditya, person p1 in the trust network). */
export const STUDENT = 'p1';
/** The demo clock starts where the agents' event log does: Sunday Oct 25, 6:00 PM. */
export const DEMO_NOW = '2026-10-25T18:00';

export interface ApplicationKey {
  owner: string;
  company: string;
  role: string;
  /** What the tab knows for sure, e.g. an interview invite means Interview. Only moves the stage forward. */
  stage?: Stage;
  interviewDate?: string | null;
}

class ApplyStore {
  #tracked: TrackedPosting[] = [];
  #profile: Profile = structuredClone(DEMO_PROFILE);
  #profileIsDemo = true;
  #selected: string | null = null;
  #version = 0;
  #listeners = new Set<() => void>();
  #resetKey = 0;
  #apps: Application[] = [];
  #now = DEMO_NOW;
  #nudges: NudgeState = { sent: [], muted: [], mutedAll: false };
  #answers: Record<string, 'yes' | 'no'> = {};

  tracked(): TrackedPosting[] {
    return [...this.#tracked];
  }

  isTracked(id: string): boolean {
    return this.#tracked.some((p) => p.id === id);
  }

  track(p: ScoredPosting, source: 'live' | 'demo', at: string): void {
    if (this.isTracked(p.id)) return;
    this.#tracked = [...this.#tracked, { ...p, source, trackedAt: at }];
    this.#selected = p.id;
    this.#upsert({ owner: STUDENT, company: p.company, role: p.title, stage: 'Saved' }, p.id);
    this.#emit();
  }

  // ---- application records (one per student per job) -----------------------------------------------

  applications(owner?: string): Application[] {
    return structuredClone(owner ? this.#apps.filter((a) => a.owner === owner) : this.#apps);
  }

  application(id: string): Application | null {
    const a = this.#apps.find((x) => x.id === id);
    return a ? structuredClone(a) : null;
  }

  /** Create the record if it's new; otherwise only move it forward. Returns its id. */
  recordApplication(key: ApplicationKey): string {
    const id = this.#upsert(key);
    this.#emit();
    return id;
  }

  /** A tab links one step of the journey (a prep circle, a mock, a referral...) to the job it was for. */
  linkApplication(key: ApplicationKey, link: Omit<JourneyLink, 'at'>): string {
    const id = this.#upsert(key);
    this.#apps = this.#apps.map((a) => (a.id === id ? addLink(a, { ...link, at: this.today() }) : a));
    this.#emit();
    return id;
  }

  /** The student sets the stage themselves (any stage; it's their record). Keeps the Apply tracker in step. */
  setStage(id: string, stage: Stage): void {
    const app = this.#apps.find((a) => a.id === id);
    if (!app) return;
    this.#apps = this.#apps.map((a) => (a.id === id ? { ...a, stage, dates: { ...a.dates, [stage]: this.today() } } : a));
    if (app.postingId) this.#tracked = this.#tracked.map((p) => (p.id === app.postingId ? { ...p, status: stage } : p));
    this.#emit();
  }

  /** Demo clock (ISO local, "YYYY-MM-DDTHH:MM"). Nudges and follow-ups read it; nothing reads the real clock. */
  now(): string {
    return this.#now;
  }

  today(): string {
    return this.#now.slice(0, 10);
  }

  setNow(iso: string): void {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) throw new Error('Use YYYY-MM-DDTHH:MM');
    this.#now = iso;
    this.#emit();
  }

  // ---- proactive nudges (planned by journey/nudges.ts; the store only keeps what was sent and the mutes) ----

  nudges(): NudgeState {
    return structuredClone(this.#nudges);
  }

  /** Record nudges as sent. Ignores any for a muted application, so a mute always wins. */
  recordNudges(list: Nudge[]): Nudge[] {
    const fresh = list.filter((n) => !this.#nudges.mutedAll && !this.#nudges.muted.includes(n.appId) && !this.#nudges.sent.some((s) => s.id === n.id));
    if (!fresh.length) return [];
    this.#nudges = { ...this.#nudges, sent: [...this.#nudges.sent, ...structuredClone(fresh)] };
    this.#emit();
    return fresh;
  }

  mute(appId: string | 'all', on = true): void {
    if (appId === 'all') this.#nudges = { ...this.#nudges, mutedAll: on };
    else this.#nudges = { ...this.#nudges, muted: on ? [...new Set([...this.#nudges.muted, appId])] : this.#nudges.muted.filter((m) => m !== appId) };
    this.#emit();
  }

  answerNudge(id: string, answer: 'yes' | 'no'): void {
    if (this.#answers[id]) return;
    this.#answers = { ...this.#answers, [id]: answer };
    this.#emit();
  }

  nudgeAnswer(id: string): 'yes' | 'no' | null {
    return this.#answers[id] ?? null;
  }

  #upsert(key: ApplicationKey, postingId: string | null = null): string {
    const id = applicationId(key.owner, key.company, key.role);
    const existing = this.#apps.find((a) => a.id === id);
    const input = { stage: key.stage, at: this.today(), interviewDate: key.interviewDate ?? null, postingId };
    if (existing) this.#apps = this.#apps.map((a) => (a.id === id ? mergeApplication(a, input) : a));
    else this.#apps = [...this.#apps, newApplication({ owner: key.owner, company: key.company, role: key.role, ...input })];
    return id;
  }

  /** The student's profile (starts as the labelled demo profile). */
  profile(): Profile {
    return this.#profile;
  }

  profileIsDemo(): boolean {
    return this.#profileIsDemo;
  }

  setProfile(p: Profile, demo = false): void {
    this.#profile = structuredClone(p);
    this.#profileIsDemo = demo;
    this.#emit();
  }

  selected(): string | null {
    return this.#selected;
  }

  select(id: string | null): void {
    this.#selected = id;
    this.#emit();
  }

  setStatus(id: string, status: TrackerStatus): void {
    this.#tracked = this.#tracked.map((p) => (p.id === id ? { ...p, status } : p));
    // The same job's application record follows the tracker.
    this.#apps = this.#apps.map((a) => (a.postingId === id ? { ...a, stage: status, dates: { ...a.dates, [status]: this.today() } } : a));
    this.#emit();
  }

  untrack(id: string): void {
    this.#tracked = this.#tracked.filter((p) => p.id !== id);
    this.#emit();
  }

  /** Clears everything once per global Reset (several tabs call this with the same key). */
  resetFor(resetKey: number): void {
    if (resetKey === this.#resetKey) return;
    this.#resetKey = resetKey;
    this.#tracked = [];
    this.#profile = structuredClone(DEMO_PROFILE);
    this.#profileIsDemo = true;
    this.#selected = null;
    this.#apps = [];
    this.#now = DEMO_NOW;
    this.#nudges = { sent: [], muted: [], mutedAll: false };
    this.#answers = {};
    this.#emit();
  }

  subscribe = (fn: () => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  getVersion = () => this.#version;

  #emit() {
    this.#version += 1;
    this.#listeners.forEach((fn) => fn());
  }
}

export const applyStore = new ApplyStore();

export function useApplyStore(): ApplyStore {
  useSyncExternalStore(applyStore.subscribe, applyStore.getVersion);
  return applyStore;
}
