import type { ComponentType } from 'react';
import { ApplyTab } from '../features/apply/ApplyTab';
import { CommunityTab } from '../features/community/CommunityTab';
import { LiveFind } from '../features/apply/LiveFind';
import { FindTab } from '../features/find';
import { IntelTab } from '../features/intel';
import { MockTab } from '../features/mock/MockTab';
import { PipelineTab } from '../features/pipeline';
import { PrepCircleTab } from '../features/prep/PrepCircleTab';
import { ReferralTab } from '../features/referral/ReferralTab';
import type { TabProps } from '../features/types';

export type TabId = 'find' | 'apply' | 'pipeline' | 'prep' | 'community' | 'mock' | 'intel' | 'referral';

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  /** null = not built yet: the tab stays hidden until a real component is registered here. */
  Component: ComponentType<TabProps> | null;
  /** Optional live version of the tab, behind the top bar's "Live search" switch (off by default). */
  Live?: ComponentType<TabProps>;
}

/**
 * The journey, in order. Find, Pipeline and Intel are Aditya's (merged from aditya/journey); Referral is the
 * Referral Bridge (Phase E). A tab with `Component: null` stays hidden; setting it makes the tab appear.
 */
export const TABS: TabDef[] = [
  { id: 'find', label: 'Find', icon: 'search', Component: FindTab, Live: LiveFind },
  { id: 'apply', label: 'Apply', icon: 'file', Component: ApplyTab },
  { id: 'pipeline', label: 'Pipeline', icon: 'chart', Component: PipelineTab },
  { id: 'prep', label: 'Prep circle', icon: 'users', Component: PrepCircleTab },
  { id: 'community', label: 'Community', icon: 'award', Component: CommunityTab },
  { id: 'mock', label: 'Mock interview', icon: 'mic', Component: MockTab },
  { id: 'intel', label: 'Intel', icon: 'idea', Component: IntelTab },
  { id: 'referral', label: 'Referral', icon: 'handshake', Component: ReferralTab },
];

/** Tabs shown in the nav: only those with a real component, in journey order. */
export const VISIBLE_TABS = TABS.filter((t): t is TabDef & { Component: ComponentType<TabProps> } => t.Component !== null);

export const DEFAULT_TAB: TabId = 'prep';
