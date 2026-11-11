import { readGeminiConfig } from "./gemini";
import { readPayPalConfig } from "./paypal";

export interface ProviderStatus {
  supabase: boolean;
  gemini: boolean;
  paypal: boolean;
  webhook: boolean;
  worker: boolean;
}

export function providerStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus {
  const supabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
  const paypal = readPayPalConfig(env);
  return {
    supabase,
    gemini: Boolean(readGeminiConfig(env)),
    paypal: Boolean(paypal),
    webhook: Boolean(paypal?.webhookId),
    worker: Boolean(env.WORKER_SECRET),
  };
}

export function workspaceIdFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.TRIALPULSE_WORKSPACE_ID?.trim() || null;
}
