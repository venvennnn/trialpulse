import type { Metadata } from "next";
import { VolunteersScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Volunteers" };

export default function VolunteersPage() {
  return <VolunteersScreen />;
}
