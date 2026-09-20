import {
  defaultPolishPrompt,
  type UiLanguage,
  type Theme,
} from "./polish-prompt";
export type ProviderId = "gemini" | "groq" | "volcengine" | "compatible";
export type SecretId =
  "gemini" | "groq" | "volcengine" | "volcAccess" | "compatible" | "polish";
export type Phase =
  | "idle"
  | "connecting"
  | "recording"
  | "transcribing"
  | "polishing"
  | "done"
  | "error";
export interface Settings {
  uiLanguage: UiLanguage;
  theme: Theme;
  provider: ProviderId;
  language: "auto" | "zh" | "en" | "ja" | "ko";
  hotkey: string;
  autoPaste: boolean;
  keepHistory: boolean;
  microphoneId: string;
  dictionary: string[];
  gemini: { model: string };
  groq: { model: string };
  volcengine: {
    appId: string;
    resourceId: string;
    endpoint: string;
    authMode: "apiKey" | "legacy";
  };
  compatible: { baseUrl: string; model: string };
  polish: {
    enabled: boolean;
    provider: "gemini" | "compatible";
    baseUrl: string;
    model: string;
    style: "natural" | "professional" | "concise";
    prompt: string;
  };
}
export interface PublicSettings extends Settings {
  credentials: Record<SecretId, boolean>;
}
export interface HistoryEntry {
  id: string;
  createdAt: string;
  raw: string;
  text: string;
  provider: ProviderId;
  durationMs: number;
  polished: boolean;
  warning?: string;
}
export interface SessionState {
  id?: string;
  phase: Phase;
  transcript: string;
  interim: string;
  output: string;
  message: string;
  startedAt?: number;
  level: number;
  partial?: boolean;
}
export interface Bootstrap {
  settings: PublicSettings;
  history: HistoryEntry[];
  state: SessionState;
  platform: string;
  version: string;
  hotkeyAvailable: boolean;
  darkTheme: boolean;
  desktop: boolean;
}
export interface Bridge {
  bootstrap(): Promise<Bootstrap>;
  saveSettings(
    settings: Settings,
    secrets?: Partial<Record<SecretId, string>>,
  ): Promise<PublicSettings>;
  recordHotkey(active: boolean): Promise<void>;
  dragOverlay(action: "start" | "move" | "end"): void;
  start(): Promise<string>;
  audio(id: string, pcm: ArrayBuffer, level: number): void;
  stop(id: string): Promise<void>;
  cancel(): Promise<void>;
  captureFailed(message: string): Promise<void>;
  copy(text: string): Promise<void>;
  historyDelete(id: string): Promise<HistoryEntry[]>;
  historyClear(): Promise<void>;
  accessibility(): Promise<boolean>;
  openLink(id: string): Promise<void>;
  onState(callback: (state: SessionState) => void): () => void;
  onSettings(callback: (settings: PublicSettings) => void): () => void;
  onTheme(callback: (dark: boolean) => void): () => void;
  onCommand(callback: (command: "toggle" | "cancel") => void): () => void;
}
export const initialState: SessionState = {
  phase: "idle",
  transcript: "",
  interim: "",
  output: "",
  message: "",
  level: 0,
};
export const defaults: Settings = {
  uiLanguage: "zh-CN",
  theme: "system",
  provider: "gemini",
  language: "auto",
  hotkey: "CommandOrControl+Shift+Space",
  autoPaste: true,
  keepHistory: true,
  microphoneId: "",
  dictionary: [],
  gemini: { model: "gemini-3.5-transcribe-live" },
  groq: { model: "whisper-large-v3-turbo" },
  volcengine: {
    appId: "",
    resourceId: "volc.bigasr.sauc.duration",
    endpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
    authMode: "apiKey",
  },
  compatible: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "whisper-large-v3-turbo",
  },
  polish: {
    enabled: false,
    provider: "gemini",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "gemini-2.5-flash",
    style: "natural",
    prompt: defaultPolishPrompt("natural", "zh-CN"),
  },
};
export const providerNames: Record<ProviderId, string> = {
  gemini: "Gemini Live",
  groq: "Groq Whisper",
  volcengine: "火山引擎",
  compatible: "自定义服务",
};
