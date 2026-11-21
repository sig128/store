import { brand } from "@/config/brand";
import type { ProductDetailView, ProductView } from "./catalog";
import { appUrl } from "./env";

const absolute = (u: string) => (u.startsWith("http") ? u : appUrl(u));

/**
 * Truthful Product structured data: real price, currency and per-SKU availability
 * from live stock. No ratings or reviews (we have none), no invented materials.
 */
export function productJsonLd(p: ProductDetailView | ProductView, url: string) {
  const offers = p.variants.flatMap((v) =>
    v.skus.map((s) => ({
      "@type": "Offer",
      sku: s.code,
      name: `${p.name} — ${v.label}, ${s.size}`,
      price: (s.priceMinor / 100).toFixed(2),
      priceCurrency: s.currency,
      availability: !p.purchasable
        ? "https://schema.org/PreOrder"
        : s.state === "in_stock"
          ? "https://schema.org/InStock"
          : s.state === "made_to_order"
            ? "https://schema.org/MadeToOrder"
            : "https://schema.org/OutOfStock",
      url: `${url}?variant=${v.code}`,
      itemCondition: "https://schema.org/NewCondition",
    })),
  );
  const images = p.variants.flatMap((v) => v.media.filter((m) => !m.kind.endsWith("_unlit")).map((m) => absolute(m.url)));
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: p.name,
    description: p.description ?? p.summary ?? undefined,
    url,
    brand: { "@type": "Brand", name: brand.name },
    productGroupID: p.slug,
    variesBy: ["https://schema.org/color", "https://schema.org/size"],
    image: [...new Set(images)].slice(0, 8),
    hasVariant: p.variants.flatMap((v) =>
      v.skus.map((s) => ({
        "@type": "Product",
        sku: s.code,
        name: `${p.name} — ${v.label}, ${s.size}`,
        color: v.label,
        size: s.size,
        image: v.media.filter((m) => !m.kind.endsWith("_unlit")).map((m) => absolute(m.url)).slice(0, 3),
        offers: offers.find((o) => o.sku === s.code),
      })),
    ),
  };
}
