import { canReveal, type ConsentMap } from './consent';
import type { AgentProfile, Identity } from './types';

export class IdentityLockedError extends Error {}

/**
 * The data-layer gate for PRIVATE identity. Mirrors the Supabase function t2_get_identity:
 * nothing comes out unless every member of the circle has consented.
 */
export class IdentityVault {
  #identities = new Map<string, Identity>();

  constructor(profiles: AgentProfile[]) {
    for (const p of profiles) {
      const { name, email, discord_id } = p.private;
      this.#identities.set(p.agent_id, { agent_id: p.agent_id, name, email, discord_id });
    }
  }

  read(consents: ConsentMap, requester: string, target: string): Identity {
    if (!canReveal(consents, requester, target)) {
      throw new IdentityLockedError('Identity is locked until every circle member consents');
    }
    return { ...this.#identities.get(target)! };
  }
}
