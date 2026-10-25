import { useEffect, useState } from 'react';

/** "Paste a real invite": runs parseInvite() via onCheck and shows the outcome. */
export function InviteModal({ open, pending, status, onCheck, onClose }: {
  open: boolean;
  pending: boolean;
  status: { tone: 'ok' | 'info' | 'bad'; message: string } | null;
  onCheck: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!open) return setText('');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Paste a real invite"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onCheck(text);
        }}
      >
        <header>
          <h2>Paste a real invite</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <p>Paste the email or text you got. Your agent checks whether it's an interview invite.</p>
        <textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “We'd like to invite you to interview for the Software Engineer Intern role at Microsoft…”"
          aria-label="Invite text"
        />
        {status && <p className={`modal-status ${status.tone}`}>{status.message}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="cta small" disabled={pending || !text.trim()}>{pending ? 'Checking…' : 'Check invite'}</button>
        </footer>
      </form>
    </div>
  );
}
