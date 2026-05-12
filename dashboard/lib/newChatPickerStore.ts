"use client";

import { useSyncExternalStore } from "react";

interface NewChatPickerState {
  open: boolean;
  defaultSessionName: string | null;
}

const INITIAL_STATE: NewChatPickerState = {
  open: false,
  defaultSessionName: null,
};

let state: NewChatPickerState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): NewChatPickerState {
  return state;
}

export function openNewChatPicker(defaultSessionName: string | null): void {
  state = { open: true, defaultSessionName };
  emit();
}

export function closeNewChatPicker(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function setNewChatPickerOpen(open: boolean): void {
  if (open) {
    openNewChatPicker(state.defaultSessionName);
    return;
  }
  closeNewChatPicker();
}

export function useNewChatPicker(): NewChatPickerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getNewChatPickerStateForTests(): NewChatPickerState {
  return state;
}

export const __resetNewChatPickerStoreForTests = (): void => {
  state = INITIAL_STATE;
  emit();
};
