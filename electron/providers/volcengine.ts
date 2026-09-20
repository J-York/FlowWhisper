import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { Settings } from "../../shared/types";
import { encodeVolcPacket, decodeVolcPacket } from "./volc-protocol";
import { deadline, deferred, type Callbacks, type Transcriber } from "./types";
export class VolcTranscriber implements Transcriber {
  private socket?: WebSocket;
  private ready = deferred<void>();
  private complete = deferred<string>();
  private text = "";
  private closed = false;
  private stopping = false;
  constructor(
    private settings: Settings,
    private key: string,
    private access: string,
    private callbacks: Callbacks,
  ) {}
  async connect() {
    const config = this.settings.volcengine;
    const headers: Record<string, string> = {
      "X-Api-Resource-Id": config.resourceId,
      "X-Api-Connect-Id": randomUUID(),
    };
    if (config.authMode === "apiKey") headers["X-Api-Key"] = this.key;
    else {
      headers["X-Api-App-Key"] = config.appId;
      headers["X-Api-Access-Key"] = this.access;
    }
    const socket = (this.socket = new WebSocket(config.endpoint, {
      headers,
      handshakeTimeout: 12000,
      maxPayload: 2 * 1024 * 1024,
    }));
    socket.on("open", () => {
      socket.send(
        encodeVolcPacket(
          Buffer.from(
            JSON.stringify({
              user: { uid: "flowwhisper" },
              audio: {
                format: "pcm",
                codec: "raw",
                rate: 16000,
                bits: 16,
                channel: 1,
              },
              request: {
                model_name: "bigmodel",
                enable_itn: true,
                enable_punc: true,
                enable_ddc: false,
                show_utterances: true,
                result_type: "full",
              },
            }),
          ),
        ),
      );
    });
    socket.on("message", (data) => {
      try {
        const { payload, last } = decodeVolcPacket(Buffer.from(data as Buffer));
        if (payload.code && payload.code !== 1000 && payload.code !== 20000000)
          throw new Error(`火山引擎错误 ${payload.code}，请检查服务配置。`);
        this.ready.resolve();
        if (payload.result?.text !== undefined) {
          this.text = payload.result.text;
          this.callbacks.update({ text: this.text, interim: "" });
        }
        if (last && this.stopping) this.complete.resolve(this.text.trim());
      } catch (e) {
        this.fail(e as Error);
      }
    });
    socket.on("error", () =>
      this.fail(new Error("无法连接火山引擎，请检查凭据、资源 ID 和网络。")),
    );
    socket.on("close", (code) => {
      if (!this.closed)
        this.fail(new Error(`火山引擎连接中断 (${code})，已保留收到的文字。`));
    });
    try {
      await deadline(this.ready.promise, 15000, "火山引擎连接超时。");
    } catch (e) {
      this.cancel();
      throw e;
    }
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
    if ((this.socket?.bufferedAmount ?? 0) > 2 * 1024 * 1024)
      return this.fail(new Error("网络上传速度不足，录音已停止。"));
    this.socket?.send(encodeVolcPacket(pcm, true));
  }
  async finish() {
    this.stopping = true;
    this.socket?.send(encodeVolcPacket(Buffer.alloc(0), true, true));
    try {
      return await deadline(
        this.complete.promise,
        15000,
        "等待火山引擎最终转写超时，当前文字可能不完整。",
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
