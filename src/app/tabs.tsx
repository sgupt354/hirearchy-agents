import type { ComponentType } from 'react';
import { FindTab } from '../features/find';
import { IntelTab } from '../features/intel';
import { MockTab } from '../features/mock/MockTab';
import { PipelineTab } from '../features/pipeline';
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
 * The journey, in order. Find, Pipeline and Intel are Aditya's (merged from aditya/journey); Referral arrives
 * in Phase E. A tab with `Component: null` stays hidden; setting it makes the tab appear automatically.
 */
export const TABS: TabDef[] = [
  { id: 'find', label: 'Find', icon: '🔎', Component: FindTab },
  { id: 'pipeline', label: 'Pipeline', icon: '📊', Component: PipelineTab },
  { id: 'prep', label: 'Prep circle', icon: '👥', Component: PrepCircleTab },
  { id: 'mock', label: 'Mock interview', icon: '🎤', Component: MockTab },
  { id: 'intel', label: 'Intel', icon: '💡', Component: IntelTab },
  { id: 'referral', label: 'Referral', icon: '🤝', Component: null },
];

/** Tabs shown in the nav: only those with a real component, in journey order. */
export const VISIBLE_TABS = TABS.filter((t): t is TabDef & { Component: ComponentType<TabProps> } => t.Component !== null);

export const DEFAULT_TAB: TabId = 'prep';
