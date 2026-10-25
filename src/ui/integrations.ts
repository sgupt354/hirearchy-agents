// The one place the UI talks to integrations. Real module: src/integrations (Aditya's, server-backed).
// If a real call ever throws, the local stub answers instead, so the demo never breaks.

import * as real from '../integrations';
import * as stub from './integrationsStub';

type MessageInput = Parameters<typeof real.generateMessage>[0];
type CircleEvent = Parameters<typeof real.downloadIcs>[0];

/** Student phone copy comes from src/ui/copy.ts unless this is explicitly turned on. */
export const USE_LLM_COPY = import.meta.env.VITE_USE_LLM_COPY === 'true';

export async function parseInvite(text: string) {
  try {
    return await real.parseInvite(text);
  } catch {
    return stub.parseInvite(text);
  }
}

export async function generateMessage(input: MessageInput): Promise<string> {
  try {
    return await real.generateMessage({ ...input, details: withTimes(input.details) });
  } catch {
    return stub.generateMessage(input);
  }
}

export async function notifyPhone(text: string): Promise<void> {
  try {
    await real.notifyPhone(text);
  } catch {
    await stub.notifyPhone(text);
  }
}

export function downloadIcs(circle: CircleEvent): void {
  try {
    real.downloadIcs(circle);
  } catch {
    stub.downloadIcs(circle);
  }
}

/** The engine sends `window: "7:30 PM-9:00 PM"`; the integration's fallback text reads `start` / `end`. */
function withTimes(details: Record<string, string>): Record<string, string> {
  const [start, end] = (details.window ?? '').split('-');
  return start && end ? { ...details, start, end } : details;
}
