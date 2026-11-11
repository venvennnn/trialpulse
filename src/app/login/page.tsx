import type { Metadata } from "next";
import { providerStatus } from "@/server/config";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const ready = providerStatus().supabase;
  return (
    <main className="home">
      <h1>Sign in</h1>
      {ready ? <LoginForm /> : <p>Supabase Auth is not configured. The public demo at /demo does not need an account.</p>}
    </main>
  );
}
