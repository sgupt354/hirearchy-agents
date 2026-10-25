import { useEffect, useState } from 'react';
import { OPEN_TAB } from './navigate';
import { Icon, Mark } from '../ui/Icon';
import type { Speed } from './speed';
import { DEFAULT_TAB, VISIBLE_TABS, type TabId } from './tabs';

/** Journey shell: tab bar, global speed and global Reset. Every tab stays mounted so switching never loses a run. */
export function Shell() {
  const [active, setActive] = useState<TabId>(DEFAULT_TAB);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [resetKey, setResetKey] = useState(0);
  // Tabs with a live version (Find) start on their seeded demo; the switch shows the live one instead.
  const [live, setLive] = useState<Partial<Record<TabId, boolean>>>({});
  const activeDef = VISIBLE_TABS.find((t) => t.id === active);

  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (VISIBLE_TABS.some((t) => t.id === id)) setActive(id as TabId);
    };
    window.addEventListener(OPEN_TAB, open);
    return () => window.removeEventListener(OPEN_TAB, open);
  }, []);

  return (
    <div className="shell">
      <nav className="topbar">
        <a className="brand" href="/" aria-label="Hirearchy home"><Mark size={24} />Hirearchy</a>
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
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>
        <div className="corner">
          {activeDef?.Live && (
            <button
              role="switch"
              aria-checked={Boolean(live[active])}
              className={`live-switch ${live[active] ? 'on' : ''}`}
              onClick={() => setLive((l) => ({ ...l, [active]: !l[active] }))}
            >
              <span className="knob" aria-hidden /> Live search
            </button>
          )}
          <div className="segmented" role="group" aria-label="Playback speed">
            {(['slow', 'normal', 'fast'] as Speed[]).map((s) => (
              <button key={s} className={s === speed ? 'on' : ''} aria-pressed={s === speed} onClick={() => setSpeed(s)}>{s}</button>
            ))}
          </div>
          <button className="icon-btn reset" onClick={() => {
            setLive({});
            setResetKey((k) => k + 1);
          }} title="Reset" aria-label="Reset"><Icon name="reset" size={16} /></button>
        </div>
      </nav>
      {VISIBLE_TABS.map(({ id, Component, Live }) => (
        <section key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} className="tab-panel" hidden={id !== active}>
          {/* Both stay mounted so switching keeps each one's state. */}
          <div className="tab-view" hidden={Boolean(Live && live[id])}><Component speed={speed} resetKey={resetKey} /></div>
          {Live && <div className="tab-view" hidden={!live[id]}><Live speed={speed} resetKey={resetKey} /></div>}
        </section>
      ))}
    </div>
  );
}
