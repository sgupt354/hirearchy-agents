/** Prep-circle students who can be on Discord. Anyone missing an env id stays on the simulated phone. */

export const LIVE_STUDENTS = ['a1', 'a2', 'a3'] as const;
export type LiveStudent = (typeof LIVE_STUDENTS)[number];

export const isLiveStudent = (s: unknown): s is LiveStudent =>
  typeof s === 'string' && (LIVE_STUDENTS as readonly string[]).includes(s);

const ENV_FOR: Record<LiveStudent, readonly string[]> = {
  a1: ['DISCORD_USER_ADITYA', 'DISCORD_ADITYA_USER_ID'],
  a2: ['DISCORD_USER_SUMIT'],
  a3: ['DISCORD_USER_MAYA'],
};

/** Discord snowflake → student. First matching env wins; Aditya still accepts the old alias. */
export function discordUsersFromEnv(env: Record<string, string | undefined> = process.env): Record<LiveStudent, string> {
  const out = {} as Record<LiveStudent, string>;
  for (const id of LIVE_STUDENTS) {
    const value = ENV_FOR[id].map((k) => env[k]?.trim()).find((v) => v);
    if (value) out[id] = value;
  }
  return out;
}

export function studentForDiscordUser(users: Record<string, string>, discordUserId: string): LiveStudent | null {
  for (const id of LIVE_STUDENTS) {
    if (users[id] === discordUserId) return id;
  }
  return null;
}
