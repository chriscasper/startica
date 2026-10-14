"use client";

import { useEffect, type ReactNode } from "react";
import type { ModuleKey } from "./nav";

/**
 * Gives a module's pages its accent color (globals.css). The wrapper colors the page as
 * it's rendered; the attribute on <html> reaches dialogs and menus, which render outside it.
 */
export function ModuleScope({ module, children }: { module: ModuleKey; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.module = module;
    return () => {
      if (root.dataset.module === module) delete root.dataset.module;
    };
  }, [module]);
  return (
    <div data-module={module} className="contents">
      {children}
    </div>
  );
}
