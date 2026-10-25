import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, TABS } from '../../src/app/tabs';

describe('journey tab registry', () => {
  it('lists the journey in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Find', 'Pipeline', 'Prep circle', 'Mock interview', 'Intel', 'Referral']);
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length);
  });

  it('opens on the prep circle', () => {
    expect(DEFAULT_TAB).toBe('prep');
  });
});
