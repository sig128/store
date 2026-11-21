"use client";

import { useState, useTransition } from "react";
import { orderLinkAction } from "@/app/(store)/actions";

export function OrderLinkForm() {
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await orderLinkAction({ email, number });
          setMsg(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
        });
      }}
    >
      <div>
        <label htmlFor="ol-email" className="label">
          Email used at checkout
        </label>
        <input id="ol-email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="ol-number" className="label">
          Order number
        </label>
        <input id="ol-number" className="field mono uppercase" placeholder="AHA-10001" value={number} onChange={(e) => setNumber(e.target.value)} required autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Email me a secure link"}
      </button>
      <p role="status" aria-live="polite" className={`min-h-5 text-sm ${msg ? (msg.ok ? "text-ok" : "text-error") : ""}`}>
        {msg?.text}
      </p>
    </form>
  );
}
