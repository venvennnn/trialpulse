"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
        const result = await supabase.auth.signInWithPassword({
          email: String(data.get("email") || ""),
          password: String(data.get("password") || ""),
        });
        setBusy(false);
        if (result.error) setError(result.error.message);
        else window.location.href = "/app";
      }}
    >
      <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
