import type { Metadata } from "next";
import Link from "next/link";
import { confirmSignupAction } from "../actions";

export const metadata: Metadata = { title: "Confirm drop emails", robots: { index: false } };

export default async function ConfirmSignup({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <article className="shell max-w-2xl py-20">
      <p className="eyebrow">Drop emails</p>
      {sp.state === "confirmed" ? (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">You&apos;re on the list.</h1>
          <p className="mt-4 text-bone-dim">We&apos;ll only email when a new drop or a restock goes live.</p>
          <Link href="/shop" className="btn btn-primary mt-8">
            Back to the drop
          </Link>
        </>
      ) : sp.state === "invalid" || !sp.token ? (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">Link not valid</h1>
          <p className="mt-4 text-bone-dim">This confirmation link is incomplete or has already been used. You can sign up again from the home page.</p>
          <Link href="/#locker-title" className="btn btn-ghost mt-8">
            Sign up again
          </Link>
        </>
      ) : (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">Confirm drop emails</h1>
          <p className="mt-4 text-bone-dim">One click and you&apos;ll hear when a new drop or restock goes live. Unsubscribe any time.</p>
          <form action={confirmSignupAction} className="mt-8">
            <input type="hidden" name="token" value={sp.token} />
            <button type="submit" className="btn btn-primary">
              Confirm
            </button>
          </form>
        </>
      )}
    </article>
  );
}
