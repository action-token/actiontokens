import { BlockedReason, GoogleGenAI } from "@google/genai";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * Google's Lyria music models through the Gemini API, server side only (the
 * key never reaches a browser). A clip is about 30 seconds; a song is a full
 * track of a couple of minutes. Both come back as one MP3.
 */
export type MusicKind = "CLIP" | "SONG";
export const MUSIC_MODELS: Record<MusicKind, string> = {
  CLIP: "lyria-3-clip-preview",
  SONG: "lyria-3-pro-preview",
};

/** `lyrics`: the words Lyria sang, or null for an instrumental */
export type MusicResult = { audio: Buffer; mimeType: string; lyrics: string | null };

/** Lyria marks a track without words as "<instrumental>". */
export const lyricsOf = (text: string) => {
  const words = text.trim();
  return !words || /^<instrumental>$/i.test(words) ? null : words;
};
export type MusicProvider = {
  generate(input: { kind: MusicKind; prompt: string }): Promise<MusicResult>;
};

/** Why a prompt came back without music, in words a person can act on. */
export function blockedReason(reason: string | undefined) {
  if (reason === BlockedReason.SAFETY)
    return "Lyria's safety filter stopped this prompt. Try describing it differently.";
  return "Lyria didn't make this one: the words may be too close to an existing song, or a filter stopped it. Try your own lyrics or a simpler description.";
}

export function lyriaProvider(apiKey = process.env.GEMINI_API_KEY): MusicProvider {
  return {
    async generate({ kind, prompt }) {
      if (!apiKey)
        throw new AppError(ErrorCodes.CONFIG_MISSING, {
          message: "Music generation isn't set up yet.",
        });
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MUSIC_MODELS[kind],
        contents: prompt,
      });
      if (!response.candidates?.length)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: blockedReason(response.promptFeedback?.blockReason),
        });
      let audio: Buffer | null = null;
      let mimeType = "audio/mpeg";
      let text = "";
      for (const part of response.candidates[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          audio = Buffer.from(part.inlineData.data, "base64");
          mimeType = part.inlineData.mimeType ?? mimeType;
        }
        if (part.text) text += part.text;
      }
      if (!audio?.length)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "Lyria answered with words but no music. Try the prompt again or change it.",
        });
      return { audio, mimeType, lyrics: lyricsOf(text) };
    },
  };
}

/** What the live relay needs from a Lyria RealTime session. */
export type LiveLyria = {
  setWeightedPrompts(input: { weightedPrompts: { text: string; weight: number }[] }): Promise<void>;
  setMusicGenerationConfig(input: {
    musicGenerationConfig: { bpm?: number; density?: number; brightness?: number };
  }): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  close(): void;
};
export type LiveEvents = {
  onAudio(base64Pcm: string): void;
  onFiltered(reason: string): void;
  onError(message: string): void;
  onClose(): void;
};
export type LiveConnect = (events: LiveEvents) => Promise<LiveLyria>;

/** Opens a Lyria RealTime session (48 kHz stereo 16-bit audio, in ~2 s chunks). */
export function lyriaLive(apiKey = process.env.GEMINI_API_KEY): LiveConnect {
  return async (events) => {
    if (!apiKey)
      throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Live music isn't set up yet." });
    const ai = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
    const session = await ai.live.music.connect({
      model: "lyria-realtime-exp",
      callbacks: {
        onmessage: (message) => {
          for (const chunk of message.serverContent?.audioChunks ?? [])
            if (chunk.data) events.onAudio(chunk.data);
          if (message.filteredPrompt)
            events.onFiltered(message.filteredPrompt.filteredReason ?? "A prompt was filtered.");
        },
        onerror: (error: unknown) =>
          events.onError(error instanceof Error ? error.message : "Lyria had a problem."),
        onclose: () => events.onClose(),
      },
    });
    return session as unknown as LiveLyria;
  };
}
