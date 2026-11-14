import { afterEach, describe, expect, it, vi } from "vitest";

import { getBucketName, isOwnS3Url, publicS3Url } from "../bucket";

afterEach(() => vi.unstubAllEnvs());

describe("bucket settings", () => {
  it("reads the web apps' NEXT_AWS_* names (what their env files have always used)", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "legacy-bucket");
    expect(getBucketName()).toBe("legacy-bucket");
  });

  it("names the region in public URLs and accepts the older global form as its own", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "bandcoin");
    vi.stubEnv("AWS_BUCKET_REGION", "us-west-2");
    expect(publicS3Url("a.png")).toBe("https://bandcoin.s3.us-west-2.amazonaws.com/a.png");
    expect(isOwnS3Url("https://bandcoin.s3.us-west-2.amazonaws.com/a.png")).toBe(true);
    expect(isOwnS3Url("https://bandcoin.s3.amazonaws.com/a.png")).toBe(true);
    expect(isOwnS3Url("https://other.s3.us-west-2.amazonaws.com/a.png")).toBe(false);
  });

  it("prefers the plain AWS_* names when both are set", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "plain-bucket");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "legacy-bucket");
    expect(getBucketName()).toBe("plain-bucket");
  });

  it("names the missing variable", () => {
    vi.stubEnv("AWS_BUCKET_NAME", "");
    vi.stubEnv("NEXT_AWS_BUCKET_NAME", "");
    expect(() => getBucketName()).toThrowError(/AWS_BUCKET_NAME/);
  });
});
