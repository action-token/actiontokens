/** The length of an audio file in whole seconds, read by the browser; 0 when it can't be read. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}
