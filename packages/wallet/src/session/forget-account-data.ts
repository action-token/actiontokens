import type { QueryClient } from "@tanstack/react-query";

/**
 * Called when the signed-in account changes (sign in, sign out, switch). Every
 * cached query goes back to empty, so nothing from the previous account stays
 * on screen, not even in queries that are switched off while signed out; the
 * ones on screen load again for the new account. Invalidating isn't enough:
 * it keeps the old data and skips switched-off queries.
 */
export function forgetAccountData(client: QueryClient) {
  return client.resetQueries();
}
