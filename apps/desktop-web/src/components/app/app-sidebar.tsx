"use client";

import { Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { StarticaLogo, StarticaMark } from "@startica/brand/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { footerItems, homeItems, modules, type NavItem } from "./nav";

const isActive = (item: NavItem, pathname: string) =>
  pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));

// Inside a module's group: icons in the module's accent, and the current page tinted with it.
// The label stays in the sidebar's text color, which reads well on the tint.
const accented = "[&_svg]:text-(--module) data-active:bg-(--module-soft) data-active:text-sidebar-foreground";

function NavButton({ item, active, accent }: { item: NavItem; active: boolean; accent: boolean }) {
  return (
    <SidebarMenuButton isActive={active} tooltip={item.title} className={accent ? accented : undefined} render={<Link href={item.href} />}>
      <item.icon />
      <span>{item.title}</span>
    </SidebarMenuButton>
  );
}

/** Reads the current path for the highlight; kept to a leaf so routes with dynamic params can still prerender. */
function ActiveNavButton({ item, accent }: { item: NavItem; accent: boolean }) {
  return <NavButton item={item} active={isActive(item, usePathname())} accent={accent} />;
}

function NavLinks({ items, accent = false }: { items: NavItem[]; accent?: boolean }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <Suspense fallback={<NavButton item={item} active={false} accent={accent} />}>
            <ActiveNavButton item={item} accent={accent} />
          </Suspense>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

// Which module sections the user collapsed: a per-device convenience, kept in localStorage.
const STORAGE_KEY = "startica.sidebar.collapsed";
const listeners = new Set<() => void>();

function readCollapsed(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function setCollapsed(label: string, collapsed: boolean) {
  const current = new Set<string>(JSON.parse(readCollapsed()) as string[]);
  if (collapsed) current.add(label);
  else current.delete(label);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
  } catch {
    // storage unavailable: the section still toggles until the next reload
  }
  for (const notify of listeners) notify();
}

function useCollapsedModules(): Set<string> {
  const raw = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    readCollapsed,
    () => "[]", // server render: every section open
  );
  return new Set(JSON.parse(raw) as string[]);
}

export function AppSidebar() {
  const collapsed = useCollapsedModules();
  // In icon-only mode the section labels are hidden, so every section stays open.
  const iconOnly = useSidebar().state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <StarticaMark title={null} className="size-5!" />
              </div>
              {/* "!" beats the menu button's [&_svg]:size-4, which would squash the wordmark to 16 × 16. */}
              <div className="flex flex-col gap-1">
                <StarticaLogo className="h-4! w-auto!" />
                <span className="flex items-center gap-1 text-[10px] leading-none text-sidebar-foreground/60 tabular-nums">
                  v{process.env.NEXT_PUBLIC_STARTICA_VERSION}
                  <span className="rounded-full border border-amber-500/45 bg-amber-500/12 px-1 py-px text-[9px] font-semibold text-amber-700 dark:text-amber-400">Beta</span>
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <NavLinks items={homeItems} />
          </SidebarGroupContent>
        </SidebarGroup>
        {modules.map((module) => {
          const open = iconOnly || !collapsed.has(module.label);
          return (
            <Collapsible key={module.label} open={open} onOpenChange={(next) => setCollapsed(module.label, !next)}>
              <SidebarGroup data-module={module.key}>
                <SidebarGroupLabel
                  render={<CollapsibleTrigger />}
                  className="w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <span className="mr-2 size-2 shrink-0 rounded-full bg-(--module)" aria-hidden />
                  {module.label}
                  {module.soon && <span className="ml-2 rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-accent-foreground">Coming soon</span>}
                  <ChevronRightIcon className={`ml-auto transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden />
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <NavLinks items={module.items} accent />
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <NavLinks items={footerItems} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
