import type { Metadata } from "next";
import { unsubscribeAction } from "../actions";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <article className="shell max-w-2xl py-20">
      <p className="eyebrow">Drop emails</p>
      {sp.state === "done" ? (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">Unsubscribed</h1>
          <p className="mt-4 text-bone-dim">You won&apos;t get drop emails from us any more. Order emails still arrive for orders you place.</p>
        </>
      ) : sp.state === "invalid" || !sp.token ? (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">Link not valid</h1>
          <p className="mt-4 text-bone-dim">This link is incomplete. Reply to any drop email and we&apos;ll remove you by hand.</p>
        </>
      ) : (
        <>
          <h1 className="display mt-3 text-[clamp(44px,7vw,88px)]">Stop drop emails?</h1>
          <form action={unsubscribeAction} className="mt-8">
            <input type="hidden" name="token" value={sp.token} />
            <button type="submit" className="btn btn-primary">
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </article>
  );
}
