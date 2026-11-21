import { notFound } from "next/navigation";
import { loadPolicy } from "@/server/policies";
import { Prose } from "./prose";

/** Policy page body. Unreviewed pages always carry a visible draft notice. */
export async function PolicyPage({ slug, eyebrow, children }: { slug: string; eyebrow: string; children?: React.ReactNode }) {
  const p = await loadPolicy(slug);
  if (!p) notFound();
  return (
    <article className="shell py-14 md:py-20">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-[clamp(48px,7vw,96px)]">{p.title}</h1>
      {!p.reviewed ? (
        <p role="note" className="mt-6 max-w-[68ch] border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Draft — this page has not been reviewed yet and may change before the shop opens.
        </p>
      ) : null}
      {children}
      <div className="mt-8">
        <Prose source={p.body} />
      </div>
      <p className="mt-12 text-xs text-bone-mute">
        Version {p.version}
        {p.reviewedAt ? ` · reviewed ${p.reviewedAt.toLocaleDateString("en-GB", { dateStyle: "long" })}` : ""} · last updated {p.updatedAt.toLocaleDateString("en-GB", { dateStyle: "long" })}
      </p>
    </article>
  );
}

export function policyMetadata(title: string, description: string, path: string) {
  return { title, description, alternates: { canonical: path } };
}
