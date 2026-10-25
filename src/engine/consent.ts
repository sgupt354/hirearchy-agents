export type ConsentStatus = 'pending' | 'accepted' | 'declined';
export type ConsentMap = Record<string, ConsentStatus>;

export function newConsent(members: string[]): ConsentMap {
  return Object.fromEntries(members.map((m) => [m, 'pending' as const]));
}

export function recordConsent(map: ConsentMap, member: string, status: ConsentStatus): ConsentMap {
  if (!(member in map)) throw new Error(`${member} is not a member of this circle`);
  return { ...map, [member]: status };
}

export const allConsented = (map: ConsentMap): boolean =>
  Object.keys(map).length > 0 && Object.values(map).every((s) => s === 'accepted');

/** Identity may flow from target to requester only when both are members and EVERY member consented. */
export function canReveal(map: ConsentMap, requester: string, target: string): boolean {
  return requester in map && target in map && allConsented(map);
}
