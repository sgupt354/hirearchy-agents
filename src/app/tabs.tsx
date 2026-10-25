import type { ComponentType } from 'react';
import { MockTab } from '../features/mock/MockTab';
import { PrepCircleTab } from '../features/prep/PrepCircleTab';
import type { TabProps } from '../features/types';

export type TabId = 'find' | 'pipeline' | 'prep' | 'mock' | 'intel' | 'referral';

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  /** null = not built yet: the tab stays hidden until a real component is registered here. */
  Component: ComponentType<TabProps> | null;
}

/**
 * The journey, in order. Find, Pipeline and Intel arrive with Aditya's branch (e.g. `FindTab` from
 * '../features/find'), Referral in Phase E: set `Component` and the tab appears in the nav automatically.
 */
export const TABS: TabDef[] = [
  { id: 'find', label: 'Find', icon: '🔎', Component: null },
  { id: 'pipeline', label: 'Pipeline', icon: '📊', Component: null },
  { id: 'prep', label: 'Prep circle', icon: '👥', Component: PrepCircleTab },
  { id: 'mock', label: 'Mock interview', icon: '🎤', Component: MockTab },
  { id: 'intel', label: 'Intel', icon: '💡', Component: null },
  { id: 'referral', label: 'Referral', icon: '🤝', Component: null },
];

/** Tabs shown in the nav: only those with a real component, in journey order. */
export const VISIBLE_TABS = TABS.filter((t): t is TabDef & { Component: ComponentType<TabProps> } => t.Component !== null);

export const DEFAULT_TAB: TabId = 'prep';
