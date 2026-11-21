import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";
import { readinessChecks, type Check } from "@/server/readiness";
import { env } from "@/server/env";
import { Badge, Card, Page } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const AREAS: Record<Check["area"], string> = { business: "Business identity", legal: "Legal & tax", payments: "Payments", operations: "Operations", catalog: "Catalogue" };

export default async function Readiness() {
  await requireAdmin("dashboard:read");
  const checks = await readinessChecks();
  const blocking = checks.filter((c) => c.required && !c.ok);
  const warnings = checks.filter((c) => !c.required && !c.ok);
  const prod = env().APP_ENV === "production";
  return (
    <Page title="Launch readiness" subtitle="Production checkout opens only when every required item passes. Nothing on this page can be bypassed from the storefront.">
      <div className={`a-card mb-6 p-5 ${blocking.length ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
        <p className="text-lg font-semibold">
          {blocking.length ? `${blocking.length} required item(s) missing — production checkout is closed.` : "All required items pass — production checkout can open."}
        </p>
        <p className="text-sm text-neutral-700">
          Environment: <strong>{env().APP_ENV}</strong>. {prod ? "This gate is enforced on every checkout request." : "Outside production the gate is reported but not enforced, so you can test end to end with the simulator or provider sandboxes."}
          {warnings.length ? ` ${warnings.length} recommendation(s) below.` : ""}
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {(Object.keys(AREAS) as Check["area"][]).map((area) => {
          const list = checks.filter((c) => c.area === area);
          if (!list.length) return null;
          return (
            <Card key={area} title={AREAS[area]}>
              <ul className="divide-y divide-neutral-200">
                {list.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-3">
                    <span aria-hidden className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-emerald-600 text-white" : c.required ? "bg-red-600 text-white" : "bg-amber-400 text-black"}`}>
                      {c.ok ? "✓" : c.required ? "!" : "–"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {c.label} {c.ok ? <span className="sr-only">passes</span> : c.required ? <Badge tone="red">required</Badge> : <Badge tone="amber">recommended</Badge>}
                      </p>
                      <p className="text-sm text-neutral-600">{c.detail}</p>
                      {!c.ok && !c.fix.startsWith("/") ? <p className="mt-1 font-mono text-xs text-neutral-500">How: {c.fix}</p> : null}
                    </div>
                    {!c.ok && c.fix.startsWith("/") ? (
                      <Link className="a-btn shrink-0" href={c.fix}>
                        Fix
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
