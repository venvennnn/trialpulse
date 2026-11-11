import type { Metadata } from "next";
import { ActivitiesScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Activities" };

export default function ActivitiesPage() {
  return <ActivitiesScreen />;
}
