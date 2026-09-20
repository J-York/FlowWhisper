import { randomUUID } from "node:crypto";
import {
  initialState,
  type HistoryEntry,
  type SecretId,
  type SessionState,
  type Settings,
} from "../shared/types";
import { GeminiTranscriber } from "./providers/gemini";
import { VolcTranscriber } from "./providers/volcengine";
import { WhisperTranscriber } from "./providers/whisper";
import type { Callbacks, Transcriber } from "./providers/types";
import { polish } from "./polish";
type Secrets = Partial<Record<SecretId, string>>;
interface Dependencies {
  settings(): Settings;
  secrets(): Secrets;
  publish(state: SessionState): void;
  save(entry: HistoryEntry): void;
  deliver(
    text: string,
    target: string | null,
    signal: AbortSignal,
  ): Promise<string>;
  createProvider?(
    settings: Settings,
    secrets: Secrets,
    callbacks: Callbacks,
  ): Transcriber;
  polish?: typeof polish;
}
interface Active {
  id: string;
  config: Settings;
  secrets: Secrets;
  provider?: Transcriber;
  abort: AbortController;
  bytes: number;
  target: string | null;
}
export function createProvider(
  settings: Settings,
  secrets: Secrets,
  callbacks: Callbacks,
): Transcriber {
  if (settings.provider === "gemini") {
    if (!secrets.gemini)
      throw new Error("请先在模型服务中保存 Gemini API Key。");
    return new GeminiTranscriber(settings, secrets.gemini, callbacks);
  }
  if (settings.provider === "volcengine") {
    const config = settings.volcengine;
    if (
      config.authMode === "apiKey"
        ? !secrets.volcengine
        : !config.appId || !secrets.volcAccess
    )
      throw new Error("请先配置火山引擎的凭据。");
    return new VolcTranscriber(
      settings,
      secrets.volcengine ?? "",
      secrets.volcAccess ?? "",
      callbacks,
    );
  }
  if (settings.provider === "groq" && !secrets.groq)
    throw new Error("请先在模型服务中保存 Groq API Key。");
  return new WhisperTranscriber(settings, secrets[settings.provider] ?? "");
}
export class SessionController {
  state: SessionState = { ...initialState };
  private active?: Active;
  constructor(private deps: Dependencies) {}
  get busy() {
    return Boolean(this.active);
  }
  private emit(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.deps.publish({ ...this.state });
  }
  async start(target: string | null = null): Promise<string> {
    if (this.active) throw new Error("已有录音或文字处理正在进行。");
    const session: Active = {
      id: randomUUID(),
      config: structuredClone(this.deps.settings()),
      secrets: { ...this.deps.secrets() },
      abort: new AbortController(),
      bytes: 0,
      target,
    };
    this.active = session;
    this.emit({
      ...initialState,
      id: session.id,
      phase: "connecting",
      message: "正在连接语音服务…",
    });
    try {
      session.provider = (this.deps.createProvider ?? createProvider)(
        session.config,
        session.secrets,
        {
          update: (value) => {
            if (this.active === session)
              this.emit({ transcript: value.text, interim: value.interim });
          },
          error: (error) => this.fail(session, error.message),
        },
      );
      await session.provider.connect();
      if (this.active !== session) throw new Error("已取消");
      this.emit({
        phase: "recording",
        startedAt: Date.now(),
        message: "正在聆听",
      });
      return session.id;
    } catch (error) {
      this.fail(session, (error as Error).message);
      throw error;
    }
  }
  audio(id: string, pcm: Buffer, level: number) {
    const s = this.active;
    if (!s || s.id !== id || this.state.phase !== "recording") return;
    s.bytes += pcm.length;
    if (s.bytes > 16000 * 2 * 300)
      return this.fail(s, "已达到单次 5 分钟上限，请分段输入。");
    try {
      s.provider?.push(pcm);
      this.emit({ level });
    } catch (e) {
      this.fail(s, (e as Error).message);
    }
  }
  async stop(id: string) {
    const s = this.active;
    if (!s || s.id !== id || this.state.phase !== "recording") return;
    this.emit({
      phase: "transcribing",
      level: 0,
      message: "正在确认最后一句…",
    });
    try {
      const raw = (await s.provider!.finish()).trim();
      if (this.active !== s) return;
      if (!raw) {
        this.active = undefined;
        this.emit({
          phase: "done",
          message: "没有识别到语音，请靠近麦克风后重试。",
        });
        return;
      }
      let text = raw,
        warning = "";
      this.emit({ transcript: raw, interim: "" });
      if (s.config.polish.enabled) {
        this.emit({ phase: "polishing", message: "正在润色，让表达更流畅…" });
        try {
          const key =
            s.secrets.polish ||
            (s.config.polish.provider === "gemini" ? s.secrets.gemini : "") ||
            "";
          if (s.config.polish.provider === "gemini" && !key)
            throw new Error("缺少润色 API Key");
          text = await (this.deps.polish ?? polish)(
            raw,
            s.config,
            key,
            s.abort.signal,
          );
        } catch {
          warning = "润色未完成或结果未通过检查，已保留原文。";
        }
      }
      if (this.active !== s) return;
      this.deps.save({
        id,
        createdAt: new Date().toISOString(),
        provider: s.config.provider,
        raw,
        text,
        durationMs: Math.round(s.bytes / 32),
        polished: text !== raw,
        warning: warning || undefined,
      });
      let message: string;
      try {
        message = await this.deps.deliver(
          text,
          s.config.autoPaste ? s.target : null,
          s.abort.signal,
        );
      } catch {
        message = "无法访问系统剪贴板，文字已保留在本次输入中，可重新复制。";
      }
      if (this.active !== s) return;
      this.active = undefined;
      this.emit({
        phase: "done",
        output: text,
        message: [warning, message].filter(Boolean).join(" "),
        level: 0,
      });
    } catch (error) {
      this.fail(s, (error as Error).message);
    }
  }
  captureFailed(message: string) {
    if (this.active) this.fail(this.active, message);
    else this.emit({ phase: "error", message, level: 0 });
  }
  private fail(s: Active, message: string) {
    if (this.active !== s) return;
    this.active = undefined;
    s.abort.abort();
    s.provider?.cancel();
    const partial = (this.state.transcript + this.state.interim).trim();
    if (partial) {
      try {
        this.deps.save({
          id: s.id,
          createdAt: new Date().toISOString(),
          provider: s.config.provider,
          raw: partial,
          text: partial,
          durationMs: Math.round(s.bytes / 32),
          polished: false,
          warning: "部分转写，录音未完整处理。",
        });
      } catch {
        /* Current text remains visible if local storage fails. */
      }
    }
    this.emit({
      phase: "error",
      output: partial,
      partial: Boolean(partial),
      level: 0,
      message,
    });
  }
  cancel() {
    const s = this.active;
    this.active = undefined;
    s?.abort.abort();
    s?.provider?.cancel();
    this.emit({ ...initialState, message: "已取消本次输入" });
  }
}
