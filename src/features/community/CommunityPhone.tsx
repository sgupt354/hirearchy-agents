import { useEffect, useRef, type ReactNode } from 'react';
import { ChatBubble, PhoneFrame, QuickReplies, TypingIndicator, useChatReveal, type QuickReplyOption, type RevealItem } from '../../ui/kit';
import { clean } from '../../ui/text';

export interface CommunityChatItem extends RevealItem {
  text: string;
  time?: string;
  /** A card under the bubble (calendar, rules, rating form, points, proof of work). */
  custom?: ReactNode;
  /** Reply chips, shown while this is the latest message and it's waiting on the human. */
  replies?: QuickReplyOption[];
}

/** A student's phone in Pay it forward: Priya's or Aditya's. */
export function CommunityPhone({ owner, caption, items, interactive, pace }: {
  owner: string;
  caption: string;
  items: CommunityChatItem[];
  interactive: boolean;
  pace: number;
}) {
  const { visible, next, phase, timeOf, firstTime, awaitingHuman } = useChatReveal(items, pace);
  const chat = useRef<HTMLDivElement>(null);
  const last = visible.at(-1);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, phase]);

  const render = (item: CommunityChatItem) => {
    const time = item.from === 'agent' ? timeOf(item.key) : item.time;
    if (!item.custom) return <ChatBubble key={item.key} from={item.from} text={item.text} time={time} />;
    if (!item.text) return <div key={item.key} className="custom-card">{item.custom}</div>;
    return (
      <div key={item.key} className="msg agent">
        <p className="bubble">{clean(item.text)}</p>
        {item.custom}
        <time>{time}</time>
      </div>
    );
  };

  return (
    <PhoneFrame owner={owner} caption={caption} chatRef={chat} banner={{ show: phase !== 'idle' && Boolean(next?.needsHuman), text: next?.needsHuman ? next.text : '' }}>
      {visible.length === 0 && phase === 'idle' && <p className="chat-empty">No messages yet</p>}
      {visible.length > 0 && <p className="chat-day">Today {firstTime ?? ''}</p>}
      {visible.map(render)}
      {phase === 'typing' && <TypingIndicator />}
      {interactive && awaitingHuman && last?.replies && <QuickReplies options={last.replies} />}
    </PhoneFrame>
  );
}
