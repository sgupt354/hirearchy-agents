/**
 * Trust follows a person across features. Prep-circle agents are a1…a8 and mock agents m1…m8; both are
 * "Applicant #n", so both map to person pn.
 */
export const personOf = (agentId: string): string => `p${agentId.replace(/^\D+/, '')}`;
