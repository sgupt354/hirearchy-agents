import type { Skill } from '../../engine/types';
import type { Difficulty } from './seed';

/** An anonymized interview report: what was asked and what interviewers looked for. No author fields, ever. */
export interface Report {
  id: string;
  company: string;
  round: string;
  area: Skill;
  difficulty: Exclude<Difficulty, 'any'>;
  prompt: string;
  lookFor: string;
}

export const REPORTS: readonly Report[] = [
  { id: 'ms-t-1', company: 'Microsoft', round: 'Technical', area: 'DSA', difficulty: 'medium', prompt: 'Merge overlapping meeting intervals and return the free slots for a team.', lookFor: 'Sorts first, explains O(n log n), handles touching intervals.' },
  { id: 'ms-t-2', company: 'Microsoft', round: 'Technical', area: 'DSA', difficulty: 'medium', prompt: 'Find the shortest path for a robot on a grid with blocked cells.', lookFor: 'Chooses BFS over DFS and says why; tracks visited cells.' },
  { id: 'ms-t-3', company: 'Microsoft', round: 'Technical', area: 'DSA', difficulty: 'hard', prompt: 'Design an LRU cache with O(1) get and put.', lookFor: 'Hash map plus doubly linked list; walks through an eviction.' },
  { id: 'ms-t-4', company: 'Microsoft', round: 'Technical', area: 'DSA', difficulty: 'easy', prompt: 'Check whether a string of brackets is balanced.', lookFor: 'Uses a stack; covers the empty and single-character cases.' },
  { id: 'ms-t-5', company: 'Microsoft', round: 'Technical', area: 'System Design', difficulty: 'medium', prompt: 'Design a URL shortener for a campus club site.', lookFor: 'Clarifies scale first, picks an ID scheme, mentions caching.' },
  { id: 'ms-t-6', company: 'Microsoft', round: 'Technical', area: 'System Design', difficulty: 'medium', prompt: 'Design the notification service behind a team chat app.', lookFor: 'Separates fan-out from delivery; talks about retries and ordering.' },
  { id: 'ms-t-7', company: 'Microsoft', round: 'Technical', area: 'System Design', difficulty: 'hard', prompt: 'Design a rate limiter shared by several API servers.', lookFor: 'Compares token bucket and sliding window; handles shared state.' },
  { id: 'ms-t-8', company: 'Microsoft', round: 'Technical', area: 'Behavioral', difficulty: 'medium', prompt: 'Tell me about a time a project you owned went off track.', lookFor: 'Clear STAR structure; owns the mistake; shows what changed after.' },
  { id: 'ms-f-1', company: 'Microsoft', round: 'Final', area: 'Behavioral', difficulty: 'medium', prompt: 'Describe a disagreement with a teammate and how it ended.', lookFor: 'Listens first, uses data, ends with a shared decision.' },
  { id: 'g-t-1', company: 'Google', round: 'Technical', area: 'DSA', difficulty: 'medium', prompt: 'Return the k most frequent words in a document.', lookFor: 'Counts with a map, then a heap or bucket sort; states complexity.' },
  { id: 'g-t-2', company: 'Google', round: 'Technical', area: 'System Design', difficulty: 'medium', prompt: 'Design autocomplete for a search box.', lookFor: 'Trie or prefix index, ranking signal, latency budget.' },
  { id: 'g-t-3', company: 'Google', round: 'Technical', area: 'System Design', difficulty: 'hard', prompt: 'Design a photo storage service for millions of users.', lookFor: 'Separates metadata from blobs; discusses replication and CDN.' },
  { id: 'g-t-4', company: 'Google', round: 'Technical', area: 'Behavioral', difficulty: 'medium', prompt: 'Tell me about something you learned quickly under pressure.', lookFor: 'Specific situation, how they learned, measurable result.' },
];

export interface PackQuestion {
  id: string;
  area: Skill;
  difficulty: Report['difficulty'];
  prompt: string;
  lookFor: string;
}

/**
 * Up to `size` questions for an interviewee, from reports for the same company and round:
 * their weak areas first, then their difficulty preference, then report order. Deterministic.
 */
export function questionPack(company: string, round: string, weak: Skill[], difficulty: Difficulty, size = 3): PackQuestion[] {
  const pool = REPORTS.filter((r) => r.company === company && r.round === round);
  const rank = (r: Report) => [
    weak.includes(r.area) ? 0 : 1,
    difficulty === 'any' || r.difficulty === difficulty ? 0 : 1,
    REPORTS.indexOf(r),
  ];
  return [...pool]
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .slice(0, size)
    .map(({ id, area, difficulty: d, prompt, lookFor }) => ({ id, area, difficulty: d, prompt, lookFor }));
}
