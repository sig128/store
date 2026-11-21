"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block text-sm font-semibold">
        Email
        <input name="email" type="email" autoComplete="username" required className="a-input mt-1" />
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="a-input mt-1" />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="a-btn a-btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
