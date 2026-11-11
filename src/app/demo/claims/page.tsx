import type { Metadata } from "next";
import { ClaimsScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "My claims" };

export default function ClaimsPage() {
  return <ClaimsScreen />;
}
