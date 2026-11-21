import type { AdminRole } from "@/lib/types";

/** Role → permissions. Kept small and explicit; every admin mutation checks one of these. */
export type Permission =
  | "dashboard:read"
  | "orders:read"
  | "orders:fulfil"
  | "orders:edit"
  | "refunds:issue"
  | "returns:write"
  | "products:write"
  | "inventory:write"
  | "artwork:write"
  | "reports:export"
  | "jobs:retry"
  | "settings:write"
  | "users:manage"
  | "audit:read";

const ALL: Permission[] = [
  "dashboard:read",
  "orders:read",
  "orders:fulfil",
  "orders:edit",
  "refunds:issue",
  "returns:write",
  "products:write",
  "inventory:write",
  "artwork:write",
  "reports:export",
  "jobs:retry",
  "settings:write",
  "users:manage",
  "audit:read",
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "users:manage" && p !== "settings:write"),
  fulfillment: ["dashboard:read", "orders:read", "orders:fulfil", "returns:write", "inventory:write"],
  viewer: ["dashboard:read", "orders:read", "reports:export", "audit:read"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner — everything, including users and settings",
  manager: "Manager — catalogue, orders, refunds, reports",
  fulfillment: "Fulfilment — packing, shipping, returns, stock",
  viewer: "Viewer — read-only and bookkeeping exports",
};

export function can(role: string | null | undefined, p: Permission): boolean {
  return Boolean(role && (ROLE_PERMISSIONS[role as AdminRole] ?? []).includes(p));
}
