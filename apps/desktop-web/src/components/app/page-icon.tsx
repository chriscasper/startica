"use client";

import { usePathname } from "next/navigation";
import { footerItems, homeItems, modules, type NavItem } from "./nav";

const items: NavItem[] = [...homeItems, ...modules.flatMap((m) => m.items), ...footerItems];

/** The sidebar item a path belongs to: the longest href that is the path or a parent of it. */
function itemFor(pathname: string): NavItem | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export const pageIconChip = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--module-soft) text-(--module)";

/** The current page's sidebar icon on a chip in its module's color (neutral outside a module). */
export function PageIcon() {
  const Icon = itemFor(usePathname())?.icon;
  return (
    <span className={pageIconChip} aria-hidden>
      {Icon && <Icon className="size-5" />}
    </span>
  );
}
