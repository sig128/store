import { brand } from "@/config/brand";
import { listProducts } from "@/server/catalog";
import { appUrl, env } from "@/server/env";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (u: string) => (u.startsWith("http") ? u : appUrl(u));

/**
 * Optional Google Merchant-style product feed (RSS 2.0 + g: namespace), one item per
 * colour/size. Off unless enabled in Settings → Features. Availability is the same
 * live calculation the store uses. In production only products with a real product
 * photo are listed — concept renders are not product images.
 */
export async function GET() {
  const s = await getSettings();
  if (!s.features.productFeed) return new Response("Not found", { status: 404 });
  const prod = env().APP_ENV === "production";
  const products = await listProducts();
  const items: string[] = [];
  for (const p of products) {
    if (!p.purchasable) continue;
    for (const v of p.variants) {
      const photo = v.media.find((m) => m.source === "product_photo") ?? (prod ? null : v.media[0]);
      if (!photo) continue;
      for (const sku of v.skus) {
        const availability = sku.state === "in_stock" || sku.state === "made_to_order" ? "in_stock" : "out_of_stock";
        items.push(`<item>
  <g:id>${x(sku.code)}</g:id>
  <g:item_group_id>${x(v.code)}</g:item_group_id>
  <title>${x(`${brand.name} ${p.name} ${p.categoryLabel} — ${v.label} — ${sku.size}`)}</title>
  <description>${x(p.summary ?? p.categoryLabel)}</description>
  <link>${x(appUrl(`/products/${p.slug}?variant=${encodeURIComponent(v.code)}&size=${encodeURIComponent(sku.size)}`))}</link>
  <g:image_link>${x(abs(photo.url))}</g:image_link>
  <g:availability>${availability}</g:availability>
  <g:price>${(sku.priceMinor / 100).toFixed(2)} ${x(sku.currency)}</g:price>
  <g:brand>${x(brand.name)}</g:brand>
  <g:condition>new</g:condition>
  <g:color>${x(v.colorName)}</g:color>
  <g:size>${x(sku.size)}</g:size>
</item>`);
      }
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${x(brand.name)}</title>
<link>${x(appUrl("/"))}</link>
<description>${x(brand.tagline)}</description>
${items.join("\n")}
</channel>
</rss>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
