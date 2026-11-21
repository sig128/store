import type { Metadata } from "next";
import { listOutfits } from "@/server/catalog";
import { BuildTheFit } from "../_scenes/build-the-fit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lookbook — Build the fit",
  description: "Two complete fits from Drop 01. Tap a piece to shop it, or add the whole fit in one go.",
  alternates: { canonical: "/lookbook" },
};

export default async function Lookbook() {
  const outfits = await listOutfits();
  if (!outfits.length) {
    return (
      <section className="shell py-20">
        <h1 className="display text-[clamp(48px,7vw,96px)]">Lookbook</h1>
        <p className="mt-4 text-bone-dim">The lookbook is being shot. Check back soon.</p>
      </section>
    );
  }
  return <BuildTheFit outfits={outfits} headingLevel="h1" label="Lookbook" />;
}
