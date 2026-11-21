import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { db } from "@/server/db";
import { getProductDetail, listOutfits } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { ratesFor } from "@/server/shipping";
import { buildCartView, findCart } from "@/server/cart";
import { getCartToken } from "@/server/http/session";
import { appUrl } from "@/server/env";
import { productJsonLd } from "@/server/seo";
import { ProductExperience } from "./purchase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductDetail(slug);
  if (!p) return { title: "Not found" };
  return {
    title: p.seoTitle ?? `${p.name} — ${p.categoryLabel}`,
    description: p.seoDescription ?? p.summary ?? undefined,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: {
      type: "website",
      title: `${p.name} — ${p.categoryLabel} · ${brand.name}`,
      description: p.summary ?? undefined,
      images: [{ url: `/og/${p.slug}.jpg`, width: 1200, height: 630, alt: `${p.name} ${p.categoryLabel} — concept render` }],
    },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const product = await getProductDetail(slug);
  if (!product) notFound();
  const s = await getSettings();
  const [rates, outfits] = await Promise.all([ratesFor(db(), s.store.market, product.fromPriceMinor, product.currency), listOutfits()]);

  let edit: { lineId: string; skuId: string; personalization: import("@/lib/types").PersonalizationInput | null } | null = null;
  if (typeof sp.edit === "string") {
    const cart = await buildCartView(db(), await findCart(db(), await getCartToken()), s);
    const line = cart.lines.find((l) => l.id === sp.edit && l.productId === product.id);
    if (line) edit = { lineId: line.id, skuId: line.skuId, personalization: line.personalization };
  }

  const wearWith = outfits.filter((o) => o.items.some((i) => i.product.id === product.id));
  const jsonLd = productJsonLd(product, appUrl(`/products/${product.slug}`));

  return (
    <div className="shell pb-24 pt-6 md:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-bone-dim">
        <ol className="flex flex-wrap gap-2">
          <li>
            <Link href="/shop" className="link">
              Drop 01
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>{product.categoryLabel}</li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-bone">
            {product.name}
          </li>
        </ol>
      </nav>
      <ProductExperience
        key={product.id}
        product={product}
        initialVariantCode={typeof sp.variant === "string" ? sp.variant : null}
        rates={rates}
        dispatchNote={s.support.dispatchNote}
        edit={edit}
      />
      {wearWith.length ? (
        <section aria-labelledby="wear-title" className="mt-24 border-t border-rule pt-10">
          <h2 id="wear-title" className="display text-[48px]">
            Wear it with
          </h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-2">
            {wearWith.map((o) => (
              <li key={o.id} className="border border-rule p-5">
                <p className="font-display text-3xl font-extrabold uppercase">{o.title}</p>
                <p className="mt-1 text-sm text-bone-dim">{o.items.map((i) => i.product.name).join(" · ")}</p>
                <Link href={`/lookbook#${o.slug}`} className="btn btn-ghost mt-4">
                  Build this fit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
