"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDemo } from "@/demo/context";

export default function DemoIndexPage() {
  const { ready, state } = useDemo();
  const router = useRouter();
  useEffect(() => {
    if (!ready || !state) return;
    if (state.role === "volunteer") router.replace("/demo/claims");
    else if (state.role === "finance") router.replace("/demo/finance");
    else router.replace("/demo/review");
  }, [ready, state, router]);
  return <p role="status">Opening the demo…</p>;
}
