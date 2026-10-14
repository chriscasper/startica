import { ModuleScope } from "@/components/app/module-scope";

export default function Layout({ children }: LayoutProps<"/inbox">) {
  return <ModuleScope module="marketing">{children}</ModuleScope>;
}
