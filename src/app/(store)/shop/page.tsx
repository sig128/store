import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { listProducts } from "@/server/catalog";
import { ShopGrid } from "@/components/store/shop-grid";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Shop ${brand.dropName}`,
  description: "Six pieces for the last set of the night: tee, stringer, singlet, hoodie, shorts and jacket. Filter by category and size.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage() {
  const products = await listProducts();
  return (
    <section aria-labelledby="shop-h1" className="py-14 md:py-20">
      <div className="shell">
        <p className="eyebrow">{brand.dropCode} · {products.length} pieces</p>
        <h1 id="shop-h1" className="display mt-3 text-[clamp(56px,8vw,120px)]">
          {brand.dropName.split("—")[0]?.trim() ?? "Drop 01"}
        </h1>
        <p className="mt-4 max-w-xl text-bone-dim">Availability is live: a size is only offered when it can actually be shipped or made.</p>
        <div className="mt-10">
          <ShopGrid products={products} headingId="shop-h1" />
        </div>
      </div>
    </section>
  );
}
