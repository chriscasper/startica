import { Suspense } from "react";
import { redirect } from "next/navigation";
import { setupFlags } from "@startica/core/setup/status";
import { AppSidebar } from "@/components/app/app-sidebar";
import { DemoBanner } from "@/components/app/demo-banner";
import { ProductSwitcher } from "@/components/app/product-switcher";
import { BackgroundActivity } from "@/components/app/background-activity";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveProduct, getProducts } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

async function HeaderControls() {
  const [products, active] = await Promise.all([getProducts(), getActiveProduct()]);
  return (
    <>
      <ProductSwitcher products={products} activeId={active?.id ?? null} />
      <BackgroundActivity productId={active?.id ?? null} />
    </>
  );
}

/** A fresh install (no product, welcome not finished or skipped) starts in the welcome wizard. */
async function SetupGate() {
  // Products first: that marks the render as request-time (connection()), so a build's
  // prerender stops here instead of reading the database it doesn't have.
  const products = await getProducts();
  const flags = await setupFlags();
  if (products.length === 0 && !flags.welcomeDone) redirect("/welcome");
  return null;
}

async function Demo() {
  await getProducts(); // request time: the mode comes from the running app, not the build
  return desktopApp().demo ? <DemoBanner /> : null;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <SetupGate />
      </Suspense>
      <AppSidebar />
      <SidebarInset>
        <Suspense fallback={null}>
          <Demo />
        </Suspense>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Suspense fallback={<Skeleton className="h-8 w-40" />}>
            <HeaderControls />
          </Suspense>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
