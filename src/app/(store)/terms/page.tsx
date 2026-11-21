import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = policyMetadata("Terms of sale", "Who you are buying from, prices, delivery, right of withdrawal and complaints.", "/terms");

export default function Page() {
  return <PolicyPage slug="terms" eyebrow="Legal" />;
}
