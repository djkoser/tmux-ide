"use client";

import { useSyncExternalStore } from "react";

/**
 * Singleton open/close state for the AddProjectDialog. Lives in its own
 * module so any trigger — TopBar's ProjectSwitcher, a Cmd-N keybind, the
 * empty-state CTA — can pop the dialog without prop-drilling state through
 * the tree. Mirrors the shape of `useNavigation`, `wsBus`, etc.
 */

export type AddProjectTab = "open" | "init" | "clone";

interface DialogState {
  open: boolean;
  initialTab: AddProjectTab;
}

const INITIAL_STATE: DialogState = {
  open: false,
  initialTab: "open",
};

let state: DialogState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DialogState {
  return state;
}

export function openAddProjectDialog(initialTab: AddProjectTab = "open"): void {
  state = { open: true, initialTab };
  emit();
}

export function closeAddProjectDialog(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function setAddProjectDialogOpen(open: boolean): void {
  if (open) {
    if (!state.open) openAddProjectDialog(state.initialTab);
    return;
  }
  closeAddProjectDialog();
}

export function useAddProjectDialog(): DialogState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const __resetAddProjectDialogStoreForTests = (): void => {
  state = INITIAL_STATE;
  emit();
};
