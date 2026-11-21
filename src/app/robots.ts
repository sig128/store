import type { MetadataRoute } from "next";
import { appUrl, env } from "@/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Never let a development or staging build get indexed.
  if (env().APP_ENV !== "production") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/cart", "/checkout", "/o/", "/orders/", "/signup/", "/dev/", "/media/uploads/"] }],
    sitemap: appUrl("/sitemap.xml"),
  };
}
