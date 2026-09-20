import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Store } from "./store";
import { SessionController } from "./session";
import { deliver, foreground } from "./native";
import { settingsSchema, secretsSchema } from "../shared/validation";
import type { SessionState } from "../shared/types";
import { translator, localizeMessage } from "../shared/i18n";

if (process.env.FLOWWHISPER_TEST_DATA)
  app.setPath("userData", process.env.FLOWWHISPER_TEST_DATA);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let window: BrowserWindow;
let overlay: BrowserWindow;
let tray: Tray;
let store: Store;
let engine: SessionController;
let quitting = false;
let hotkeyAvailable = false;
let pendingTarget: Promise<string | null> | null = null;
let hotkeyBusy = false;
let recordingHotkey = false;
let hotkeyRecordTimer: NodeJS.Timeout | undefined;
let overlayTimer: NodeJS.Timeout;
let overlayMovedByUser = false;
let overlayDrag: { x: number; y: number } | null = null;
const developmentUrl = !app.isPackaged
  ? process.env.VITE_DEV_SERVER_URL
  : undefined;
const fileUrl = pathToFileURL(
  path.join(__dirname, "../dist/index.html"),
).toString();
function valid(event: IpcMainEvent | IpcMainInvokeEvent, allowOverlay = false) {
  const allowed =
    event.sender === window?.webContents ||
    (allowOverlay && event.sender === overlay?.webContents);
  if (!allowed || event.senderFrame !== event.sender.mainFrame)
    throw new Error("不允许的调用来源");
}
function showWindow() {
  window.show();
  window.focus();
}
function command(value: "toggle" | "cancel") {
  window.webContents.send("command", value);
}
async function hotkey() {
  if (hotkeyBusy || recordingHotkey) return;
  if (engine.busy) {
    command("toggle");
    return;
  }
  hotkeyBusy = true;
  try {
    pendingTarget = window.isFocused() ? null : foreground();
    command("toggle");
  } finally {
    hotkeyBusy = false;
  }
}
function finishHotkeyRecording() {
  clearTimeout(hotkeyRecordTimer);
  if (!recordingHotkey) return;
  recordingHotkey = false;
  hotkeyAvailable = globalShortcut.register(store.settings.hotkey, () => {
    void hotkey();
  });
}
function positionOverlay() {
  const saved = store.overlayPosition;
  const { workArea } = saved
    ? screen.getDisplayMatching({ ...saved, width: 64, height: 64 })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = saved?.x ?? workArea.x + workArea.width - 80;
  const y = saved?.y ?? workArea.y + workArea.height / 2 - 32;
  overlay.setPosition(
    Math.round(
      Math.max(
        workArea.x,
        Math.min(x, workArea.x + Math.max(0, workArea.width - 64)),
      ),
    ),
    Math.round(
      Math.max(
        workArea.y,
        Math.min(y, workArea.y + Math.max(0, workArea.height - 64)),
      ),
    ),
  );
}
function saveOverlayPosition() {
  if (!overlayMovedByUser || overlay.isDestroyed()) return;
  overlayMovedByUser = false;
  const [x, y] = overlay.getPosition();
  try {
    store.saveOverlayPosition({ x, y });
  } catch {
    /* Keep the position in memory if the preference file cannot be written. */
  }
}
function endOverlayDrag() {
  overlayDrag = null;
  saveOverlayPosition();
  if (overlay.isVisible() && !engine.busy)
    overlayTimer = setTimeout(() => overlay.hide(), 4500);
}
function publish(state: SessionState) {
  window?.webContents.send("state", state);
  overlay?.webContents.send("state", state);
  const active = [
    "connecting",
    "recording",
    "transcribing",
    "polishing",
  ].includes(state.phase);
  clearTimeout(overlayTimer);
  if (active || state.phase === "done" || state.phase === "error") {
    if (!overlay.isVisible()) positionOverlay();
    overlay.showInactive();
    if (!active && !overlayDrag)
      overlayTimer = setTimeout(() => overlay.hide(), 4500);
  } else overlay.hide();
  if (active && !globalShortcut.isRegistered("Escape"))
    globalShortcut.register("Escape", () => command("cancel"));
  if (!active && globalShortcut.isRegistered("Escape"))
    globalShortcut.unregister("Escape");
}
function createWindow(hud = false) {
  const win = new BrowserWindow({
    width: hud ? 64 : 1180,
    height: hud ? 64 : 800,
    minWidth: hud ? 64 : 900,
    minHeight: hud ? 64 : 680,
    show: false,
    title: "FlowWhisper",
    backgroundColor: hud
      ? "#00000000"
      : nativeTheme.shouldUseDarkColors
        ? "#151c18"
        : "#f7f8fa",
    icon: path.join(__dirname, "../build/icon.png"),
    ...(hud
      ? {
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          resizable: false,
          hasShadow: false,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadURL((developmentUrl ?? fileUrl) + (hud ? "#overlay" : ""));
  if (hud) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on("system-context-menu", (event) => event.preventDefault());
  }
  return win;
}
async function boot() {
  store = new Store();
  nativeTheme.themeSource = store.settings.theme;
  nativeTheme.on("updated", () => {
    const dark = nativeTheme.shouldUseDarkColors;
    window?.setBackgroundColor(dark ? "#151c18" : "#f7f8fa");
    window?.webContents.send("theme", dark);
    overlay?.webContents.send("theme", dark);
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(
        contents === window?.webContents &&
          permission === "media" &&
          !("mediaTypes" in details && details.mediaTypes?.includes("video")),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window?.webContents && permission === "media",
  );
  window = createWindow();
  overlay = createWindow(true);
  overlay.on("hide", () => {
    overlayDrag = null;
    saveOverlayPosition();
  });
  overlay.webContents.on("render-process-gone", endOverlayDrag);
  const recoverOverlay = () => {
    if (overlay.isVisible()) positionOverlay();
  };
  screen.on("display-removed", recoverOverlay);
  screen.on("display-metrics-changed", recoverOverlay);
  window.once("ready-to-show", showWindow);
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("blur", finishHotkeyRecording);
  window.webContents.on("render-process-gone", finishHotkeyRecording);
  window.webContents.on("did-start-navigation", finishHotkeyRecording);
  engine = new SessionController({
    settings: () => store.settings,
    secrets: () => store.secrets,
    save: (entry) => store.add(entry),
    deliver,
    publish,
  });
  hotkeyAvailable = globalShortcut.register(store.settings.hotkey, () => {
    void hotkey();
  });
  const trayImage = nativeImage
    .createFromPath(
      path.join(
        __dirname,
        process.platform === "darwin"
          ? "../build/tray.png"
          : "../build/icon.png",
      ),
    )
    .resize({ width: 20, height: 20 });
  if (process.platform === "darwin") trayImage.setTemplateImage(true);
  tray = new Tray(trayImage);
  tray.setToolTip("FlowWhisper");
  updateTray();
  function updateTray() {
    const t = translator(store.settings.uiLanguage);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t("打开 FlowWhisper"), click: showWindow },
        {
          label: t("开始 / 结束语音输入"),
          click: () => {
            void hotkey();
          },
        },
        { type: "separator" },
        { label: t("退出"), click: () => app.quit() },
      ]),
    );
  }
  tray.on("double-click", showWindow);
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  else
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { role: "windowMenu" },
      ]),
    );
  ipcMain.handle("bootstrap", (event) => {
    valid(event, true);
    return {
      settings: store.publicSettings(),
      history: store.history,
      state: engine.state,
      platform: process.platform,
      version: app.getVersion(),
      hotkeyAvailable,
      darkTheme: nativeTheme.shouldUseDarkColors,
      desktop: true,
    };
  });
  ipcMain.handle("settings:save", (event, input, keys) => {
    valid(event);
    if (engine.busy) throw new Error("请先结束本次输入再保存设置。");
    finishHotkeyRecording();
    const config = settingsSchema.parse(input),
      secrets = secretsSchema.parse(keys);
    const previous = store.settings.hotkey;
    if (config.hotkey !== previous) {
      if (
        !globalShortcut.register(config.hotkey, () => {
          void hotkey();
        })
      )
        throw new Error("快捷键已被占用或无效，请换一个组合。");
    }
    try {
      store.save(config, secrets);
    } catch (error) {
      if (config.hotkey !== previous) globalShortcut.unregister(config.hotkey);
      throw error;
    }
    if (config.hotkey !== previous) {
      globalShortcut.unregister(previous);
      hotkeyAvailable = true;
    }
    nativeTheme.themeSource = config.theme;
    updateTray();
    overlay.webContents.send("settings", store.publicSettings());
    return store.publicSettings();
  });
  ipcMain.handle("hotkey:record", (event, active) => {
    valid(event);
    if (typeof active !== "boolean") throw new Error("无效参数");
    if (!active) {
      finishHotkeyRecording();
      return;
    }
    if (engine.busy || !window.isFocused())
      throw new Error("请先结束录音并打开偏好设置。");
    recordingHotkey = true;
    globalShortcut.unregister(store.settings.hotkey);
    clearTimeout(hotkeyRecordTimer);
    hotkeyRecordTimer = setTimeout(finishHotkeyRecording, 31000);
  });
  ipcMain.on("overlay:drag", (event, action) => {
    valid(event, true);
    if (event.sender !== overlay.webContents || !overlay.isVisible()) return;
    if (action === "start") {
      const cursor = screen.getCursorScreenPoint();
      const [x, y] = overlay.getPosition();
      overlayDrag = { x: cursor.x - x, y: cursor.y - y };
      clearTimeout(overlayTimer);
    } else if (action === "move" && overlayDrag) {
      const cursor = screen.getCursorScreenPoint();
      const { workArea } = screen.getDisplayNearestPoint(cursor);
      const x = Math.round(
        Math.max(
          workArea.x,
          Math.min(
            cursor.x - overlayDrag.x,
            workArea.x + Math.max(0, workArea.width - 64),
          ),
        ),
      );
      const y = Math.round(
        Math.max(
          workArea.y,
          Math.min(
            cursor.y - overlayDrag.y,
            workArea.y + Math.max(0, workArea.height - 64),
          ),
        ),
      );
      overlay.setPosition(x, y);
      overlayMovedByUser = true;
    } else if (action === "end" && overlayDrag) endOverlayDrag();
  });
  ipcMain.handle("record:start", async (event) => {
    valid(event);
    const targetPromise = pendingTarget;
    pendingTarget = null;
    const target = targetPromise ? await targetPromise : null;
    if (
      process.platform === "darwin" &&
      !(await systemPreferences.askForMediaAccess("microphone"))
    )
      throw new Error(
        "麦克风权限未开启，请在系统设置中允许 FlowWhisper 使用麦克风。",
      );
    return engine.start(target);
  });
  ipcMain.on("record:audio", (event, id, data, level) => {
    valid(event);
    if (
      typeof id !== "string" ||
      !(data instanceof ArrayBuffer) ||
      data.byteLength > 64000 ||
      data.byteLength % 2 ||
      typeof level !== "number" ||
      !Number.isFinite(level)
    )
      return;
    engine.audio(id, Buffer.from(data), Math.max(0, Math.min(1, level)));
  });
  ipcMain.handle("record:stop", (event, id) => {
    valid(event);
    if (typeof id === "string") return engine.stop(id);
  });
  ipcMain.handle("record:cancel", (event) => {
    valid(event);
    pendingTarget = null;
    engine.cancel();
  });
  ipcMain.handle("record:failed", (event, message) => {
    valid(event);
    engine.captureFailed(
      typeof message === "string" ? message.slice(0, 300) : "麦克风录音失败",
    );
  });
  ipcMain.handle("copy", (event, text) => {
    valid(event);
    if (typeof text === "string" && text.length <= 100000)
      return clipboard.writeText(text);
  });
  ipcMain.handle("history:delete", (event, id) => {
    valid(event);
    store.delete(String(id));
    return store.history;
  });
  ipcMain.handle("history:clear", (event) => {
    valid(event);
    store.clear();
  });
  ipcMain.handle("accessibility", (event) => {
    valid(event);
    return (
      process.platform !== "darwin" ||
      systemPreferences.isTrustedAccessibilityClient(true)
    );
  });
  const links: Record<string, string> = {
    gemini: "https://aistudio.google.com/apikey",
    groq: "https://console.groq.com/keys",
    volcengine: "https://console.volcengine.com/speech/new/setting/apikeys",
    reference: "https://github.com/google-gemini/jot-gemini-transcribe-macOS",
  };
  ipcMain.handle("open-link", async (event, id) => {
    valid(event);
    if (typeof id === "string" && links[id])
      await shell.openExternal(links[id]);
  });
}
if (locked) {
  app
    .whenReady()
    .then(boot)
    .catch((error) => {
      const language = store?.settings.uiLanguage ?? "zh-CN";
      const t = translator(language);
      dialog.showErrorBox(
        t("FlowWhisper 启动失败"),
        `${t("无法加载本地设置。请检查用户数据目录。")}\n${localizeMessage(error.message, language)}`,
      );
      app.quit();
    });
  app.on("second-instance", () => {
    if (window) showWindow();
  });
  app.on("activate", () => {
    if (window) showWindow();
  });
  app.on("before-quit", () => {
    quitting = true;
    if (overlay && !overlay.isDestroyed()) saveOverlayPosition();
    engine?.cancel();
    globalShortcut.unregisterAll();
  });
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
}
