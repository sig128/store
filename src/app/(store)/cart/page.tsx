import type { Metadata } from "next";
import { CartPageClient } from "./client";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <div className="shell py-10 md:py-14">
      <h1 className="display text-[clamp(56px,8vw,112px)]">Your bag</h1>
      <CartPageClient />
    </div>
  );
}
