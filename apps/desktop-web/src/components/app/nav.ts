import {
  AccessibilityIcon,
  HeartPulseIcon,
  SearchIcon,
  ShieldIcon,
  ShieldAlertIcon,
  RadarIcon,
  FileTextIcon,
  MailWarningIcon,
  BarChart3Icon,
  CircleAlertIcon,
  FilesIcon,
  EyeIcon,
  ImageIcon,
  SpellCheckIcon,
  FileStackIcon,
  ListChecksIcon,
  ClipboardCheckIcon,
  CalendarCheckIcon,
  CompassIcon,
  InboxIcon,
  MapIcon,
  PenSquareIcon,
  SettingsIcon,
  ActivityIcon,
  MegaphoneIcon,
  TrendingUpIcon,
  BotIcon,
  LightbulbIcon,
  MousePointerClickIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  type LucideIcon,
} from "lucide-react";

// exact: only the href itself is active (e.g. an overview whose sub-pages have their own items).
export type NavItem = { title: string; href: string; icon: LucideIcon; exact?: boolean };

// Modules group the sidebar into collapsible sections. Future business tools add a new module here.
// soon: shown next to the section name for modules that are only a placeholder so far.
export type ModuleKey = "marketing" | "accessibility" | "seo" | "security";

// key: the module's accent color (globals.css, [data-module]).
export const modules: { key: ModuleKey; label: string; soon?: boolean; items: NavItem[] }[] = [
  {
    key: "marketing",
    label: "Marketing",
    items: [
      { title: "Today", href: "/today", icon: CalendarCheckIcon },
      { title: "Inbox", href: "/inbox", icon: InboxIcon },
      { title: "Content Studio", href: "/content", icon: PenSquareIcon },
      { title: "Ads", href: "/ads", icon: MegaphoneIcon },
      { title: "Roadmap", href: "/roadmap", icon: MapIcon },
      { title: "Intel", href: "/intel", icon: CompassIcon },
      { title: "Analytics", href: "/analytics", icon: BarChart3Icon },
    ],
  },
  {
    key: "accessibility",
    label: "Accessibility",
    items: [
      { title: "Overview", href: "/accessibility", icon: AccessibilityIcon, exact: true },
      { title: "Issues", href: "/accessibility/issues", icon: CircleAlertIcon },
      { title: "Pages", href: "/accessibility/pages", icon: FilesIcon },
      { title: "Needs review", href: "/accessibility/review", icon: EyeIcon },
      { title: "Images", href: "/accessibility/images", icon: ImageIcon },
      { title: "Content", href: "/accessibility/content", icon: SpellCheckIcon },
      { title: "Documents", href: "/accessibility/documents", icon: FileStackIcon },
      { title: "By criterion", href: "/accessibility/compliance", icon: ListChecksIcon },
      { title: "Checklist", href: "/accessibility/checklist", icon: ClipboardCheckIcon },
      { title: "Reports", href: "/accessibility/reports", icon: FileTextIcon },
    ],
  },
  {
    key: "seo",
    label: "SEO & GEO",
    items: [
      { title: "Overview", href: "/seo", icon: SearchIcon, exact: true },
      { title: "Site health", href: "/seo/health", icon: HeartPulseIcon },
      { title: "Search", href: "/seo/search", icon: TrendingUpIcon },
      { title: "AI visibility", href: "/seo/ai", icon: BotIcon },
      { title: "Opportunities", href: "/seo/opportunities", icon: LightbulbIcon },
      { title: "Agents", href: "/seo/agents", icon: MousePointerClickIcon },
      { title: "Off-site", href: "/seo/offsite", icon: GlobeIcon },
    ],
  },
  {
    key: "security",
    label: "Security",
    items: [
      { title: "Overview", href: "/security", icon: ShieldIcon, exact: true },
      { title: "Findings", href: "/security/findings", icon: ShieldAlertIcon },
      { title: "Monitoring", href: "/security/monitoring", icon: RadarIcon },
      { title: "Report", href: "/security/report", icon: FileTextIcon },
      { title: "Disclosure", href: "/security/disclosure", icon: MailWarningIcon },
    ],
  },
];

// Above the modules: the app's home page, a summary of every module.
export const homeItems: NavItem[] = [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }];

export const footerItems: NavItem[] = [
  { title: "Settings", href: "/settings", icon: SettingsIcon },
  { title: "System", href: "/system", icon: ActivityIcon },
];
