import { useSyncExternalStore } from 'react';
import { trust } from './network';

/** The shared trust network; re-renders the caller whenever it changes. */
export function useTrust() {
  useSyncExternalStore(trust.subscribe, trust.getVersion);
  return trust;
}
