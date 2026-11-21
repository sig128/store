import { brand } from "@/config/brand";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{brand.name}</p>
      <h1 className="mt-2 text-3xl font-bold">Admin sign in</h1>
      <LoginForm />
      <p className="mt-6 text-xs text-neutral-500">Staff accounts only. Ask an owner for access.</p>
    </main>
  );
}
