import Link from "next/link";
import { brand } from "@/config/brand";
import { requireAdmin } from "@/server/auth/session";
import { can } from "@/server/auth/rbac";
import { env } from "@/server/env";
import { Sidebar } from "@/components/admin/sidebar";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin("dashboard:read");
  const items = [
    { href: "/admin", label: "Dashboard", p: "dashboard:read" },
    { href: "/admin/orders", label: "Orders", p: "orders:read" },
    { href: "/admin/production", label: "Production sheet", p: "orders:fulfil" },
    { href: "/admin/products", label: "Products & stock", p: "products:write" },
    { href: "/admin/artwork", label: "Artwork & templates", p: "artwork:write" },
    { href: "/admin/reports", label: "Reports & exports", p: "reports:export" },
    { href: "/admin/jobs", label: "Jobs & emails", p: "jobs:retry" },
    { href: "/admin/readiness", label: "Launch readiness", p: "dashboard:read" },
    { href: "/admin/settings", label: "Settings", p: "settings:write" },
    { href: "/admin/policies", label: "Policy pages", p: "settings:write" },
    { href: "/admin/users", label: "Users", p: "users:manage" },
    { href: "/admin/audit", label: "Audit log", p: "audit:read" },
  ].filter((i) => can(a.role, i.p as Parameters<typeof can>[1]));
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[230px_1fr]">
      <aside className="no-print border-b border-[#ddd6c8] bg-[#ebe6db] p-4 lg:border-b-0 lg:border-r">
        <Link href="/admin" className="block px-3 pb-4">
          <span className="block font-display text-2xl font-black uppercase leading-none">{brand.shortName}</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Admin · {env().APP_ENV}</span>
        </Link>
        <Sidebar items={items.map(({ href, label }) => ({ href, label }))} />
        <div className="mt-6 border-t border-[#d3ccbe] px-3 pt-4 text-xs text-neutral-600">
          <p className="truncate font-semibold text-neutral-800">{a.email}</p>
          <p>Role: {a.role}</p>
          <form action={signOut} className="mt-3">
            <button className="a-btn w-full" type="submit">
              Sign out
            </button>
          </form>
          <Link href="/" className="mt-3 block underline">
            View store
          </Link>
        </div>
      </aside>
      <main id="main">{children}</main>
    </div>
  );
}
