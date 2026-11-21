import Link from "next/link";
import { formatMoney } from "@/lib/money";

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px]">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-neutral-600">{subtitle}</div> : null}
        </div>
        {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  if (!msg && !err) return null;
  return (
    <p role={err ? "alert" : "status"} className={`no-print mb-5 rounded border px-4 py-3 text-sm ${err ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
      {err ?? msg}
    </p>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-200",
  amber: "bg-amber-100 text-amber-900 border-amber-200",
  red: "bg-red-100 text-red-900 border-red-200",
  blue: "bg-sky-100 text-sky-900 border-sky-200",
  grey: "bg-neutral-100 text-neutral-700 border-neutral-200",
  dark: "bg-neutral-800 text-white border-neutral-800",
};

export function Badge({ tone = "grey", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`a-badge ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: "green",
  unpaid: "amber",
  processing: "blue",
  failed: "red",
  expired: "grey",
  cancelled: "grey",
  unfulfilled: "amber",
  in_production: "blue",
  packed: "blue",
  shipped: "green",
  delivered: "green",
  none: "grey",
  open: "amber",
  closed: "grey",
  pending: "amber",
  partially_refunded: "blue",
  refunded: "dark",
  needs_review: "red",
  clear: "grey",
  succeeded: "green",
  dead: "red",
  running: "blue",
  sent: "green",
  sending: "amber",
  draft: "amber",
  approved: "green",
  sample: "amber",
  requested: "amber",
  received: "blue",
  rejected: "grey",
  confirmed: "green",
  not_connected: "grey",
  submitted: "blue",
  mismatch: "red",
  duplicate: "red",
  superseded: "grey",
  creating: "amber",
};

export function Status({ value }: { value: string }) {
  return <Badge tone={STATUS_TONE[value] ?? "grey"}>{value.replace(/_/g, " ")}</Badge>;
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  return <span className="tabular-nums">{formatMoney(minor, currency)}</span>;
}

export function Card({ title, children, actions, id }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="a-card p-5">
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-bold uppercase tracking-[0.06em]">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link href={href} className={`block rounded px-3 py-1.5 text-sm ${active ? "bg-neutral-900 font-semibold text-white" : "text-neutral-700 hover:bg-neutral-200"}`}>
      {children}
    </Link>
  );
}

export const dt = (d: Date | null | undefined) => (d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
