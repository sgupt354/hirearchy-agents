/**
 * Ask the network. Pure and deterministic: keywords + regex map a question to one existing
 * surface (Community help, Intel, Pipeline, Referral consent). Privacy is decided here, never
 * by a model. Optional LLM parsing is a best-effort overlay behind VITE_USE_LLM_COPY.
 */

import { CommunityHub } from '../community/community';
import { DEMO_WEEK } from '../community/seed';
import { MICROSOFT_SEED_INTEL, scrubIdentityText, selectRelevantIntel } from '../intel/logic';
import { getPipelineInspector, getPublicPipelineStats, MIN_REPORTS, type PublicStat } from '../pipeline/logic';
import type { Skill } from '../../engine/types';

export type AskIntent = 'find-help' | 'intel' | 'pipeline-status' | 'connection' | 'unknown';

export const ASK_INTENTS: readonly AskIntent[] = ['find-help', 'intel', 'pipeline-status', 'connection', 'unknown'];

export const SUGGESTED_QUESTIONS = [
  'I have a Microsoft final Thursday and need system design help',
  'What did Microsoft ask this week?',
  'Has anyone heard back from Datadog?',
  'Does anyone have a connection at BlackRock?',
] as const;

const COMPANIES = ['Microsoft', 'Datadog', 'Stripe', 'BlackRock', 'Google', 'Amazon', 'Meta', 'Apple'] as const;

/** Seeded intro capacity. Counts only — no student ids, no names. */
export const CONNECTION_COUNTS: Readonly<Record<string, number>> = {
  BlackRock: 2,
  Stripe: 1,
  Google: 3,
  Microsoft: 0,
  Datadog: 0,
};

/** Demo names/emails that must never appear in an answer or a stored question. */
export const FORBIDDEN_IDENTITY = [
  'Aditya Raman',
  'Sumit Kulkarni',
  'Maya Okonkwo',
  'Jordan Ellis',
  'Priya Nair',
  'Priya Desai',
  'Leo Martins',
  'Sam Okafor',
  'Riya Kapoor',
  'Nadia Brooks',
  'Theo Park',
  'aditya.raman@example.edu',
  'aditya.r@example.edu',
  'sumit.k@example.edu',
  'maya.o@example.edu',
  'jordan.ellis@example.edu',
  'priya.nair@example.edu',
  'nadia.b@example.edu',
  'theo.p@example.edu',
] as const;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const HANDLE = /(^|[^\w@/])@\w{2,}/g;

export interface ParsedQuestion {
  intent: AskIntent;
  company: string | null;
  topic: Skill | null;
  round: string | null;
  /** Identity-stripped question. This is the only form that may be stored. */
  question: string;
}

export interface AskDisclosure {
  shared: string[];
  hidden: string[];
}

export interface AskAnswer {
  intent: AskIntent;
  company: string | null;
  lines: string[];
  disclosure: AskDisclosure;
  /** Connection answers can continue into a nameless consent step. */
  canStartConsent: boolean;
  /** Set when a Community help request was posted (anonymous listing only). */
  helpRequestId: string | null;
}

