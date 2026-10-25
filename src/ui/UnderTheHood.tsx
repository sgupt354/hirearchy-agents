import type { AgentEvent, CoordinationState } from '../engine/types';
import { STATE_TEXT } from './copy';
import { Drawer } from './Drawer';
import { Graph } from './Graph';
import { Inspector } from './Inspector';
import { JudgeLegend } from './JudgeLegend';
import type { GraphView, Lens } from './view';

/** Judges' view: the network from Aditya's side and the live agent feed, in a right-side drawer. */
export function UnderTheHood({ open, onClose, state, events, ids, labels, label, view, names, lenses, onToggleLens }: {
  open: boolean;
  onClose: () => void;
  state: CoordinationState;
  events: AgentEvent[];
  ids: string[];
  labels: Record<string, string>;
  label: (id: string) => string;
  view: GraphView;
  names: Record<string, string>;
  lenses: Lens[];
  onToggleLens: (lens: Lens) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Under the hood"
      subtitle="What the agents are doing, live. Students never see this."
      badge={<span className={`state-pill state-${state}`}>{STATE_TEXT[state]}</span>}
    >
      <JudgeLegend active={lenses} onToggle={onToggleLens} />
      <div className="drawer-body">
        <section className="card graph-card">
          <h3>Network · Aditya's view</h3>
          <Graph ids={ids} labels={labels} view={view} names={names} />
        </section>
        <section className="card feed-card">
          <h3>Agent conversation</h3>
          <Inspector events={events} label={label} lenses={lenses} />
        </section>
      </div>
    </Drawer>
  );
}
