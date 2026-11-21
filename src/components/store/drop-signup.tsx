"use client";

import { useState, useTransition } from "react";
import { dropSignupAction } from "@/app/(store)/actions";

export function DropSignup() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await dropSignupAction({ email, consent });
          setMsg(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
        });
      }}
      className="space-y-3"
    >
      <label htmlFor="drop-email" className="label">
        Email
      </label>
      <div className="flex gap-2">
        <input id="drop-email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required aria-describedby="drop-msg" />
        <button type="submit" className="btn btn-primary shrink-0" disabled={pending}>
          {pending ? "…" : "Sign up"}
        </button>
      </div>
      <label className="flex items-start gap-3 text-sm text-bone-dim">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--bone)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Email me when a new drop or restock goes live. Unsubscribe any time.</span>
      </label>
      <p id="drop-msg" role="status" aria-live="polite" className={`min-h-5 text-sm ${msg ? (msg.ok ? "text-ok" : "text-error") : ""}`}>
        {msg?.text}
      </p>
    </form>
  );
}
