import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/intel">) {
  return <ModuleScope module="marketing">{children}</ModuleScope>;
}
