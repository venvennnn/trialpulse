import type { Metadata } from "next";
import { ReviewScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Coordinator Review Desk" };

export default function ReviewPage() {
  return <ReviewScreen />;
}
