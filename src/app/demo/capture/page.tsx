import type { Metadata } from "next";
import { CaptureScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "New claim" };

export default function CapturePage() {
  return <CaptureScreen />;
}
