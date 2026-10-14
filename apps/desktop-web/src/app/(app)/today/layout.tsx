import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/today">) {
  return <ModuleScope module="marketing">{children}</ModuleScope>;
}
