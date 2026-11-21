"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "./ui";

export function Sidebar({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-0.5">
      {items.map((i) => (
        <NavLink key={i.href} href={i.href} active={i.href === "/admin" ? path === "/admin" : path.startsWith(i.href)}>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
