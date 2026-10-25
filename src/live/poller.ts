import type { LiveReply } from './protocol';

/**
 * Browser side: poll for Aditya's Discord reply to the current prompt and apply it exactly once.
 * After `maxFailures` failed polls in a row, give up and report live mode unavailable.
 */
export class LivePoller {
  #applied = new Set<string>();
  #failures = 0;

  constructor(
    private readonly opts: {
      fetchReply: (session: string, prompt: number) => Promise<LiveReply | null>;
      apply: (reply: LiveReply) => void;
      onUnavailable: () => void;
      maxFailures?: number;
    },
  ) {}

  /** One poll. Returns true if a reply was applied. */
  async tick(session: string, prompt: number): Promise<boolean> {
    let reply: LiveReply | null;
    try {
      reply = await this.opts.fetchReply(session, prompt);
      this.#failures = 0;
    } catch {
      this.#failures += 1;
      if (this.#failures === (this.opts.maxFailures ?? 3)) this.opts.onUnavailable();
      return false;
    }
    const key = `${session}|${prompt}`;
    if (!reply || reply.session !== session || reply.prompt !== prompt || this.#applied.has(key)) return false;
    this.#applied.add(key);
    this.opts.apply(reply);
    return true;
  }

  get failures() {
    return this.#failures;
  }
}
