import { defaults, initialState, type Bridge } from "../shared/types";
declare global {
  interface Window {
    flow?: Bridge;
  }
}
// Browser preview is deliberately read-only; only the sandboxed desktop bridge can use credentials or record.
export const desktop = Boolean(window.flow);
const unavailable = async (): Promise<never> => {
  throw new Error("请在桌面应用中使用此功能（npm run dev）。");
};
export const bridge: Bridge = window.flow ?? {
  bootstrap: async () => ({
    settings: {
      ...structuredClone(defaults),
      credentials: {
        gemini: false,
        groq: false,
        volcengine: false,
        volcAccess: false,
        compatible: false,
        polish: false,
      },
    },
    history: [],
    state: initialState,
    platform: "browser",
    version: "0.1.0",
    hotkeyAvailable: false,
    darkTheme: window.matchMedia("(prefers-color-scheme: dark)").matches,
    desktop: false,
  }),
  saveSettings: unavailable,
  recordHotkey: unavailable,
  dragOverlay: () => {},
  start: unavailable,
  audio: () => {},
  stop: unavailable,
  cancel: unavailable,
  captureFailed: unavailable,
  copy: (text) => navigator.clipboard.writeText(text),
  historyDelete: unavailable,
  historyClear: unavailable,
  accessibility: unavailable,
  openLink: unavailable,
  onState: () => () => {},
  onSettings: () => () => {},
  onTheme: () => () => {},
  onCommand: () => () => {},
};
