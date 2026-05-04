"use client";

/**
 * SidebarTree — data-driven sidebar walker
 *
 * Adapted from craft-agents-oss (Apache License 2.0).
 * Copyright 2026 Craft Docs Ltd. — https://craft.do
 * Modifications by tmux-ide contributors.
 *
 * Renders a tree of SidebarItem objects with:
 * - Section headers (loading/error/empty/items)
 * - Expandable items with AnimatePresence height animation
 * - Separator dividers
 * - Stagger animation on item entry/exit (motion springs)
 * - Vertical guide line for nested items (4px left of icon center)
 *
 * Built on top of the existing Sidebar / SidebarMenu / SidebarMenuButton
 * primitives so AppSidebar's drawer behavior, mobile layout, and tooltip
 * machinery still work unchanged.
 */

import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "motion/react";
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
} from "@/components/ui/sidebar";
import {
  isSidebarSection,
  isSidebarSeparator,
  type SidebarItem,
  type SidebarLink,
  type SidebarSection,
} from "./sidebar-types";

interface SidebarTreeProps {
  items: SidebarItem[];
  /** Internal: render with stagger as a nested tree (used recursively). */
  nested?: boolean;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.025, delayChildren: 0.01 },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.015, staggerDirection: -1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.15, ease: "easeOut" } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.1, ease: "easeIn" } },
};

export function SidebarTree({ items, nested }: SidebarTreeProps) {
  if (nested) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative grid gap-0.5 pl-5"
      >
        {/* Vertical guide line, 4px left of icon center, fading top/bottom. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[13px] top-1 bottom-1 w-px bg-[var(--border-weak)]"
        />
        <SidebarMenu>
          {items.map((item) => {
            if (isSidebarSeparator(item)) {
              return (
                <li
                  key={item.id}
                  className="my-1 h-px bg-[var(--sidebar-border)]"
                  aria-hidden="true"
                />
              );
            }
            if (isSidebarSection(item)) {
              return (
                <li key={item.id}>
                  <SidebarSectionView section={item} />
                </li>
              );
            }
            return (
              <motion.div key={item.id} variants={itemVariants}>
                <SidebarLinkRow item={item} />
              </motion.div>
            );
          })}
        </SidebarMenu>
      </motion.div>
    );
  }

  return (
    <>
      {items.map((item) => {
        if (isSidebarSeparator(item)) return <SidebarSeparatorView key={item.id} />;
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

function SidebarSeparatorView() {
  return (
    <div className="my-1 px-2" aria-hidden="true">
      <div className="h-px bg-[var(--border-weak)]" />
    </div>
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
          <AnimatePresence initial={false}>
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
                return (
                  <li key={child.id} data-slot="sidebar-tree-nested-section">
                    <SidebarSectionView section={child} />
                  </li>
                );
              }
              return <SidebarLinkRow key={child.id} item={child} />;
            })}
          </AnimatePresence>
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

      {hasChildren && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 2, marginBottom: 4 }}
              exit={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden group-data-[collapsible=icon]:hidden"
            >
              <SidebarTree items={item.children!} nested />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </SidebarMenuItem>
  );
}

function renderIcon(
  icon: ReactElement | LucideIcon | undefined,
  size?: number,
): ReactNode {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  const IconComponent = icon as LucideIcon;
  if (size !== undefined) return <IconComponent aria-hidden="true" size={size} />;
  return <IconComponent aria-hidden="true" />;
}

