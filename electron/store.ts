import { app, safeStorage } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  defaults,
  type HistoryEntry,
  type PublicSettings,
  type SecretId,
  type Settings,
} from "../shared/types";
import { settingsSchema } from "../shared/validation";
export class Store {
  private dir = app.getPath("userData");
  settings: Settings = structuredClone(defaults);
  secrets: Partial<Record<SecretId, string>> = {};
  history: HistoryEntry[] = [];
  overlayPosition: { x: number; y: number } | null = null;
  constructor() {
    mkdirSync(this.dir, { recursive: true });
    const read = (file: string) =>
      JSON.parse(readFileSync(path.join(this.dir, file), "utf8"));
    if (existsSync(path.join(this.dir, "settings.json")))
      this.settings = settingsSchema.parse(read("settings.json"));
    if (existsSync(path.join(this.dir, "secrets.enc"))) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("系统密钥存储不可用，无法读取 API Key。");
      this.secrets = JSON.parse(
        safeStorage.decryptString(
          readFileSync(path.join(this.dir, "secrets.enc")),
        ),
      );
    }
    if (existsSync(path.join(this.dir, "history.json")))
      this.history = read("history.json");
    // Window placement is independent of settings drafts and is noncritical.
    // A stale or damaged placement file must not prevent the app from opening.
    try {
      const position = read("window-state.json");
      if (
        Number.isFinite(position?.x) &&
        Number.isFinite(position?.y) &&
        Math.abs(position.x) <= 1_000_000 &&
        Math.abs(position.y) <= 1_000_000
      )
        this.overlayPosition = {
          x: Math.round(position.x),
          y: Math.round(position.y),
        };
    } catch {
      /* First run or an invalid saved position: use the default. */
    }
  }
  private write(file: string, data: string | Buffer) {
    const target = path.join(this.dir, file);
    writeFileSync(`${target}.tmp`, data, { mode: 0o600 });
    renameSync(`${target}.tmp`, target);
  }
  publicSettings(): PublicSettings {
    return {
      ...structuredClone(this.settings),
      credentials: Object.fromEntries(
        [
          "gemini",
          "groq",
          "volcengine",
          "volcAccess",
          "compatible",
          "polish",
        ].map((k) => [k, Boolean(this.secrets[k as SecretId])]),
      ) as Record<SecretId, boolean>,
    };
  }
  save(settings: Settings, secrets: Partial<Record<SecretId, string>>) {
    const updated = { ...this.secrets, ...secrets };
    if (Object.keys(secrets).length) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("系统密钥存储不可用。为保护 API Key，未保存明文凭据。");
      this.write(
        "secrets.enc",
        safeStorage.encryptString(JSON.stringify(updated)),
      );
    }
    this.write("settings.json", JSON.stringify(settings, null, 2));
    this.settings = settings;
    this.secrets = updated;
  }
  add(entry: HistoryEntry) {
    if (!this.settings.keepHistory) return;
    this.history = [
      entry,
      ...this.history.filter((item) => item.id !== entry.id),
    ].slice(0, 200);
    this.writeHistory();
  }
  delete(id: string) {
    this.history = this.history.filter((h) => h.id !== id);
    this.writeHistory();
  }
  clear() {
    this.history = [];
    this.writeHistory();
  }
  private writeHistory() {
    this.write("history.json", JSON.stringify(this.history));
  }
  saveOverlayPosition(position: { x: number; y: number }) {
    this.overlayPosition = position;
    this.write("window-state.json", JSON.stringify(position));
  }
}
