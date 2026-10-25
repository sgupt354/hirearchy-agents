import type { AgentEvent } from '../../engine/types';
import { templateDraft, wordCount, type Draft } from './outreach/draft';
import type { Profile } from './resume/profile';
import { tailor, type PostingText, type TailoredResume } from './resume/tailor';

// Referral tie-in: after a referral chat is booked, the seeker's agent prepares an application packet (a resume
// tailored to the role and an intro email draft) from the seeker's own profile. It stays with the seeker's agent until
// the referrer asks for it AND the seeker says yes. Nothing is sent anywhere: the packet is shown to the two of them.

export type PacketState = 'NONE' | 'PREPARED' | 'REQUESTED' | 'SHARED' | 'DECLINED';

export class PacketLockedError extends Error {}

export interface Packet {
  resume: TailoredResume;
  intro: Draft;
}

export interface PacketSummary {
  kept: number;
  total: number;
  unmet: number;
  words: number;
}

/** Jordan's own resume (the referral demo's seeker), labelled as demo data in the UI. */
export const JORDAN_PROFILE: Profile = {
  name: 'Jordan Ellis',
  email: 'jordan.ellis@example.edu',
  phone: '(602) 555-0199',
  links: ['projects.example/j8f4'],
  education: [{ title: 'B.S. Computer Science', org: 'Arizona State University', dates: 'Aug 2023 - May 2027', location: 'Tempe, AZ', bullets: ['Coursework: Distributed Systems, Databases, Algorithms'] }],
  experience: [
    { title: 'Backend Intern', org: 'Cactus Pay', dates: 'May 2025 - Aug 2025', location: 'Phoenix, AZ',
      bullets: ['Built payment webhooks in Python and FastAPI handling 40,000 events a day', 'Added Redis caching that cut p95 response time by 30%', 'Wrote integration tests for the refunds API with pytest'] },
  ],
  projects: [
    { title: 'Sharded KV Store', org: 'Go, Raft', dates: '2025', location: '', bullets: ['Wrote a sharded key-value store in Go with Raft replication and automatic leader failover'] },
    { title: 'Rate Limiter', org: 'TypeScript, Redis', dates: '2024', location: '', bullets: ['Built a token-bucket rate limiter in TypeScript backed by Redis, load-tested to 5,000 requests a second'] },
  ],
  skills: ['Go', 'Python', 'TypeScript', 'SQL', 'Redis', 'PostgreSQL', 'Docker', 'FastAPI'],
};

let seq = 0;
const event = (from: string, to: string[], type: AgentEvent['type'], payload: Record<string, unknown>, human: string,
  disclosure: Partial<AgentEvent['disclosure']>): AgentEvent => ({
  id: `pkt-${String(++seq).padStart(3, '0')}`,
  coordination_id: 'referral-packet',
  from,
  to,
  type,
  payload,
  disclosure: { shared: [], abstracted: [], withheld: [], ...disclosure },
  human_readable: human,
  created_at: new Date(0).toISOString(),
});

export class ApplicationPacket {
  state: PacketState = 'NONE';
  #packet: Packet | null = null;
  #events: AgentEvent[] = [];

  constructor(
    readonly seeker: string,
    readonly referrer: string,
    /** True once both sides said yes to the referral chat (names unlocked). */
    private readonly namesUnlocked: () => boolean,
  ) {}

  /** The seeker's agent builds the packet from the seeker's own profile. It stays with the seeker. */
  prepare(profile: Profile, posting: PostingText, referrerName: string): PacketSummary {
    if (this.state !== 'NONE') throw new Error('Packet already prepared');
    const resume = tailor(profile, posting);
    const top = resume.experience[0]?.bullets[0] ?? resume.projects[0]?.bullets[0] ?? '';
    const intro = templateDraft({ kind: 'referrer', company: posting.company, role: posting.title, contact: { name: referrerName }, student: { name: profile.name, highlight: top } });
    this.#packet = { resume, intro };
    this.state = 'PREPARED';
    const s = this.summary()!;
    this.#events.push(event(this.seeker, [this.seeker], 'DISCOVER', { kind: 'packet-prepared', ...s },
      `Seeker's agent prepared a tailored resume (${s.kept} of ${s.total} of their own bullets) and an intro draft (${s.words} words). Held by the seeker's agent.`,
      { abstracted: [`resume: ${s.kept} of ${s.total} bullets`], withheld: ['resume text', 'intro draft'] }));
    return s;
  }

  summary(): PacketSummary | null {
    if (!this.#packet) return null;
    const r = this.#packet.resume;
    return { kept: r.kept, total: r.total, unmet: r.unmet.length, words: wordCount(this.#packet.intro.body) };
  }

  /** Only the referrer can ask, and only once names are unlocked. */
  request(by: string): void {
    if (by !== this.referrer) throw new PacketLockedError('Only the referrer can request the packet');
    if (!this.namesUnlocked()) throw new PacketLockedError('The packet can be requested only after both say yes to the chat');
    if (this.state !== 'PREPARED') throw new Error('No packet to request');
    this.state = 'REQUESTED';
    this.#events.push(event(this.referrer, ['broker'], 'PROPOSE', { kind: 'packet-request' }, "Referrer asked for the seeker's tailored resume and intro draft", { shared: ['request'] }));
    this.#events.push(event(this.seeker, [this.seeker], 'ESCALATE', { kind: 'packet-ask' }, "Seeker's agent asks its human before sharing the packet", { withheld: ['resume text', 'intro draft'] }));
  }

  /** The seeker's human answers. Shared only on yes, and only to the referrer. */
  consent(by: string, yes: boolean): void {
    if (by !== this.seeker) throw new PacketLockedError("Only the seeker can share the seeker's packet");
    if (this.state !== 'REQUESTED') throw new Error('Nothing to answer');
    if (!yes) {
      this.state = 'DECLINED';
      this.#events.push(event(this.seeker, ['broker'], 'DECLINE', { kind: 'packet' }, 'Seeker kept the packet private', { withheld: ['resume text', 'intro draft'] }));
      return;
    }
    this.state = 'SHARED';
    this.#events.push(event(this.seeker, ['broker'], 'CONSENT', { kind: 'packet-consent' }, 'Seeker said yes to sharing the packet', { shared: ['consent'] }));
    this.#events.push(event(this.seeker, [this.referrer], 'REVEAL', { kind: 'packet-shared' }, 'Tailored resume and intro draft shared with the referrer only. Nothing was emailed.', { shared: ['tailored resume', 'intro draft'] }));
  }

  /** The packet's content: the seeker any time, the referrer only after both said yes. */
  view(requester: string): Packet {
    if (!this.#packet) throw new PacketLockedError('No packet');
    if (requester === this.seeker) return structuredClone(this.#packet);
    if (requester === this.referrer && this.state === 'SHARED') return structuredClone(this.#packet);
    throw new PacketLockedError('The packet is shared only after the referrer asks and the seeker says yes');
  }

  events(): AgentEvent[] {
    return [...this.#events];
  }
}
