import { afterEach, describe, expect, it, vi } from "vitest";

const images = { generate: vi.fn() };
const responses = { create: vi.fn() };
vi.mock("openai", () => ({
  default: class {
    images = images;
    responses = responses;
  },
}));

const { openaiProvider } = await import("../services/studio/openai");

afterEach(() => vi.clearAllMocks());

describe("OpenAI for Studio", () => {
  it("makes images in one request: the size for the ratio, the quality and how many", async () => {
    images.generate.mockResolvedValue({
      data: [
        { b64_json: Buffer.from("a").toString("base64") },
        { b64_json: Buffer.from("b").toString("base64") },
      ],
    });
    const made = await openaiProvider("key").image({
      model: "gpt-image-2.6-flare",
      prompt: "a cover",
      aspectRatio: "3:2",
      quality: "high",
      count: 2,
    });
    expect(images.generate).toHaveBeenCalledWith({
      model: "gpt-image-2.6-flare",
      prompt: "a cover",
      size: "1536x1024",
      quality: "high",
      n: 2,
    });
    expect(made.map((image) => [image.bytes.toString(), image.mimeType])).toEqual([
      ["a", "image/png"],
      ["b", "image/png"],
    ]);
  });

  it("writes with the chosen model and reports the tokens", async () => {
    responses.create.mockResolvedValue({
      output_text: " Hello fans ",
      usage: { total_tokens: 30 },
    });
    await expect(
      openaiProvider("key").write({ model: "gpt-6-luna", prompt: "a bio" }),
    ).resolves.toEqual({ text: "Hello fans", tokens: 30 });
    expect(responses.create).toHaveBeenCalledWith({ model: "gpt-6-luna", input: "a bio" });
  });

  it("says nothing came back, has no video, and needs a key", async () => {
    images.generate.mockResolvedValue({ data: [] });
    await expect(
      openaiProvider("key").image({
        model: "gpt-image-2.6-flare",
        prompt: "x",
        aspectRatio: "1:1",
        count: 1,
      }),
    ).rejects.toThrow(/didn't make this image/);
    await expect(
      openaiProvider("key").video({ model: "x", prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrow(/can't make video/);
    await expect(openaiProvider("").write({ model: "gpt-6-luna", prompt: "hi" })).rejects.toThrow(
      /isn't set up/,
    );
  });
});
