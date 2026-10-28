import type * as Tjs from "@huggingface/transformers";

export { dot, muralScore } from "@bandcoin/ar-core/murals/score";

/**
 * ── Server-side MobileCLIP ─────────────────────────────────────────────────
 *
 * The same model, weights (fp16) and prompt embeddings the phone runs, so a
 * score or embedding computed here compares directly with one from any
 * device. The server never trusts the client's numbers: matching and the
 * "is it art at all" gate both run from the keyframe bytes.
 *
 * Loaded once per server process; on Vercel the weights (~23 MB) are fetched
 * into /tmp on a cold start. The int8 build is not an option: it collapses
 * every image onto one prompt.
 */

const MODEL = "Xenova/mobileclip_s0";

type Vision = {
  processor: (img: Tjs.RawImage) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: Tjs.Tensor }>;
  RawImage: typeof Tjs.RawImage;
};

let loading: Promise<Vision> | null = null;

function load(): Promise<Vision> {
  loading ??= (async () => {
    const tjs = await import("@huggingface/transformers");
    if (process.env.VERCEL) tjs.env.cacheDir = "/tmp/transformers-cache";
    const [processor, model] = await Promise.all([
      tjs.AutoProcessor.from_pretrained(MODEL),
      tjs.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "fp16" }),
    ]);
    return {
      processor: processor as unknown as Vision["processor"],
      model: model as unknown as Vision["model"],
      RawImage: tjs.RawImage,
    };
  })().catch((error: unknown) => {
    loading = null; // let the next request retry a failed download
    throw error;
  });
  return loading;
}

/** Normalised 512-d embedding of a JPEG. */
export async function embedImage(bytes: Buffer): Promise<number[]> {
  const { processor, model, RawImage } = await load();
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
  const { image_embeds } = await model(await processor(image));
  return (image_embeds.normalize().tolist() as number[][])[0]!;
}
