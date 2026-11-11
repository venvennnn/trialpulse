"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { freshSeed } from "./logic";
import { clearDemoState, loadDemoState, saveDemoState } from "./storage";
import type { DemoState } from "./types";

interface DemoApi {
  ready: boolean;
  state: DemoState | null;
  busy: boolean;
  run: (mutator: (state: DemoState) => DemoState) => Promise<DemoState | null>;
  reset: () => void;
  replace: (state: DemoState) => void;
}

const DemoContext = createContext<DemoApi | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<DemoState | null>(null);

  useEffect(() => {
    const stored = loadDemoState();
    const next = stored ?? freshSeed();
    if (!stored) saveDemoState(next);
    ref.current = next;
    setState(next);
    setReady(true);
  }, []);

  const replace = useCallback((next: DemoState) => {
    ref.current = next;
    saveDemoState(next);
    setState(next);
  }, []);

  const run = useCallback(async (mutator: (current: DemoState) => DemoState) => {
    const current = ref.current;
    if (!current) return null;
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const next = mutator(ref.current ?? current);
    ref.current = next;
    saveDemoState(next);
    setState(next);
    setBusy(false);
    return next;
  }, []);

  const reset = useCallback(() => {
    clearDemoState();
    const next = freshSeed();
    replace(next);
  }, [replace]);

  return <DemoContext.Provider value={{ ready, state, busy, run, reset, replace }}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoApi {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider is missing");
  return value;
}
