import type { Metadata } from "next";
import { FinanceScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Finance confirmation" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ claim?: string }> }) {
  const params = await searchParams;
  return <FinanceScreen claimId={params.claim} />;
}
