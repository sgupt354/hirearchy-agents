import { useSyncExternalStore } from 'react';
import type { ScoredPosting } from './jobs/match';

// Session-only state for the apply suite: postings the student tracked from live search. Nothing is persisted;
// global Reset clears it. Later phases add the profile, contacts and drafts here.

export interface TrackedPosting extends ScoredPosting {
  /** "live" from the public boards, or "demo" when live search was unavailable. */
  source: 'live' | 'demo';
  trackedAt: string;
}

class ApplyStore {
  #tracked: TrackedPosting[] = [];
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
