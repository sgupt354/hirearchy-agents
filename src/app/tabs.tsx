import type { ComponentType } from 'react';
import { PrepCircleTab } from '../features/prep/PrepCircleTab';
import type { TabProps } from '../features/types';
import { ComingSoon } from './ComingSoon';

export type TabId = 'find' | 'pipeline' | 'prep' | 'mock' | 'intel' | 'referral';

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  Component: ComponentType<TabProps>;
}

const soon = (icon: string, title: string, blurb: string): ComponentType<TabProps> =>
  function Placeholder() {
    return <ComingSoon icon={icon} title={title} blurb={blurb} />;
  };

/**
 * The journey, in order. Find, Pipeline and Intel are placeholders until Aditya's branch merges:
 * swap each `soon(...)` for his component (e.g. `FindTab` from '../features/find'), which takes TabProps.
 */
export const TABS: TabDef[] = [
  { id: 'find', label: 'Find', icon: '🔎', Component: soon('🔎', 'Find', 'Your agent scans openings and surfaces the jobs that fit you.') },
  { id: 'pipeline', label: 'Pipeline', icon: '📊', Component: soon('📊', 'Pipeline', 'See how your pipeline is moving, from applied to interviewing to offers.') },
  { id: 'prep', label: 'Prep circle', icon: '👥', Component: PrepCircleTab },
  { id: 'mock', label: 'Mock interview', icon: '🎤', Component: soon('🎤', 'Mock interview', 'Swap mock interviews with students in the same round.') },
  { id: 'intel', label: 'Intel', icon: '💡', Component: soon('💡', 'Intel', 'Trade anonymized interview intel with your pipeline.') },
  { id: 'referral', label: 'Referral', icon: '🤝', Component: soon('🤝', 'Referral', 'Earn a referral with proof of work, not cold messages.') },
];

export const DEFAULT_TAB: TabId = 'prep';
