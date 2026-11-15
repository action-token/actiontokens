const KEY = "bandcoin.listening-id";

let memory: string | null = null;

/**
 * This browser's listening id: sent with every play, so a guest's Recently played
 * survives reloads and is shared by tabs. Kept in localStorage; when storage is
 * blocked (private mode), it lasts for the page instead.
 */
export function listeningSession() {
  if (memory) return memory;
  try {
    memory = localStorage.getItem(KEY);
    if (!memory) {
      memory = crypto.randomUUID();
      localStorage.setItem(KEY, memory);
    }
  } catch {
    memory ??= crypto.randomUUID();
  }
  return memory;
}

/** The id without creating one: a browser that never played anything has no history to ask for. */
export function existingListeningSession() {
  if (memory) return memory;
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
