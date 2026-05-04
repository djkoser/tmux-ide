import type { ReactElement, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Sidebar item data model
 *
 * AppSidebar consumes a SidebarItem[] tree rather than hand-rendering
 * sections. SidebarTree walks the tree, mapping each item onto the
 * existing SidebarMenu / SidebarMenuItem / SidebarMenuButton primitives.
 */

export type SidebarItem = SidebarLink | SidebarSeparator | SidebarSection;

export interface SidebarLink {
  id: string;
  type?: "link";
  title: string;
  /** Lucide icon component or pre-rendered React element */
  icon?: LucideIcon | ReactElement;
  /** When set, button renders as a Next.js Link */
  href?: string;
  /** Otherwise, button click handler */
  onClick?: () => void;
  isActive?: boolean;
  badge?: string | number;
  /** Subtitle line shown below the row when sidebar is expanded */
  subtitle?: ReactNode;
  tooltip?: string;
  /** Optional secondary action button (e.g. inject) */
  action?: SidebarAction;
  /** Disable interaction (still renders) */
  disabled?: boolean;
  /** Nested children for expandable items */
  children?: SidebarItem[];
  expanded?: boolean;
  onToggle?: () => void;
  testId?: string;
}

export interface SidebarAction {
  icon: LucideIcon | ReactElement;
  onClick: () => void;
  label: string;
  testId?: string;
  showOnHover?: boolean;
  disabled?: boolean;
}

export interface SidebarSeparator {
  id: string;
  type: "separator";
}

export interface SidebarSection {
  id: string;
  type: "section";
  /** Section header label (e.g. "sessions") */
  label: string;
  /** Optional icon next to the label */
  icon?: LucideIcon | ReactElement;
  items: SidebarItem[];
  /** Empty-state node rendered above the items when items.length === 0 */
  emptyState?: ReactNode;
  /** Loading-state node rendered above the items when loading is true */
  loadingState?: ReactNode;
  loading?: boolean;
  /** Error-state node rendered above the items when error is true */
  errorState?: ReactNode;
  error?: boolean;
}

export function isSidebarSeparator(item: SidebarItem): item is SidebarSeparator {
  return item.type === "separator";
}

export function isSidebarSection(item: SidebarItem): item is SidebarSection {
  return item.type === "section";
}

export function isSidebarLink(item: SidebarItem): item is SidebarLink {
  return item.type === undefined || item.type === "link";
}
