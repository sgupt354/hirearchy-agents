import { useSyncExternalStore } from 'react';
import type { ScoredPosting } from './jobs/match';
import { DEMO_PROFILE, type Profile } from './resume/profile';

// Session-only state for the apply suite: tracked postings, the student's profile and the posting being applied to.
// Nothing is persisted; global Reset clears it.

/** Where an application stands (jobapp's pipeline): Saved → Applied → OA → Interview → Offer, or Rejected. */
export const TRACKER_STATUSES = ['Saved', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected'] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export interface TrackedPosting extends ScoredPosting {
  /** "live" from the public boards, or "demo" when live search was unavailable. */
  source: 'live' | 'demo';
  trackedAt: string;
  /** Defaults to "Saved" when absent. */
  status?: TrackerStatus;
}

class ApplyStore {
  #tracked: TrackedPosting[] = [];
  #profile: Profile = structuredClone(DEMO_PROFILE);
  #profileIsDemo = true;
  #selected: string | null = null;
  #version = 0;
  #listeners = new Set<() => void>();
  #resetKey = 0;

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
    this.#emit();
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
