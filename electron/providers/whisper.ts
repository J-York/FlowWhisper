import type { Settings } from "../../shared/types";
import { httpError, type Transcriber } from "./types";
export function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export class WhisperTranscriber implements Transcriber {
  private chunks: Buffer[] = [];
  private controller = new AbortController();
  private bytes = 0;
  constructor(
    private settings: Settings,
    private key: string,
    private request: typeof fetch = fetch,
  ) {}
  async connect() {}
  push(pcm: Buffer) {
    this.bytes += pcm.length;
    if (this.bytes > 20 * 1024 * 1024)
      throw new Error("录音超过 20 MB，请分段输入。");
    this.chunks.push(pcm);
  }
  async finish() {
    const config =
      this.settings.provider === "groq"
        ? { baseUrl: "https://api.groq.com/openai/v1", ...this.settings.groq }
        : this.settings.compatible;
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(pcmToWav(Buffer.concat(this.chunks)))], {
        type: "audio/wav",
      }),
      "speech.wav",
    );
    form.append("model", config.model);
    form.append("response_format", "json");
    if (this.settings.language !== "auto")
      form.append("language", this.settings.language);
    if (this.settings.dictionary.length)
      form.append("prompt", this.settings.dictionary.join(", "));
    try {
      const response = await this.request(
        `${config.baseUrl.replace(/\/$/, "")}/audio/transcriptions`,
        {
          method: "POST",
          headers: this.key ? { Authorization: `Bearer ${this.key}` } : {},
          body: form,
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(60000),
          ]),
          redirect: "error",
        },
      );
      if (!response.ok) throw httpError(response.status);
      const result = (await response.json()) as { text?: unknown };
      if (typeof result.text !== "string")
        throw new Error("语音服务没有返回有效的 text 字段。");
      return result.text.trim();
    } finally {
      this.chunks = [];
    }
  }
  cancel() {
    this.controller.abort();
    this.chunks = [];
  }
}
