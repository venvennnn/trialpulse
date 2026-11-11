export type Cents = number;

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
}

export function assertCents(value: number): Cents {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError("INVALID_INPUT", "Amounts must be non-negative integer minor units.");
  }
  return value;
}

export function formatUsd(cents: Cents): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function centsToPayPalValue(cents: Cents): string {
  assertCents(cents);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

/** PayPal decimal strings cross the boundary as exact two-digit values. */
export function payPalValueToCents(value: string): Cents | null {
  if (!/^\d+\.\d{2}$/.test(value)) return null;
  const [whole, frac] = value.split(".");
  return Number(whole) * 100 + Number(frac);
}

export function parseUsdToCents(input: string): Cents | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}
