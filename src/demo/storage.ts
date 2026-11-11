import type { DemoState } from "./types";

const KEY = "trialpulse.demo.v1";

export function loadDemoState(): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed.version !== 1 || parsed.seedLoaded !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDemoState(state: DemoState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearDemoState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
