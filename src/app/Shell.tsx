import { useState } from 'react';
import type { Speed } from './speed';
import { DEFAULT_TAB, VISIBLE_TABS, type TabId } from './tabs';

/** Journey shell: tab bar, global speed and global Reset. Every tab stays mounted so switching never loses a run. */
export function Shell() {
  const [active, setActive] = useState<TabId>(DEFAULT_TAB);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="shell">
      <nav className="topbar">
        <span className="brand"><span className="logo">◆</span>Hirearchy</span>
        <div className="tabs" role="tablist" aria-label="Your job hunt">
          {VISIBLE_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={t.id === active}
              aria-controls={`panel-${t.id}`}
              className={`tab ${t.id === active ? 'on' : ''}`}
              onClick={() => setActive(t.id)}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="corner">
          <div className="segmented" role="group" aria-label="Playback speed">
            {(['slow', 'normal', 'fast'] as Speed[]).map((s) => (
              <button key={s} className={s === speed ? 'on' : ''} aria-pressed={s === speed} onClick={() => setSpeed(s)}>{s}</button>
            ))}
          </div>
          <button className="icon-btn reset" onClick={() => setResetKey((k) => k + 1)} title="Reset demo" aria-label="Reset demo">↺</button>
        </div>
      </nav>
      <p className="journey-line">
        Find the job. Prep with your pipeline. Earn the referral. <b>Your agent negotiates; you decide.</b>
      </p>
      {VISIBLE_TABS.map(({ id, Component }) => (
        <section key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} className="tab-panel" hidden={id !== active}>
          <Component speed={speed} resetKey={resetKey} />
        </section>
      ))}
    </div>
  );
}