export const EMPTY_ANSWER: AskAnswer = {
  intent: 'unknown',
  company: null,
  lines: [
    "I didn't catch a specific ask. Try one of these: need help preparing, what a company asked, whether anyone heard back, or whether anyone could intro you.",
  ],
  disclosure: { shared: [], hidden: ['identity'] },
  canStartConsent: false,
  helpRequestId: null,
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Strip emails, phones, handles, and known demo names before a question is stored or parsed. */
export function scrubQuestion(raw: unknown): string {
  let text = asText(raw);
  if (!text) return '';
  text = scrubIdentityText(text).replace(EMAIL, '[hidden]').replace(PHONE, '[hidden]').replace(HANDLE, '$1[hidden]');
  for (const ident of FORBIDDEN_IDENTITY) {
    text = text.replace(new RegExp(ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[hidden]');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function findCompany(text: string): string | null {
  const lower = text.toLowerCase();
  return COMPANIES.find((c) => lower.includes(c.toLowerCase())) ?? null;
}

function findTopic(text: string): Skill | null {
  if (/\bsystem\s*design\b|\bdesign\s+round\b/i.test(text)) return 'System Design';
  if (/\bbehavioral\b|\bstar\b/i.test(text)) return 'Behavioral';
  if (/\bdsa\b|\bleetcode\b|\bcoding\b|\balgo/i.test(text)) return 'DSA';
  return null;
}

function findRound(text: string): string | null {
  if (/\bfinal\b/i.test(text)) return 'Final';
  if (/\btechnical\b|\bcoding\s+round\b/i.test(text)) return 'Technical';
  if (/\bbehavioral\b/i.test(text)) return 'Behavioral';
  if (/\bscreen\b/i.test(text)) return 'Screen';
  return null;
}

function deadlineFor(text: string): string {
  if (/\bthursday\b|\bthis week\b/i.test(text)) return '2026-10-29';
  return '2026-11-01';
}

/**
 * Map a (already scrubbed) question to an intent. Connection > intel > pipeline > find-help
 * so "ask for an intro" is never treated as interview intel.
 */
export function parseIntent(scrubbed: string): Omit<ParsedQuestion, 'question'> {
  const q = scrubbed.toLowerCase();
  if (!q) return { intent: 'unknown', company: null, topic: null, round: null };

  const company = findCompany(scrubbed);
  const topic = findTopic(scrubbed);
  const round = findRound(scrubbed);

  if (/\b(connection|intro(?:duction)?s?|referr(?:al|er)?|know anyone|anyone at)\b/i.test(scrubbed)) {
    return { intent: 'connection', company, topic, round };
  }
  if (/\b(what did|ask(?:ed)? this week|questions?\b|intel|what (?:came|comes) up)\b/i.test(scrubbed)) {
    return { intent: 'intel', company, topic, round };
  }
  if (/\b(heard back|pipeline|how many|offers?\b|status at|anyone get back)\b/i.test(scrubbed)) {
    return { intent: 'pipeline-status', company, topic, round };
  }
  if (/\b(need|help|prep|practice|weak (?:at|in)|cover)\b/i.test(scrubbed) || topic) {
    return { intent: 'find-help', company, topic, round };
  }
  return { intent: 'unknown', company, topic, round };
}

export function parseQuestion(raw: unknown): ParsedQuestion {
  const question = scrubQuestion(raw);
  return { ...parseIntent(question), question };
}

function coerceLlmBody(body: unknown, question: string): ParsedQuestion | null {
  if (!body || typeof body !== 'object') return null;
  const intent = (body as { intent?: unknown }).intent;
  if (typeof intent !== 'string' || !(ASK_INTENTS as readonly string[]).includes(intent)) return null;
  const companyRaw = (body as { company?: unknown }).company;
  const company = typeof companyRaw === 'string' && COMPANIES.some((c) => c.toLowerCase() === companyRaw.trim().toLowerCase())
    ? COMPANIES.find((c) => c.toLowerCase() === companyRaw.trim().toLowerCase()) ?? null
    : findCompany(question);
  return {
    intent: intent as AskIntent,
    company,
    topic: findTopic(question),
    round: findRound(question),
    question,
  };
}

/**
 * When VITE_USE_LLM_COPY is on, the UI may call this. Any failure or invalid payload
 * returns the deterministic parse. The model never sees the unsanitized question.
 */
export async function parseQuestionWithLlm(
  raw: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedQuestion> {
  const fallback = parseQuestion(raw);
  if (!fallback.question) return fallback;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetchImpl('/api/ask-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fallback.question }),
        signal: controller.signal,
      });
      if (!res.ok) return fallback;
      const parsed = coerceLlmBody(await res.json(), fallback.question);
      return parsed ?? fallback;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return fallback;
  }
}

function statLine(label: string, stat: PublicStat): string {
  return stat.visible ? `${label}: ${stat.display}` : `${label}: ${stat.display}`;
}

export function answerQuestion(parsed: ParsedQuestion, hub: CommunityHub = new CommunityHub()): AskAnswer {
  const company = parsed.company;
  if (parsed.intent === 'unknown') return { ...EMPTY_ANSWER, company };

  if (parsed.intent === 'intel') {
    const target = company ?? 'Microsoft';
    const reports = selectRelevantIntel([...MICROSOFT_SEED_INTEL], target);
    if (!reports.length) {
      return {
        intent: 'intel',
        company: target,
        lines: [`No anonymized ${target} reports to share yet. Counts and topics only — never who wrote them.`],
        disclosure: { shared: ['company'], hidden: ['authors', 'names', 'exact dates'] },
        canStartConsent: false,
        helpRequestId: null,
      };
    }
    const lines = [
      `Anonymized ${target} intel from this week. Who wrote each report stays hidden.`,
      ...reports.map((r) => `${r.round}: ${r.topics.join(', ')} (difficulty ${r.difficulty}). ${r.tip} (${r.when}.)`),
    ];
    return {
      intent: 'intel',
      company: target,
      lines,
      disclosure: { shared: ['round', 'topics', 'difficulty', 'tip', 'when'], hidden: ['who wrote the report', 'names', 'emails', 'exact interview date'] },
      canStartConsent: false,
      helpRequestId: null,
    };
  }

  if (parsed.intent === 'pipeline-status') {
    const target = company ?? 'Microsoft';
    const stats = getPublicPipelineStats(target);
    const inspector = getPipelineInspector(target);
    const lines = [
      `${target} pipeline, aggregate only. A number shows after ${MIN_REPORTS}+ reports.`,
      statLine('Pipeline', stats.pipeline),
      statLine('Interview', stats.interview),
      statLine('Offers', stats.offers),
    ];
    const hidden = inspector.filter((e) => e.status === 'hidden').map((e) => `${e.stat} value (${e.reason})`);
    const shared = inspector.filter((e) => e.status === 'visible').map((e) => `${e.stat} count`);
    return {
      intent: 'pipeline-status',
      company: target,
      lines,
      disclosure: { shared: shared.length ? shared : ['company'], hidden: hidden.length ? hidden : ['identities'] },
      canStartConsent: false,
      helpRequestId: null,
    };
  }

  if (parsed.intent === 'connection') {
    const target = company ?? 'BlackRock';
    const count = Object.hasOwn(CONNECTION_COUNTS, target) ? CONNECTION_COUNTS[target] : 0;
    const lines =
      count > 0
        ? [`${count} student${count === 1 ? '' : 's'} could help; ask for an intro?`]
        : [`No one in the network has a ${target} intro to offer right now. Identities stay hidden either way.`];
    return {
      intent: 'connection',
      company: target,
      lines,
      disclosure: { shared: ['anonymous count'], hidden: ['names', 'emails', 'who could intro'] },
      canStartConsent: count > 0,
      helpRequestId: null,
    };
  }

  const topic: Skill = parsed.topic ?? 'System Design';
  const target = company ?? 'Microsoft';
  const round = parsed.round ?? 'Technical';
  let helpRequestId: string | null = null;
  try {
    helpRequestId = hub.postNeed('a9', {
      company: target,
      round,
      topic,
      deadline: deadlineFor(parsed.question),
    });
  } catch {
    helpRequestId = null;
  }
  return {
    intent: 'find-help',
    company: target,
    lines: [
      `Posted an anonymous help request: ${target} ${round}, ${topic}. Mentors see the topic and an abstracted deadline, not your name.`,
      `Week ${DEMO_WEEK}. Your identity stays locked until a mentor and you both say yes.`,
    ],
    disclosure: {
      shared: ['company', 'round', 'topic', 'abstracted deadline'],
      hidden: ['name', 'email', 'exact deadline', 'school year'],
    },
    canStartConsent: false,
    helpRequestId,
  };
}

/** Nameless next step after "ask for an intro?". Never names the other student. */
export function startIntroConsent(company: string): AskAnswer {
  return {
    intent: 'connection',
    company,
    lines: [
      `Your agent asked for a ${company} intro. Names stay hidden until both people say yes.`,
    ],
    disclosure: { shared: ['that an intro was requested', 'company'], hidden: ['both names', 'emails', 'who was asked'] },
    canStartConsent: false,
    helpRequestId: null,
  };
}

export function answerContainsIdentity(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_IDENTITY.some((id) => lower.includes(id.toLowerCase()));
}
