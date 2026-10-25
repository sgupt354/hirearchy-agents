// Cross-tab navigation: a feature asks the shell to open another tab (e.g. Find offers the prep circle).
export const OPEN_TAB = 'hirearchy:open-tab';

export function openTab(id: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_TAB, { detail: id }));
}
