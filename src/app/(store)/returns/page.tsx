import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = policyMetadata("Returns", "How to return or exchange an order, and how refunds work.", "/returns");

export default function Page() {
  return <PolicyPage slug="returns" eyebrow="Help" />;
}
