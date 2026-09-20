import { describe, expect, it } from "vitest";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  encodeVolcPacket,
  decodeVolcPacket,
} from "../electron/providers/volc-protocol";
import { pcmToWav, WhisperTranscriber } from "../electron/providers/whisper";
import { defaults } from "../shared/types";
import { settingsSchema } from "../shared/validation";
import { validatePolish, polish } from "../electron/polish";
describe("Volcengine binary protocol", () => {
  it("frames a compressed audio ending without a sequence number", () => {
    const audio = Buffer.from([0, 1, 2, 3]);
    const packet = encodeVolcPacket(audio, true, true);
    expect([...packet.subarray(0, 4)]).toEqual([0x11, 0x22, 0x01, 0]);
    expect(packet.readUInt32BE(4)).toBe(packet.length - 8);
    expect(gunzipSync(packet.subarray(8))).toEqual(audio);
  });
  it.each([0x90, 0x91, 0x92, 0x93])(
    "handles response flag %s and detects final packets",
    (flag) => {
      const body = gzipSync(
        Buffer.from(JSON.stringify({ result: { text: "下午三点开会。" } })),
      );
      const hasSequence = flag & 1;
      const header = Buffer.alloc(hasSequence ? 12 : 8);
      header.set([0x11, flag, 0x11, 0]);
      if (hasSequence) header.writeInt32BE(-2, 4);
      header.writeUInt32BE(body.length, header.length - 4);
      const result = decodeVolcPacket(Buffer.concat([header, body]));
      expect(result.payload.result.text).toBe("下午三点开会。");
      expect(result.last).toBe(Boolean(flag & 2));
    },
  );
  it("rejects truncated frames and provider errors without exposing response secrets", () => {
    expect(() =>
      decodeVolcPacket(Buffer.from([0x11, 0x93, 0x11, 0])),
    ).toThrow();
    const body = Buffer.from("secret-token-in-vendor-error");
    const header = Buffer.alloc(12);
    header.set([0x11, 0xf0, 0, 0]);
    header.writeUInt32BE(45000001, 4);
    header.writeUInt32BE(body.length, 8);
    expect(() => decodeVolcPacket(Buffer.concat([header, body]))).toThrow(
      "45000001",
    );
    expect(() => decodeVolcPacket(Buffer.concat([header, body]))).not.toThrow(
      "secret-token",
    );
  });
});
describe("Whisper transport", () => {
  it("writes valid 16kHz mono WAV lengths and preserves samples", () => {
    const pcm = Buffer.from([0, 0, 255, 127, 0, 128]);
    const wav = pcmToWav(pcm);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(42);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(6);
    expect(wav.subarray(44)).toEqual(pcm);
  });
  it("sends a real multipart WAV with model, language and vocabulary", async () => {
    const settings = structuredClone(defaults);
    settings.provider = "compatible";
    settings.language = "zh";
    settings.dictionary = ["FlowWhisper"];
    const request: typeof fetch = async (url, init) => {
      expect(String(url)).toMatch(/\/audio\/transcriptions$/);
      const form = init!.body as FormData;
      expect(form.get("model")).toBe("whisper-large-v3-turbo");
      expect(form.get("language")).toBe("zh");
      expect(form.get("prompt")).toBe("FlowWhisper");
      expect(
        Buffer.from(await (form.get("file") as Blob).arrayBuffer()).subarray(
          44,
        ),
      ).toEqual(Buffer.alloc(3200));
      return Response.json({ text: "测试文字。" });
    };
    const provider = new WhisperTranscriber(settings, "test-only", request);
    await provider.connect();
    provider.push(Buffer.alloc(3200));
    expect(await provider.finish()).toBe("测试文字。");
  });
  it("reports quota exhaustion", async () => {
    const provider = new WhisperTranscriber(
      defaults,
      "test",
      async () => new Response("", { status: 429 }),
    );
    await expect(provider.finish()).rejects.toThrow("额度");
  });
});
describe("Polishing and configuration guards", () => {
  it("rejects empty, conversational and number-changing rewrites", () => {
    expect(() => validatePolish("下午 3 点开会", "下午 4 点开会")).toThrow(
      "数字",
    );
    expect(() => validatePolish("你好", "")).toThrow();
    expect(() => validatePolish("你好", "当然，我可以帮助你。")).toThrow();
    expect(validatePolish("嗯，明天 3 点开会吧", "明天 3 点开会。")).toBe(
      "明天 3 点开会。",
    );
  });
  it("keeps transcript in the data role and ignores Gemini thought parts", async () => {
    const result = await polish(
      "明天见",
      defaults,
      "key",
      new AbortController().signal,
      async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.contents[0].parts[0].text).toBe("明天见");
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "analysis" },
                  { text: "明天见。" },
                ],
              },
            },
          ],
        });
      },
    );
    expect(result).toBe("明天见。");
  });
  it("permits localhost but rejects remote plaintext and URL credentials", () => {
    for (const baseUrl of [
      "http://127.0.0.1:8000/v1",
      "https://example.com/v1",
    ])
      expect(
        settingsSchema.safeParse({
          ...defaults,
          compatible: { model: "test", baseUrl },
        }).success,
      ).toBe(true);
    for (const baseUrl of [
      "http://example.com/v1",
      "https://key:secret@example.com/v1",
      "https://example.com/v1?key=secret",
      "file:///C:/data",
    ])
      expect(
        settingsSchema.safeParse({
          ...defaults,
          compatible: { model: "test", baseUrl },
        }).success,
      ).toBe(false);
  });
});
