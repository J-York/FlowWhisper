import WebSocket from "ws";
import type { Settings } from "../../shared/types";
import { deadline, deferred, type Callbacks, type Transcriber } from "./types";
export class GeminiTranscriber implements Transcriber {
  private socket?: WebSocket;
  private ready = deferred<void>();
  private complete = deferred<string>();
  private text = "";
  private interim = "";
  private hasFinalTranscription = false;
  private generationEnded = false;
  private receivedAudio = false;
  private hasAudioSignal = false;
  private stopping = false;
  private closed = false;
  constructor(
    private settings: Settings,
    private key: string,
    private callbacks: Callbacks,
    private url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
  ) {}
  async connect() {
    const socket = (this.socket = new WebSocket(
      `${this.url}?key=${encodeURIComponent(this.key)}`,
      { handshakeTimeout: 12000, maxPayload: 2 * 1024 * 1024 },
    ));
    socket.on("open", () => {
      const languages: Record<string, string> = {
        zh: "cmn-Hans-CN",
        en: "en-US",
        ja: "ja-JP",
        ko: "ko-KR",
      };
      this.send({
        setup: {
          model: `models/${this.settings.gemini.model}`,
          generationConfig: { responseModalities: ["TEXT"] },
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: true },
          },
          inputAudioTranscription: {
            languageCodes:
              this.settings.language === "auto"
                ? []
                : [languages[this.settings.language]],
            customVocabulary: this.settings.dictionary,
            mode: "VERBATIM",
          },
        },
      });
    });
    socket.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.error)
          return this.fail(
            new Error(
              `Gemini 拒绝请求 (${response.error.code ?? "未知"})，请检查模型访问权限与配置。`,
            ),
          );
        if (response.setupComplete) {
          this.send({ realtimeInput: { activityStart: {} } });
          this.ready.resolve();
        }
        const content = response.serverContent;
        if (!content) return;
        if (content.interimInputTranscription?.text !== undefined)
          this.interim = content.interimInputTranscription.text;
        if (typeof content.inputTranscription?.text === "string") {
          this.text += content.inputTranscription.text;
          this.interim = "";
          this.hasFinalTranscription = true;
        }
        this.callbacks.update({ text: this.text, interim: this.interim });
        // Transcribe Live emits generationComplete without necessarily emitting
        // turnComplete. Input transcription is a separate, unordered stream, so
        // wait for BOTH the completion signal and its final text (even empty).
        if (
          this.stopping &&
          (content.generationComplete || content.turnComplete)
        )
          this.generationEnded = true;
        if (
          this.stopping &&
          this.generationEnded &&
          this.hasFinalTranscription &&
          !this.interim
        )
          this.complete.resolve(this.text.trim());
      } catch {
        this.fail(new Error("Gemini 返回了无法解析的数据。"));
      }
    });
    socket.on("error", () =>
      this.fail(new Error("无法连接 Gemini，请检查网络、API Key 和模型权限。")),
    );
    socket.on("close", (code) => {
      if (!this.closed)
        this.fail(new Error(`Gemini 连接中断 (${code})，已保留收到的文字。`));
    });
    try {
      await deadline(
        this.ready.promise,
        15000,
        "Gemini 连接超时，请检查网络。",
      );
    } catch (e) {
      this.cancel();
      throw e;
    }
  }
  private send(value: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.ready.reject(error);
    this.complete.reject(error);
    this.callbacks.error(error);
    this.cancel();
  }
  push(pcm: Buffer) {
    if (this.stopping || this.closed) return;
    this.receivedAudio ||= pcm.length > 0;
    // Exact digital silence (for example, a muted microphone) does not produce
    // a final transcription on Transcribe Live. Do not threshold quiet speech.
    this.hasAudioSignal ||= pcm.some((byte) => byte !== 0);
    if ((this.socket?.bufferedAmount ?? 0) > 2 * 1024 * 1024)
      return this.fail(
        new Error("网络上传速度不足，录音已停止并保留已识别文字。"),
      );
    this.send({
      realtimeInput: {
        audio: {
          data: pcm.toString("base64"),
          mimeType: "audio/pcm;rate=16000",
        },
      },
    });
  }
  async finish() {
    this.stopping = true;
    this.send({ realtimeInput: { activityEnd: {} } });
    try {
      if (
        this.receivedAudio &&
        !this.hasAudioSignal &&
        !this.text &&
        !this.interim
      )
        return "";
      return await deadline(
        this.complete.promise,
        12000,
        "等待 Gemini 最终转写超时，当前文字可能不完整。",
      );
    } finally {
      this.cancel();
    }
  }
  cancel() {
    this.closed = true;
    this.ready.reject(new Error("已取消"));
    this.complete.reject(new Error("已取消"));
    if (this.socket?.readyState === WebSocket.CONNECTING)
      this.socket.terminate();
    else this.socket?.close();
  }
}
