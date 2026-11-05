import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { forgetAccountData } from "../session/forget-account-data";

describe("forgetAccountData", () => {
  it("drops the previous account's data, even for queries that are switched off", async () => {
    const client = new QueryClient();
    client.setQueryData(["account", "me"], { name: "Account A" });
    // A signed-out page keeps its account query mounted but disabled.
    const observer = new QueryObserver(client, {
      queryKey: ["account", "me"],
      queryFn: () => ({ name: "Account B" }),
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await forgetAccountData(client);

    expect(client.getQueryData(["account", "me"])).toBeUndefined();
    expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
  });

  it("loads the new account's data for queries on screen", async () => {
    const client = new QueryClient();
    client.setQueryData(["account", "me"], { name: "Account A" });
    const observer = new QueryObserver(client, {
      queryKey: ["account", "me"],
      queryFn: () => ({ name: "Account B" }),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await forgetAccountData(client);

    expect(client.getQueryData(["account", "me"])).toEqual({ name: "Account B" });
    unsubscribe();
  });
});
