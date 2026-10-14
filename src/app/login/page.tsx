"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result?.error?.message || "Something went wrong. Try again.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Could not connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span>digital<strong>shield</strong></span>
        </div>

        <h1 id="login-title">{mode === "sign-in" ? "Welcome back." : "Create your account."}</h1>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "sign-in" ? "Your password" : "At least 8 characters"}
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={busy}>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</span>
          </button>
        </form>

        <p className="login-switch">
          {mode === "sign-in" ? "No account?" : "Already have an account?"}
          {" "}
          <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }}>
            {mode === "sign-in" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}
