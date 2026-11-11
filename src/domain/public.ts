import type { Payout, PublicPayout } from "./types";
import { toPublicPayout } from "./payouts";

export function redactPayout(payout: Payout, mode: PublicPayout["modeLabel"]): PublicPayout {
  const pub = toPublicPayout(payout, mode);
  const serialized = JSON.stringify(pub);
  if (serialized.includes(payout.recipientEmail)) {
    throw new Error("Public payout leaked the recipient email.");
  }
  return pub;
}
