// Shared UI kit for every journey tab. Import from here, not from the individual files.

export { IPhone, type ChatItem } from './IPhone';
export {
  PhoneFrame,
  ChatBubble,
  TypingIndicator,
  QuickReplies,
  NotificationBanner,
  CalendarCard,
  useChatReveal,
  useClock,
  clock,
  type QuickReplyOption,
  type RevealItem,
  type CalendarCardData,
} from './chat';
export { Drawer } from './Drawer';
export { Icon, Mark, glyphIcon, type IconName } from './Icon';
export { clean } from './text';
export { UnderTheHood } from './UnderTheHood';
export { Inspector } from './Inspector';
export { JudgeLegend } from './JudgeLegend';
export { Graph } from './Graph';
export { LENSES, matchesLens, type Lens } from './view';
export { range12, windowText, prettify, type EventView, type FeedContext } from './copy';
export { SPEEDS, type Speed } from '../app/speed';
export type { TabProps } from '../features/types';
