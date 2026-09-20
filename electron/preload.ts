import { contextBridge, ipcRenderer } from "electron";
import type { Bridge, SessionState, PublicSettings } from "../shared/types";
const bridge: Bridge = {
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  recordHotkey: (active) => ipcRenderer.invoke("hotkey:record", active),
  dragOverlay: (action) => ipcRenderer.send("overlay:drag", action),
  saveSettings: (settings, secrets = {}) =>
    ipcRenderer.invoke("settings:save", settings, secrets),
  start: () => ipcRenderer.invoke("record:start"),
  audio: (id, pcm, level) => ipcRenderer.send("record:audio", id, pcm, level),
  stop: (id) => ipcRenderer.invoke("record:stop", id),
  cancel: () => ipcRenderer.invoke("record:cancel"),
  captureFailed: (message) => ipcRenderer.invoke("record:failed", message),
  copy: (text) => ipcRenderer.invoke("copy", text),
  historyDelete: (id) => ipcRenderer.invoke("history:delete", id),
  historyClear: () => ipcRenderer.invoke("history:clear"),
  accessibility: () => ipcRenderer.invoke("accessibility"),
  openLink: (id) => ipcRenderer.invoke("open-link", id),
  onState: (callback) => {
    const listener = (_: unknown, state: SessionState) => callback(state);
    ipcRenderer.on("state", listener);
    return () => {
      ipcRenderer.removeListener("state", listener);
    };
  },
  onSettings: (callback) => {
    const listener = (_: unknown, settings: PublicSettings) =>
      callback(settings);
    ipcRenderer.on("settings", listener);
    return () => ipcRenderer.removeListener("settings", listener);
  },
  onTheme: (callback) => {
    const listener = (_: unknown, dark: boolean) => callback(dark);
    ipcRenderer.on("theme", listener);
    return () => ipcRenderer.removeListener("theme", listener);
  },
  onCommand: (callback) => {
    const listener = (_: unknown, command: "toggle" | "cancel") =>
      callback(command);
    ipcRenderer.on("command", listener);
    return () => {
      ipcRenderer.removeListener("command", listener);
    };
  },
};
contextBridge.exposeInMainWorld("flow", bridge);
