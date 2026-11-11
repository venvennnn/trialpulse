import type { Metadata } from "next";
import { ClaimDetailScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Claim status" };

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClaimDetailScreen id={id} />;
}
