"use client";

import { useSyncExternalStore } from "react";

const KEY = "bandcoin.sidebar-collapsed";
const EVENT = "bandcoin-sidebar-change";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** Whether the sidebar was folded; open when nothing is saved or storage is blocked. */
export function readCollapsed(storage: Storage) {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCollapsed(storage: Storage, collapsed: boolean) {
  try {
    storage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode: it still folds for this page.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const read = () => readCollapsed(window.localStorage);

/** The desktop sidebar's fold state, saved per browser. Open on the server and the first render. */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const setCollapsed = (next: boolean) => {
    saveCollapsed(window.localStorage, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return { collapsed, setCollapsed };
}
