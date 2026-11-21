"use client";

import { useSyncExternalStore } from "react";

const KEY = "action-tokens.sidebar-collapsed";
const EVENT = "actiontokens-flag-change";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** A saved on/off setting; `fallback` when nothing is saved or storage is blocked. */
export function readFlag(storage: Storage, key: string, fallback = false) {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function saveFlag(storage: Storage, key: string, on: boolean) {
  try {
    storage.setItem(key, on ? "1" : "0");
  } catch {
    // Private mode: it still changes for this page.
  }
}

/** Whether the sidebar was folded; open when nothing is saved or storage is blocked. */
export const readCollapsed = (storage: Storage) => readFlag(storage, KEY);
export const saveCollapsed = (storage: Storage, collapsed: boolean) =>
  saveFlag(storage, KEY, collapsed);

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * An on/off setting saved per browser and shared by every component that reads it.
 * The server and the first render use `fallback`, so they always agree.
 */
export function usePersistedFlag(key: string, fallback = false) {
  const value = useSyncExternalStore(
    subscribe,
    () => readFlag(window.localStorage, key, fallback),
    () => fallback,
  );
  const setValue = (next: boolean) => {
    saveFlag(window.localStorage, key, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, setValue] as const;
}

/** The desktop sidebar's fold state, saved per browser. Open on the server and the first render. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = usePersistedFlag(KEY);
  return { collapsed, setCollapsed };
}
