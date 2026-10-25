import { useEffect, useRef, useState } from 'react';
import type { HumanReply } from '../engine/types';
import { CalendarCard, ChatBubble, PhoneFrame, QuickReplies, TypingIndicator, useChatReveal, type CalendarCardData } from './chat';

export type { CalendarCardData } from './chat';

export interface ChatItem {
  key: string;
  from: 'agent' | 'me';
  text: string;
  /** Agent message that needs the human: banner first, quick replies after. */
  needsHuman?: boolean;
  card?: CalendarCardData;
  time?: string;
}

const TIME_CHIPS = ['7:30 PM', '8:00 PM', '8:30 PM'];

/** A student's phone in the prep-circle flow: ✅ I'm in / 🕗 Suggest a time / Not this time. */
export function IPhone({ owner, caption, items, interactive, pace, onReply }: {
  owner: string;
  caption: string;
  items: ChatItem[];
  /** False while the agents are still mid-conversation. */
  interactive: boolean;
  /** Multiplier for typing / banner timing (presentation speed). */
  pace: number;
  onReply: (reply: HumanReply, bubble: string) => void;
}) {
  const { visible, next, phase, timeOf, firstTime, awaitingHuman } = useChatReveal(items, pace);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState('');
  const chat = useRef<HTMLDivElement>(null);
  const canReply = interactive && awaitingHuman;

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, phase, picking]);

  const send = (reply: HumanReply, bubble: string) => {
    setPicking(false);
    setCustom('');
    onReply(reply, bubble);
  };

  return (
    <PhoneFrame
      owner={owner}
      caption={caption}
      chatRef={chat}
      banner={{ show: phase !== 'idle' && Boolean(next?.needsHuman), text: next?.needsHuman ? next.text : '' }}
    >
      {visible.length === 0 && phase === 'idle' && <p className="chat-empty">No messages yet</p>}
      {visible.length > 0 && <p className="chat-day">Today {firstTime ?? ''}</p>}
      {visible.map((item) =>
        item.card ? (
          <CalendarCard key={item.key} {...item.card} />
        ) : (
          <ChatBubble key={item.key} from={item.from} text={item.text} time={item.from === 'agent' ? timeOf(item.key) : item.time} />
        ),
      )}
      {phase === 'typing' && <TypingIndicator />}
      {canReply && (
        <QuickReplies
          options={[
            { label: "✅ I'm in", tone: 'yes', onClick: () => send({ kind: 'accept' }, "✅ I'm in") },
            { label: '🕗 Suggest a time', on: picking, onClick: () => setPicking((v) => !v) },
            { label: 'Not this time', tone: 'no', onClick: () => send({ kind: 'decline' }, 'Not this time') },
          ]}
        >
          {picking && (
            <div className="time-picker">
              {TIME_CHIPS.map((t) => (
                <button key={t} className="qr time" onClick={() => send({ kind: 'counter', text: t }, `🕗 How about ${t}?`)}>{t}</button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) send({ kind: 'counter', text: custom }, `🕗 ${custom.trim()}`);
                }}
              >
                <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="or type, e.g. 8:15pm" aria-label="Suggest a time" />
                <button type="submit" className="send" disabled={!custom.trim()} aria-label="Send">↑</button>
              </form>
            </div>
          )}
        </QuickReplies>
      )}
    </PhoneFrame>
  );
}
