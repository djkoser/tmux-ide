"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  isSidebarLink,
  isSidebarSection,
  isSidebarSeparator,
  type SidebarItem,
  type SidebarLink,
  type SidebarSection,
} from "./sidebar-types";

interface SidebarTreeProps {
  items: SidebarItem[];
}

/**
 * Generic walker that renders a tree of SidebarItem objects using the
 * existing Sidebar primitives. Sections become SidebarGroup, links become
 * SidebarMenuItem rows, and nested children become SidebarMenuSub rows.
 */
export function SidebarTree({ items }: SidebarTreeProps) {
  return (
    <>
      {items.map((item) => {
        if (isSidebarSeparator(item)) return null;
        if (isSidebarSection(item)) return <SidebarSectionView key={item.id} section={item} />;
        return (
          <SidebarGroup key={item.id}>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLinkRow item={item} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function SidebarSectionView({ section }: { section: SidebarSection }) {
  const showEmpty =
    !section.loading && !section.error && section.items.length === 0 && section.emptyState;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {renderIcon(section.icon, 11)}
        {section.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {section.error && section.errorState ? section.errorState : null}
        {section.loading && section.loadingState ? section.loadingState : null}
        {showEmpty ? section.emptyState : null}
        <SidebarMenu>
          {section.items.map((child) => {
            if (isSidebarSeparator(child)) {
              return (
                <li
                  key={child.id}
                  data-slot="sidebar-tree-separator"
                  className="my-1 h-px bg-[var(--sidebar-border)]"
                  aria-hidden="true"
                />
              );
            }
            if (isSidebarSection(child)) {
              // Nested sections fall back to a flat group below the parent menu.
              return (
                <li key={child.id} data-slot="sidebar-tree-nested-section">
                  <SidebarSectionView section={child} />
                </li>
              );
            }
            return <SidebarLinkRow key={child.id} item={child} />;
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarLinkRow({ item }: { item: SidebarLink }) {
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const expanded = item.expanded ?? false;

  return (
    <SidebarMenuItem>
      {item.href ? (
        <SidebarMenuButton
          render={
            <Link
              href={item.href}
              onClick={(event) => {
                if (item.disabled) {
                  event.preventDefault();
                  return;
                }
                item.onClick?.();
              }}
              aria-disabled={item.disabled || undefined}
            />
          }
          isActive={Boolean(item.isActive)}
          tooltip={item.tooltip ?? item.title}
          disabled={item.disabled}
          data-testid={item.testId}
        >
          {renderIcon(item.icon)}
          <span>{item.title}</span>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          type="button"
          isActive={Boolean(item.isActive)}
          tooltip={item.tooltip ?? item.title}
          disabled={item.disabled}
          onClick={() => {
            if (hasChildren && !item.onClick) {
              item.onToggle?.();
              return;
            }
            item.onClick?.();
          }}
          data-testid={item.testId}
        >
          {renderIcon(item.icon)}
          <span>{item.title}</span>
        </SidebarMenuButton>
      )}

      {item.badge !== undefined && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}

      {item.action && (
        <SidebarMenuAction
          type="button"
          onClick={item.action.onClick}
          disabled={item.action.disabled}
          showOnHover={item.action.showOnHover}
          aria-label={item.action.label}
          title={item.action.label}
          data-testid={item.action.testId}
        >
          {renderIcon(item.action.icon, 13)}
        </SidebarMenuAction>
      )}

      {item.subtitle ? (
        <div className="ml-8 mt-0.5 truncate text-[10px] text-[var(--dim)] group-data-[collapsible=icon]:hidden">
          {item.subtitle}
        </div>
      ) : null}

      {hasChildren && expanded && (
        <SidebarMenuSub>
          {item.children!.map((child) => {
            if (!isSidebarLink(child)) return null;
            return (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton
                  render={
                    child.href ? (
                      <Link
                        href={child.href}
                        onClick={(event) => {
                          if (child.disabled) {
                            event.preventDefault();
                            return;
                          }
                          child.onClick?.();
                        }}
                      />
                    ) : undefined
                  }
                  isActive={Boolean(child.isActive)}
                  data-testid={child.testId}
                >
                  {renderIcon(child.icon)}
                  <span>{child.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

function renderIcon(icon: ReactElement | LucideIcon | undefined, size?: number): ReactNode {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  const IconComponent = icon as LucideIcon;
  if (size !== undefined) return <IconComponent aria-hidden="true" size={size} />;
  return <IconComponent aria-hidden="true" />;
}
