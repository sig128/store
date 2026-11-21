import type { Metadata } from "next";
import Link from "next/link";
import { getProductDetail, listProducts } from "@/server/catalog";
import { SizeTable } from "@/components/store/size-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Size & fit guide",
  description: "Garment measurements for every piece, laid flat, in centimetres or inches — and how to compare them with a piece you already own.",
  alternates: { canonical: "/size-guide" },
};

export default async function SizeGuide() {
  const list = await listProducts();
  const details = (await Promise.all(list.map((p) => getProductDetail(p.slug)))).filter((d): d is NonNullable<typeof d> => Boolean(d));
  return (
    <article className="shell py-14 md:py-20">
      <p className="eyebrow">Locker 01</p>
      <h1 className="display mt-3 text-[clamp(52px,8vw,112px)]">Size &amp; fit</h1>
      <div className="mt-6 grid max-w-4xl gap-6 text-bone-dim md:grid-cols-2">
        <p>
          <strong className="text-bone">Measure a piece you already like.</strong> Lay it flat, smooth it out, and measure straight across the chest just below the armholes and from the highest point of the shoulder to the hem. Compare those numbers with the tables below.
        </p>
        <p>
          <strong className="text-bone">These are garment measurements, not body measurements.</strong> A garment measured flat is half its circumference. Each table says how its numbers were taken; where a tolerance is listed, finished garments can vary by that much.
        </p>
      </div>
      <nav aria-label="Pieces" className="mt-10 flex flex-wrap gap-2">
        {details.map((d) => (
          <a key={d.slug} href={`#size-${d.slug}`} className="chip">
            {d.name}
          </a>
        ))}
      </nav>
      <div className="mt-12 space-y-16">
        {details.map((d) => (
          <section key={d.slug} id={`size-${d.slug}`} aria-labelledby={`size-${d.slug}-h`} className="scroll-mt-[calc(var(--header-h)+16px)] border-t border-rule-strong pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={`size-${d.slug}-h`} className="font-display text-[40px] font-extrabold uppercase leading-none">
                {d.name} <span className="text-bone-mute">— {d.categoryLabel}</span>
              </h2>
              <Link href={`/products/${d.slug}`} className="link text-sm">
                Shop {d.name}
              </Link>
            </div>
            {d.fitNote ? <p className="mt-3 max-w-2xl text-bone-dim">{d.fitNote}</p> : null}
            <div className="mt-5">
              {d.sizeChart.length ? (
                d.sizeChart.map((c, i) => <SizeTable key={i} chart={c} idPrefix={`sg-${d.slug}-${i}`} />)
              ) : (
                <p className="text-bone-dim">Measurements will be published once production samples have been measured. Until then, ask us before ordering if you are between sizes.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
