/**
 * Anonymous pipeline statistics. Pure and deterministic: no React, no browser APIs,
 * no network, no randomness. Inputs are aggregate counts only — never identities.
 */

/** A statistic is published only once at least this many reports support it. */
export const MIN_REPORTS = 3;

export type StatKey = 'pipeline' | 'interview' | 'offers';

export const STAT_KEYS: readonly StatKey[] = ['pipeline', 'interview', 'offers'];

/** The reported value and the independent number of reports backing it. */
export interface StatReport {
  value: number;
  reportCount: number;
}

export type CohortStats = Readonly<Record<StatKey, StatReport>>;

export interface CompanyCohort {
  company: string;
  stats: CohortStats;
}

/**
 * A student-facing statistic. The hidden variant has no numeric field at all, so a suppressed
 * value cannot leak through the public result.
 */
export type PublicStat = { visible: true; display: string } | { visible: false; display: string };

export interface PublicPipelineStats {
  company: string;
  pipeline: PublicStat;
  interview: PublicStat;
  offers: PublicStat;
}

export type StatStatus = 'visible' | 'hidden';

export interface InspectorEntry {
  stat: StatKey;
  status: StatStatus;
  reportCount: number;
  minReports: number;
  reason: string;
}

export const HIDDEN_DISPLAY = 'Not enough reports yet';

/** Deterministic demo cohorts. Aggregate counts only. */
export const SEED_COHORTS: readonly CompanyCohort[] = [
  {
    company: 'Microsoft',
    stats: {
      pipeline: { value: 23, reportCount: 23 },
      interview: { value: 6, reportCount: 6 },
      offers: { value: 2, reportCount: 2 },
    },
  },
  {
    // Boundary cohort: interview sits one report short while the others clear the bar.
    company: 'Stripe',
    stats: {
      pipeline: { value: 12, reportCount: 3 },
      interview: { value: 4, reportCount: 2 },
      offers: { value: 3, reportCount: 3 },
    },
  },
  {
    // Sparse cohort: nothing reported for offers at all.
    company: 'Datadog',
    stats: {
      pipeline: { value: 7, reportCount: 4 },
      interview: { value: 2, reportCount: 1 },
      offers: { value: 0, reportCount: 0 },
    },
  },
];

const PHRASING: Record<StatKey, (value: number) => string> = {
  pipeline: (value) => `${value} in your pipeline`,
  interview: (value) => `${value} at interview`,
  offers: (value) => `${value} ${value === 1 ? 'offer' : 'offers'}`,
};

/** Each statistic is judged on its own report count; companies are never judged as a whole. */
function isVisible(report: StatReport | undefined): boolean {
  return (report?.reportCount ?? 0) >= MIN_REPORTS;
}

function toPublicStat(key: StatKey, report: StatReport | undefined): PublicStat {
  if (!report || !isVisible(report)) return { visible: false, display: HIDDEN_DISPLAY };
  return { visible: true, display: PHRASING[key](report.value) };
}

function findCohort(company: string, cohorts: readonly CompanyCohort[]): CompanyCohort | undefined {
  const wanted = company.trim().toLowerCase();
  return cohorts.find((c) => c.company.toLowerCase() === wanted);
}

/**
 * Student-facing statistics for one company. An unknown company yields every statistic hidden
 * rather than an error, so callers always have something safe to render.
 */
export function getPublicPipelineStats(
  company: string,
  cohorts: readonly CompanyCohort[] = SEED_COHORTS,
): PublicPipelineStats {
  const cohort = findCohort(company, cohorts);
  return {
    company,
    pipeline: toPublicStat('pipeline', cohort?.stats.pipeline),
    interview: toPublicStat('interview', cohort?.stats.interview),
    offers: toPublicStat('offers', cohort?.stats.offers),
  };
}

/**
 * Explains which statistics the privacy threshold suppressed. Aggregate counts only —
 * this is a demo of the rule firing, not a backdoor to hidden values.
 */
export function getPipelineInspector(
  company: string,
  cohorts: readonly CompanyCohort[] = SEED_COHORTS,
): InspectorEntry[] {
  const cohort = findCohort(company, cohorts);

  return STAT_KEYS.map((stat) => {
    const reportCount = cohort?.stats[stat]?.reportCount ?? 0;
    const visible = reportCount >= MIN_REPORTS;
    return {
      stat,
      status: visible ? ('visible' as const) : ('hidden' as const),
      reportCount,
      minReports: MIN_REPORTS,
      reason: visible
        ? `${reportCount} reports >= minimum ${MIN_REPORTS}`
        : `${reportCount} reports < minimum ${MIN_REPORTS}`,
    };
  });
}
