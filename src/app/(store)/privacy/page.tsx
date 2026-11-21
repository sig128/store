import type { Metadata } from "next";
import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = policyMetadata("Privacy", "What we collect when you order or sign up, why, and how long we keep it.", "/privacy");

export default function Page() {
  return <PolicyPage slug="privacy" eyebrow="Legal" />;
}
