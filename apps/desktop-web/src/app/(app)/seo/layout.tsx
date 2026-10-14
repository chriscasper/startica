import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/seo">) {
  return <ModuleScope module="seo">{children}</ModuleScope>;
}
