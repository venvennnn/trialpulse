import type { Metadata } from "next";
import { PayoutScreen } from "@/components/demo/Screens";

export const metadata: Metadata = { title: "Payout confirmation" };

export default async function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayoutScreen payoutId={id} />;
}
