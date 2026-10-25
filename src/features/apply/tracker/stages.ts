/** Where an application stands (jobapp's pipeline): Saved → Applied → OA → Interview → Offer, or Rejected. */
export const TRACKER_STATUSES = ['Saved', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected'] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];
