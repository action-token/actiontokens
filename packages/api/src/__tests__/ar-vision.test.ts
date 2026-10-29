import { afterEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({ options: [] as unknown[], request: vi.fn() }));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    constructor(options: unknown) {
      google.options.push(options);
    }
    request = google.request;
  },
}));

const frames = [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")];

async function fresh() {
  vi.resetModules();
  return import("../services/ar/vision");
}

afterEach(() => {
  vi.unstubAllEnvs();
  google.options = [];
  google.request.mockReset();
});

describe("checkWithVision sign-in", () => {
  it("skips the check on a laptop with nothing configured", async () => {
    vi.stubEnv("GOOGLE_VISION_CREDENTIALS", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
    const { checkWithVision } = await fresh();
    await expect(checkWithVision(frames, 0.9)).resolves.toEqual({
      ok: true,
      report: { skipped: true, units: 0 },
    });
  });

  it("uses the machine's credentials billed to the project when there's no key", async () => {
    vi.stubEnv("GOOGLE_VISION_CREDENTIALS", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "proj-1");
    google.request.mockResolvedValue({ data: { responses: [{ labelAnnotations: [] }] } });
    const { checkWithVision } = await fresh();
    await expect(checkWithVision(frames, 0.9)).resolves.toMatchObject({
      ok: false,
      code: "NOT_ART",
    });
    expect(google.options[0]).toMatchObject({ projectId: "proj-1" });
    expect(google.request.mock.calls[0]?.[0]).toMatchObject({
      headers: { "x-goog-user-project": "proj-1" },
    });
  });

  it("says plainly when Google can't be reached", async () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "proj-1");
    google.request.mockRejectedValue(new Error("Could not load the default credentials"));
    const { checkWithVision } = await fresh();
    await expect(checkWithVision(frames, 0.9)).rejects.toMatchObject({
      message: "Couldn't check the scan with Google Vision. Try again in a moment.",
    });
  });
});
