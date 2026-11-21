import { notFound } from "next/navigation";
import { env } from "@/server/env";
import { Lab } from "./lab";

export const dynamic = "force-dynamic";

/** Development-only view of the 3D rack stage, for tuning and frame capture. */
export default async function Rack3dLab({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (env().APP_ENV === "production") notFound();
  const sp = await searchParams;
  return <Lab index={Number(sp.i ?? 0)} t={Number(sp.t ?? 0.45)} quality={sp.q === "low" ? "low" : "high"} reduced={sp.rm === "1"} />;
}
