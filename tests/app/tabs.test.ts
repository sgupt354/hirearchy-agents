import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, TABS, VISIBLE_TABS } from '../../src/app/tabs';

describe('journey tab registry', () => {
  it('lists the journey in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Find', 'Pipeline', 'Prep circle', 'Mock interview', 'Intel', 'Referral']);
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length);
  });

  it('shows only tabs with a real component, in journey order', () => {
    expect(VISIBLE_TABS.map((t) => t.label)).toEqual(['Find', 'Pipeline', 'Prep circle', 'Mock interview', 'Intel']);
    expect(TABS.filter((t) => t.Component === null).map((t) => t.label)).toEqual(['Referral']);
    expect(VISIBLE_TABS.every((t) => typeof t.Component === 'function')).toBe(true);
  });

  it('opens on the prep circle, which is visible', () => {
    expect(DEFAULT_TAB).toBe('prep');
    expect(VISIBLE_TABS.some((t) => t.id === DEFAULT_TAB)).toBe(true);
  });
});
