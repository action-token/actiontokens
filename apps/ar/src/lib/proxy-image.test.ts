import { describe, expect, it } from "vitest";

import { proxyableUrl } from "./proxy-image";

describe("proxyableUrl", () => {
  it("allows public image addresses", () => {
    expect(proxyableUrl("https://picsum.photos/seed/a/800/800")?.hostname).toBe("picsum.photos");
    expect(proxyableUrl("http://cdn.example.com/a.png")).not.toBeNull();
  });

  it("refuses anything that could reach inside our network", () => {
    for (const bad of [
      null,
      "not a url",
      "file:///etc/passwd",
      "http://localhost:3002/api/trpc/account.me",
      "http://127.0.0.1/",
      "http://10.0.0.5/x.png",
      "http://172.20.1.1/x.png",
      "http://192.168.1.1/x.png",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/x.png",
      "http://[fd00::1]/x.png",
      "https://user:pass@cdn.example.com/a.png",
      "http://db.internal/x",
    ]) {
      expect(proxyableUrl(bad)).toBeNull();
    }
  });
});
