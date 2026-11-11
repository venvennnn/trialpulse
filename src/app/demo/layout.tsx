"use client";

import { DemoShell } from "@/components/shell/AppShell";
import { DemoProvider } from "@/demo/context";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <DemoShell>{children}</DemoShell>
    </DemoProvider>
  );
}
