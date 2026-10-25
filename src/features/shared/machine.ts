import { InvalidTransitionError } from '../../engine/stateMachine';

/** Explicit state machine for a feature's own states; rejects invalid transitions like the engine's. */
export function machine<S extends string>(table: Record<S, S[]>) {
  return (from: S, to: S): S => {
    if (!table[from].includes(to)) throw new InvalidTransitionError(`Invalid transition ${from} -> ${to}`);
    return to;
  };
}
