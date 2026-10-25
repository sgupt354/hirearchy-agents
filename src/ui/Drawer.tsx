import type { ReactNode } from 'react';

/** Right-side drawer with a scrim, title, optional badge and close button. */
export function Drawer({ open, onClose, title, subtitle, badge, label, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  label?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-label={label ?? title} aria-hidden={!open}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {badge}
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {children}
      </aside>
    </>
  );
}
