import type { MetadataRoute } from "next";
import { listProducts } from "@/server/catalog";
import { appUrl } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listProducts();
  const now = new Date();
  const pages = ["/", "/shop", "/lookbook", "/size-guide", "/shipping", "/returns", "/support", "/contact", "/terms", "/privacy"];
  return [
    ...pages.map((p) => ({ url: appUrl(p), lastModified: now, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.5 })),
    ...products.map((p) => ({ url: appUrl(`/products/${p.slug}`), lastModified: now, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
