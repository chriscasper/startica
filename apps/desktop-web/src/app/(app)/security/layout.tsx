import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/security">) {
  return <ModuleScope module="security">{children}</ModuleScope>;
}
