import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/accessibility">) {
  return <ModuleScope module="accessibility">{children}</ModuleScope>;
}
