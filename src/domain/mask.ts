export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 1)}••••@${domain}`;
}

export function maskReference(value: string): string {
  if (value.length <= 2) return "••";
  return `${value.slice(0, 1)}•••${value.slice(-1)}`;
}
