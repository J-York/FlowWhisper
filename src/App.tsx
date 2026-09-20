import {
  useEffect,
  useRef,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  ChevronDown,
  Clock3,
  Copy,
  Cpu,
  ExternalLink,
  History,
  Keyboard,
  LoaderCircle,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { bridge, desktop } from "./bridge";
import { Microphone } from "./audio";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { StatusOrb } from "./StatusOrb";
import { LocaleContext, useTranslation } from "./i18n";
import { translator, localizeMessage } from "../shared/i18n";
import { defaultPolishPrompt, type PolishStyle } from "../shared/polish-prompt";
import {
  defaults,
  initialState,
  providerNames,
  type Bootstrap,
  type HistoryEntry,
  type ProviderId,
  type PublicSettings,
  type SecretId,
  type SessionState,
  type Settings,
} from "../shared/types";

type Page =
  "home" | "history" | "providers" | "polish" | "dictionary" | "settings";
const pageTitles: Record<Page, string> = {
  home: "语音工作台",
  history: "输入历史",
  providers: "模型服务",
  polish: "AI 润色",
  dictionary: "个人词典",
  settings: "偏好设置",
};
const activePhases = ["connecting", "recording", "transcribing", "polishing"];
function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange(value: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={t(label)}
      disabled={disabled}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const t = useTranslation();
  const labelId = useId();
  return (
    <label className="field">
      <span className="field-title" id={labelId}>
        {t(label)}
        {hint && (
          <span
            className="field-help"
            tabIndex={0}
            role="note"
            aria-label={t(hint)}
          >
            <CircleHelp size={14} />
            <span className="help-popover" aria-hidden="true">
              {t(hint)}
            </span>
          </span>
        )}
      </span>
      {isValidElement(children) &&
      ["input", "select", "textarea"].includes(String(children.type))
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-labelledby": labelId,
          })
        : children}
    </label>
  );
}
function ProviderMark({ id }: { id: ProviderId }) {
  return (
    <span className={`provider-mark ${id}`}>
      {id === "gemini" ? (
        <Sparkles size={22} />
      ) : id === "groq" ? (
        "g"
      ) : id === "volcengine" ? (
        <AudioLines size={22} />
      ) : (
        <Cpu size={21} />
      )}
    </span>
  );
}
function Shortcut({ value, mac }: { value: string; mac: boolean }) {
  const t = useTranslation();
  return (
    <span className="shortcut">
      {value
        .replace("CommandOrControl", mac ? "⌘" : "Ctrl")
        .replace("Command", "⌘")
        .replace("Control", "Ctrl")
        .split("+")
        .map((part, i) => (
          <kbd key={i}>
            {part === "Space" ? t("空格") : part === "Shift" ? "⇧" : part}
          </kbd>
        ))}
    </span>
  );
}
function Waves({ active, level = 0 }: { active: boolean; level?: number }) {
  return (
    <div className={`waves ${active ? "live" : ""}`} aria-hidden="true">
      {Array.from({ length: 45 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${5 + Math.sin(i * 1.8) ** 2 * (active ? 18 + level * 64 : 25) * (1 - Math.abs(i - 22) / 27)}px`,
            animationDelay: `${i * -0.09}s`,
          }}
        />
      ))}
    </div>
  );
}
const cleanError = (error: unknown) =>
  String(error instanceof Error ? error.message : error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

export function App() {
  const overlay = location.hash === "#overlay";
  const [boot, setBoot] = useState<Bootstrap>();
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<PublicSettings>();
  const [draft, setDraft] = useState<Settings>(structuredClone(defaults));
  const [secrets, setSecrets] = useState<Partial<Record<SecretId, string>>>({});
  const [state, setState] = useState<SessionState>(initialState);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [nativeDark, setNativeDark] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<PolishStyle>();
  const t = translator(draft.uiLanguage);
  const message = (value: string) => localizeMessage(value, draft.uiLanguage);
  const recorder = useRef<Microphone | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const phase = useRef(state);
  const generation = useRef(0);
  const starting = useRef(false);
  const stopping = useRef(false);
  const command = useRef<(command: "toggle" | "cancel") => void>(() => {});
  const config = useRef(draft);
  config.current = draft;
  const busy = activePhases.includes(state.phase);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);
  const dirty =
    settings &&
    (JSON.stringify({ ...draft, credentials: settings.credentials }) !==
      JSON.stringify(settings) ||
      Object.keys(secrets).length > 0);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        draft.theme === "system"
          ? (desktop ? nativeDark : media.matches)
            ? "dark"
            : "light"
          : draft.theme;
      document.documentElement.lang = draft.uiLanguage;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [draft.theme, draft.uiLanguage, nativeDark]);
  useEffect(() => {
    document.body.classList.toggle("overlay-body", overlay);
    void bridge
      .bootstrap()
      .then((value) => {
        setBoot(value);
        setNativeDark(value.darkTheme);
        setSettings(value.settings);
        setDraft(value.settings);
        setHistory(value.history);
        phase.current = value.state;
        setState(value.state);
      })
      .catch((error) => setToast(cleanError(error)));
    const offState = bridge.onState((value) => {
      phase.current = value;
      setState(value);
      if (["error", "idle"].includes(value.phase)) {
        generation.current++;
        recorder.current?.dispose();
        recorder.current = undefined;
      }
      if (["done", "error"].includes(value.phase) && !overlay)
        void bridge.bootstrap().then((value) => setHistory(value.history));
    });
    const offCommand = overlay
      ? () => {}
      : bridge.onCommand((value) => command.current(value));
    const offSettings = overlay
      ? bridge.onSettings((value) => {
          setSettings(value);
          setDraft(value);
        })
      : () => {};
    const offTheme = bridge.onTheme(setNativeDark);
    return () => {
      offState();
      offCommand();
      offSettings();
      offTheme();
      recorder.current?.dispose();
    };
  }, [overlay]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (state.phase !== "recording") return;
    const timer = setInterval(() => {
      const value = Math.floor(
        (Date.now() - (state.startedAt ?? Date.now())) / 1000,
      );
      setSeconds(value);
      if (value >= 295) command.current("toggle");
    }, 300);
    return () => clearInterval(timer);
  }, [state.phase, state.startedAt]);
  async function refreshDevices() {
    try {
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "audioinput",
        ),
      );
    } catch {
      setToast(t("无法读取麦克风列表，请检查系统权限。"));
    }
  }
  useEffect(() => {
    if (page === "settings") void refreshDevices();
  }, [page]);
  async function cancel() {
    generation.current++;
    recorder.current?.dispose();
    recorder.current = undefined;
    await bridge.cancel();
  }
  async function toggleRecording() {
    if (starting.current) {
      await cancel();
      return;
    }
    if (phase.current.phase === "recording") {
      if (stopping.current) return;
      stopping.current = true;
      try {
        await recorder.current?.stop();
        recorder.current = undefined;
        await bridge.stop(phase.current.id!);
      } catch (error) {
        recorder.current?.dispose();
        await bridge.captureFailed(cleanError(error));
      } finally {
        stopping.current = false;
      }
      return;
    }
    if (activePhases.includes(phase.current.phase)) return;
    starting.current = true;
    const version = ++generation.current;
    try {
      let sessionId: string | undefined;
      const pending: { pcm: ArrayBuffer; level: number }[] = [];
      let pendingBytes = 0;
      const mic = new Microphone(
        (pcm, level) => {
          if (version !== generation.current) return;
          if (sessionId) bridge.audio(sessionId, pcm, level);
          else {
            pendingBytes += pcm.byteLength;
            if (pendingBytes > 16000 * 2 * 20) {
              void bridge.captureFailed(t("连接等待过久，请检查网络后重试。"));
              return;
            }
            pending.push({ pcm, level });
          }
        },
        () => {
          void bridge.captureFailed(t("麦克风已断开，请重新连接设备。"));
        },
      );
      recorder.current = mic;
      // Capture while the service connects so the first syllables survive the handshake.
      const [id] = await Promise.all([
        bridge.start(),
        mic.start(config.current.microphoneId),
      ]);
      if (version !== generation.current) {
        mic.dispose();
        await bridge.cancel();
        return;
      }
      sessionId = id;
      for (const chunk of pending) bridge.audio(id, chunk.pcm, chunk.level);
      pending.length = 0;
      setSeconds(0);
    } catch (error) {
      recorder.current?.dispose();
      recorder.current = undefined;
      if (version === generation.current) {
        const message =
          error instanceof DOMException
            ? t("无法使用麦克风，请检查权限或选择其他输入设备。")
            : cleanError(error);
        setToast(message);
        await bridge.captureFailed(message).catch(() => {});
      }
    } finally {
      starting.current = false;
    }
  }
  command.current = (value) => {
    void (value === "cancel" ? cancel() : toggleRecording()).catch((error) =>
      setToast(cleanError(error)),
    );
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activePhases.includes(phase.current.phase))
        command.current("cancel");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  async function save(next: Settings = draft) {
    if (!next.polish.prompt.trim()) {
      setToast(t("提示词不能为空"));
      return;
    }
    if (next.polish.prompt.length > 20000) {
      setToast(t("提示词过长，最多 20,000 字符。"));
      return;
    }
    setSaving(true);
    try {
      const value = await bridge.saveSettings(next, secrets);
      setSettings(value);
      setDraft(value);
      setSecrets({});
      setToast(t("设置已保存"));
    } catch (error) {
      setToast(cleanError(error));
    } finally {
      setSaving(false);
    }
  }
  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (
        key === "uiLanguage" &&
        previous.polish.prompt ===
          defaultPolishPrompt(previous.polish.style, previous.uiLanguage)
      ) {
        next.polish = {
          ...previous.polish,
          prompt: defaultPolishPrompt(previous.polish.style, next.uiLanguage),
        };
      }
      return next;
    });
  }
  function applyTemplate(style: PolishStyle) {
    patch("polish", {
      ...draft.polish,
      style,
      prompt: defaultPolishPrompt(style, draft.uiLanguage),
    });
    setPendingTemplate(undefined);
  }
  function loadTemplate(style: PolishStyle) {
    if (
      draft.polish.prompt !==
      defaultPolishPrompt(draft.polish.style, draft.uiLanguage)
    )
      setPendingTemplate(style);
    else applyTemplate(style);
  }
  const copied = async (text: string) => {
    await bridge.copy(text);
    setToast(t("已复制到剪贴板"));
  };
  function keyField(id: SecretId, label = "API Key", hint?: string) {
    return (
      <Field label={label} hint={hint}>
        <div className="secret-input">
          <input
            autoComplete="off"
            spellCheck={false}
            type="password"
            value={secrets[id] ?? ""}
            placeholder={
              settings?.credentials[id]
                ? t("已安全保存 · 留空保持不变")
                : t("粘贴你的 API Key")
            }
            onChange={(event) =>
              setSecrets({ ...secrets, [id]: event.target.value })
            }
          />
          <button
            type="button"
            title={t("清除此密钥（保存后生效）")}
            aria-label={t("清除 {label}", { label: t(label) })}
            onClick={() => setSecrets({ ...secrets, [id]: "" })}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </Field>
    );
  }
  if (overlay)
    return (
      <LocaleContext.Provider value={draft.uiLanguage}>
        <StatusOrb state={state} />
      </LocaleContext.Provider>
    );
  if (!boot || !settings)
    return (
      <div className="loading">
        <AudioLines size={36} />
        <p>{toast || t("正在打开 FlowWhisper…")}</p>
      </div>
    );
  const mac = boot.platform === "darwin";
  const selected = draft.provider;
  const configured =
    selected === "compatible" ||
    (selected === "volcengine" && draft.volcengine.authMode === "legacy"
      ? Boolean(draft.volcengine.appId && settings.credentials.volcAccess)
      : settings.credentials[selected]);
  const filteredHistory = history.filter((entry) =>
    `${entry.text}${entry.raw}`.toLowerCase().includes(query.toLowerCase()),
  );
  const historyRow = (entry: HistoryEntry, compact = false) => (
    <article className="history-row" key={entry.id}>
      <div className="history-symbol">
        {entry.polished ? <Sparkles size={18} /> : <AudioLines size={18} />}
      </div>
      <div className="history-content">
        <div className="history-meta">
          <span>
            {new Date(entry.createdAt).toLocaleString(draft.uiLanguage, {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span>{t(providerNames[entry.provider])}</span>
          <span>
            {Math.max(1, Math.round(entry.durationMs / 1000))}
            {t("秒")}
          </span>
          {entry.polished && <b>{t("已润色")}</b>}
          {entry.warning && (
            <b className="warn-tag">
              {entry.warning.includes("部分") ? t("部分转写") : t("原文回退")}
            </b>
          )}
        </div>
        <p className={compact ? "clamp" : ""}>{entry.text}</p>
        {!compact && entry.polished && (
          <button
            className="text-button muted"
            onClick={() =>
              setExpanded(expanded === entry.id ? undefined : entry.id)
            }
          >
            {expanded === entry.id ? t("收起原文") : t("查看原始转写")}
            <ChevronDown size={13} />
          </button>
        )}
        {expanded === entry.id && <blockquote>{entry.raw}</blockquote>}
        {!compact && entry.warning && (
          <small className="warning-text">{message(entry.warning)}</small>
        )}
      </div>
      <div className="row-actions">
        <button
          className="icon-button"
          title={t("复制文字")}
          onClick={() => void copied(entry.text)}
        >
          <Copy size={16} />
        </button>
        {!compact && (
          <button
            className="icon-button"
            title={t("删除记录")}
            onClick={() => void bridge.historyDelete(entry.id).then(setHistory)}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </article>
  );
  return (
    <LocaleContext.Provider value={draft.uiLanguage}>
      <div className="app-shell" ref={scroller}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">
              <AudioLines size={25} />
            </span>
            <div>FlowWhisper</div>
          </div>
          <nav>
            {(["home", "history"] as Page[]).map((id) => {
              const Icon = id === "home" ? Mic : History;
              return (
                <button
                  key={id}
                  className={page === id ? "selected" : ""}
                  onClick={() => setPage(id)}
                >
                  <Icon size={18} />
                  {t(pageTitles[id])}
                  {id === "home" && <span className="nav-dot" />}
                  {id === "history" && history.length > 0 && (
                    <span className="nav-count">{history.length}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <nav>
            {(["providers", "polish", "dictionary", "settings"] as Page[]).map(
              (id) => {
                const Icon = {
                  providers: Cpu,
                  polish: Sparkles,
                  dictionary: BookOpen,
                  settings: SlidersHorizontal,
                }[id as "providers" | "polish" | "dictionary" | "settings"];
                return (
                  <button
                    key={id}
                    className={page === id ? "selected" : ""}
                    onClick={() => setPage(id)}
                  >
                    <Icon size={18} />
                    {t(pageTitles[id])}
                  </button>
                );
              },
            )}
          </nav>
          <div className="sidebar-bottom">
            <div className="version">
              <span className="status-dot" />
              FlowWhisper <span>v{boot.version}</span>
            </div>
          </div>
        </aside>
        <main>
          <div className="page-content">
            <PageHeading
              title={t(page === "home" ? t("语音输入") : pageTitles[page])}
            >
              <div className="page-actions">
                {dirty && (
                  <span className="unsaved">{t("有未保存的设置")}</span>
                )}
                {(dirty || !["home", "history"].includes(page)) && (
                  <button
                    className="button primary small"
                    disabled={busy || saving || !desktop}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    {t("保存设置")}
                  </button>
                )}
                {page === "history" && (
                  <button
                    className="button secondary"
                    disabled={!history.length}
                    onClick={() => setClearConfirm(true)}
                  >
                    <Trash2 size={15} />
                    {t("清空历史")}
                  </button>
                )}
              </div>
            </PageHeading>
            {page === "home" && (
              <>
                {!configured && (
                  <div className="setup-banner">
                    <span className="setup-icon">
                      <Zap size={18} />
                    </span>
                    <div>
                      <strong>{t("请先连接语音模型")}</strong>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("providers")}
                    >
                      {t("连接模型")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {!desktop && (
                  <div className="notice">
                    {t(
                      "这是浏览器界面预览。录音、密钥存储与全局输入请使用桌面应用。",
                    )}
                  </div>
                )}
                {!boot.hotkeyAvailable && desktop && (
                  <div className="notice">
                    {t(
                      "全局快捷键未注册成功，请在偏好设置中更换组合；仍可点击按钮录音。",
                    )}
                  </div>
                )}
                <div className="workspace-grid">
                  <section
                    className="input-controls"
                    aria-label={t("输入设置")}
                  >
                    <div className="provider-select">
                      <ProviderMark id={selected} />
                      <select
                        aria-label={t("语音识别模型")}
                        value={selected}
                        disabled={busy || saving || !desktop}
                        onChange={(event) =>
                          void save({
                            ...draft,
                            provider: event.target.value as ProviderId,
                          })
                        }
                      >
                        {Object.entries(providerNames).map(([id, label]) => (
                          <option key={id} value={id}>
                            {t(label)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </div>
                    <div className="option-row">
                      <strong>{t("AI 润色")}</strong>
                      <Toggle
                        checked={draft.polish.enabled}
                        disabled={busy || saving || !desktop}
                        label={t("启用 AI 润色")}
                        onChange={(enabled) =>
                          void save({
                            ...draft,
                            polish: { ...draft.polish, enabled },
                          })
                        }
                      />
                    </div>
                    <div className="option-row">
                      <strong>{t("自动输入")}</strong>
                      <Toggle
                        checked={draft.autoPaste}
                        disabled={busy || saving || !desktop}
                        label={t("自动输入")}
                        onChange={(autoPaste) =>
                          void save({ ...draft, autoPaste })
                        }
                      />
                    </div>
                  </section>
                  <section
                    className={`recorder-card ${state.phase === "recording" ? "is-recording" : ""}`}
                  >
                    <div className="record-center">
                      <div className="mic-orbit">
                        <button
                          className={`record-button ${state.phase === "recording" ? "recording" : ""}`}
                          aria-label={
                            state.phase === "recording"
                              ? t("结束录音")
                              : t("开始录音")
                          }
                          disabled={
                            busy &&
                            state.phase !== "recording" &&
                            state.phase !== "connecting"
                          }
                          onClick={() => void toggleRecording()}
                        >
                          {state.phase === "recording" ? (
                            <Square size={27} fill="currentColor" />
                          ) : busy ? (
                            <LoaderCircle size={30} className="spin" />
                          ) : (
                            <Mic size={32} strokeWidth={1.65} />
                          )}
                        </button>
                      </div>
                      <div className="record-status">
                        <h2>
                          {state.phase === "recording"
                            ? t("正在录音…")
                            : state.phase === "connecting"
                              ? t("正在连接模型…")
                              : state.phase === "transcribing"
                                ? t("正在转写…")
                                : state.phase === "polishing"
                                  ? t("正在润色…")
                                  : t("开始语音输入")}
                        </h2>
                        {state.phase === "recording" && (
                          <span className="record-time">
                            {`${Math.floor(seconds / 60)
                              .toString()
                              .padStart(
                                2,
                                "0",
                              )}:${(seconds % 60).toString().padStart(2, "0")}`}
                          </span>
                        )}
                        {!busy && (
                          <Shortcut value={settings.hotkey} mac={mac} />
                        )}
                      </div>
                      {state.phase === "recording" && (
                        <Waves
                          active={state.phase === "recording"}
                          level={state.level}
                        />
                      )}
                    </div>
                    <div
                      className={`transcript-box ${state.phase === "error" ? "has-error" : ""}`}
                    >
                      <div className="transcript-heading">
                        <span>
                          {state.phase === "done"
                            ? t("本次输入")
                            : selected === "groq" || selected === "compatible"
                              ? t("转写结果")
                              : t("实时转写")}
                        </span>
                        {(state.output || state.transcript) && (
                          <button
                            className="text-button"
                            onClick={() =>
                              void copied(
                                state.output ||
                                  state.transcript + state.interim,
                              )
                            }
                          >
                            <Copy size={13} />
                            {t("复制")}
                          </button>
                        )}
                        {busy && (
                          <button
                            className="text-button muted"
                            onClick={() => void cancel()}
                          >
                            {t("取消")}
                            <kbd>Esc</kbd>
                          </button>
                        )}
                      </div>
                      <p
                        className={
                          state.transcript || state.output || state.interim
                            ? ""
                            : "placeholder"
                        }
                      >
                        {state.output || (
                          <>
                            {state.transcript}
                            <span className="interim">{state.interim}</span>
                          </>
                        )}
                        {!state.transcript &&
                          !state.interim &&
                          !state.output &&
                          (selected === "groq" || selected === "compatible"
                            ? t("录音结束后显示转写结果")
                            : t("等待语音输入…"))}
                        {state.phase === "recording" && (
                          <span className="caret" />
                        )}
                      </p>
                      {state.message &&
                        !["recording", "idle"].includes(state.phase) && (
                          <small className="result-message">
                            {message(state.message)}
                          </small>
                        )}
                    </div>
                  </section>
                </div>
                {history.length > 0 && (
                  <section className="recent-section">
                    <div className="section-title">
                      <h3>{t("最近输入")}</h3>
                      <button
                        className="text-button muted"
                        onClick={() => setPage("history")}
                      >
                        {t("全部历史")}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="history-list">
                      {history
                        .slice(0, 2)
                        .map((entry) => historyRow(entry, true))}
                    </div>
                  </section>
                )}
              </>
            )}
            {page === "history" && (
              <>
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label={t("搜索历史")}
                    placeholder={t("搜索你的文字…")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <span>
                    {filteredHistory.length}
                    {t("条记录")}
                  </span>
                </div>
                {filteredHistory.length ? (
                  <div className="history-list full">
                    {filteredHistory.map((entry) => historyRow(entry))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <History size={38} />
                    <h2>
                      {query ? t("没有找到相关文字") : t("还没有输入记录")}
                    </h2>
                    <button
                      className="button secondary"
                      onClick={() => setPage("home")}
                    >
                      {t("前往语音工作台")}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
            {page === "providers" && (
              <>
                <div className="provider-grid">
                  {(Object.keys(providerNames) as ProviderId[]).map((id) => (
                    <button
                      className={`provider-card ${selected === id ? "active" : ""}`}
                      key={id}
                      onClick={() => patch("provider", id)}
                    >
                      <div>
                        <ProviderMark id={id} />
                        <span className="radio-indicator">
                          {selected === id && <Check size={11} />}
                        </span>
                      </div>
                      <h3>{t(providerNames[id])}</h3>
                      <span className="provider-card-tag">
                        {id === "gemini" || id === "volcengine"
                          ? t("实时流式")
                          : t("结束后转写")}
                      </span>
                    </button>
                  ))}
                </div>
                <section className="settings-card">
                  <div className="section-title">
                    <h3>
                      <ProviderMark id={selected} />
                      {t(providerNames[selected])} {t("配置")}
                    </h3>
                    {selected !== "compatible" && (
                      <button
                        className="text-button"
                        onClick={() => void bridge.openLink(selected)}
                      >
                        {t("获取 API Key")}
                        <ExternalLink size={13} />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    {selected === "gemini" && (
                      <>
                        {keyField("gemini")}
                        <Field
                          label={t("实时转写模型")}
                          hint={t(
                            "默认使用专门的实时转写模型，API Key 需要相应访问权限。",
                          )}
                        >
                          <input
                            value={draft.gemini.model}
                            onChange={(event) =>
                              patch("gemini", { model: event.target.value })
                            }
                          />
                        </Field>
                      </>
                    )}
                    {selected === "groq" && (
                      <>
                        {keyField("groq")}
                        <Field label={t("Whisper 模型")}>
                          <select
                            value={draft.groq.model}
                            onChange={(event) =>
                              patch("groq", { model: event.target.value })
                            }
                          >
                            <option value="whisper-large-v3-turbo">
                              {t("Whisper Large V3 Turbo · 更快")}
                            </option>
                            <option value="whisper-large-v3">
                              {t("Whisper Large V3 · 更准")}
                            </option>
                          </select>
                        </Field>
                      </>
                    )}
                    {selected === "volcengine" && (
                      <>
                        <Field label={t("鉴权方式")}>
                          <select
                            value={draft.volcengine.authMode}
                            onChange={(event) =>
                              patch("volcengine", {
                                ...draft.volcengine,
                                authMode: event.target.value as
                                  "apiKey" | "legacy",
                              })
                            }
                          >
                            <option value="apiKey">
                              {t("新版控制台 · API Key")}
                            </option>
                            <option value="legacy">
                              {t("旧版控制台 · App ID + Access Token")}
                            </option>
                          </select>
                        </Field>
                        {draft.volcengine.authMode === "apiKey" ? (
                          keyField("volcengine")
                        ) : (
                          <>
                            <Field label="App ID">
                              <input
                                value={draft.volcengine.appId}
                                onChange={(event) =>
                                  patch("volcengine", {
                                    ...draft.volcengine,
                                    appId: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            {keyField("volcAccess", "Access Token")}
                          </>
                        )}
                        <Field
                          label={t("资源 ID")}
                          hint={t(
                            "填写控制台已开通的流式识别资源，可使用试用额度。",
                          )}
                        >
                          <input
                            value={draft.volcengine.resourceId}
                            onChange={(event) =>
                              patch("volcengine", {
                                ...draft.volcengine,
                                resourceId: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label={t("WebSocket 接口")}>
                          <input
                            value={draft.volcengine.endpoint}
                            onChange={(event) =>
                              patch("volcengine", {
                                ...draft.volcengine,
                                endpoint: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </>
                    )}
                    {selected === "compatible" && (
                      <>
                        <Field
                          label="API Base URL"
                          hint={t(
                            "兼容 /audio/transcriptions；本地服务支持 http://localhost。",
                          )}
                        >
                          <input
                            value={draft.compatible.baseUrl}
                            onChange={(event) =>
                              patch("compatible", {
                                ...draft.compatible,
                                baseUrl: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label={t("模型名称")}>
                          <input
                            value={draft.compatible.model}
                            onChange={(event) =>
                              patch("compatible", {
                                ...draft.compatible,
                                model: event.target.value,
                              })
                            }
                          />
                        </Field>
                        {keyField("compatible", t("API Key（可选）"))}
                      </>
                    )}
                    <Field label={t("识别语言")}>
                      <select
                        value={draft.language}
                        onChange={(event) =>
                          patch(
                            "language",
                            event.target.value as Settings["language"],
                          )
                        }
                      >
                        <option value="auto">{t("自动识别 / 中英混合")}</option>
                        <option value="zh">{t("中文")}</option>
                        <option value="en">English</option>
                        <option value="ja">{t("日本語")}</option>
                        <option value="ko">한국어</option>
                      </select>
                    </Field>
                  </div>
                  <details className="help-details">
                    <summary>{t("配置说明")}</summary>
                    <div>
                      <div className="inline-note">
                        <ShieldCheck size={16} />
                        <span>
                          {t(
                            "密钥由系统加密后保存在本机。音频直接发往你选择的服务商。",
                          )}
                        </span>
                      </div>
                      {selected === "volcengine" && (
                        <p className="form-note">
                          {t(
                            "火山流式识别的语言支持由所开通的资源决定；此处的语言提示不覆盖服务端设置。",
                          )}
                        </p>
                      )}
                      <p className="form-note">
                        {t(
                          "免费额度、限速与模型权限由服务商决定。FlowWhisper 不承诺永久免费，也不收取中转费用。",
                        )}
                      </p>
                    </div>
                  </details>
                </section>
              </>
            )}
            {page === "polish" && (
              <>
                <section className="polish-banner">
                  <span>
                    <WandSparkles size={28} />
                  </span>
                  <div>
                    <h3>{t("输入完成后自动润色")}</h3>
                  </div>
                  <Toggle
                    checked={draft.polish.enabled}
                    label={t("输入完成后自动润色")}
                    onChange={(enabled) =>
                      patch("polish", { ...draft.polish, enabled })
                    }
                  />
                </section>
                <section className="settings-card prompt-card">
                  <div className="section-title">
                    <h3 id="prompt-label">{t("系统提示词")}</h3>
                    <button
                      className="text-button"
                      onClick={() => loadTemplate(draft.polish.style)}
                    >
                      {t("恢复默认")}
                    </button>
                  </div>
                  <div className="style-grid" aria-label={t("提示词模板")}>
                    {[
                      {
                        id: "natural",
                        name: t("自然表达"),
                        icon: AudioLines,
                      },
                      {
                        id: "professional",
                        name: t("专业沟通"),
                        icon: BookOpen,
                      },
                      {
                        id: "concise",
                        name: t("简洁利落"),
                        icon: Zap,
                      },
                    ].map((style) => (
                      <button
                        key={style.id}
                        className={`style-card ${draft.polish.prompt === defaultPolishPrompt(style.id as PolishStyle, draft.uiLanguage) ? "active" : ""}`}
                        onClick={() => loadTemplate(style.id as PolishStyle)}
                      >
                        <style.icon size={21} />
                        <h3>{style.name}</h3>
                        {draft.polish.prompt ===
                          defaultPolishPrompt(
                            style.id as PolishStyle,
                            draft.uiLanguage,
                          ) && (
                          <CheckCircle2 size={17} className="style-check" />
                        )}
                      </button>
                    ))}
                  </div>
                  <textarea
                    aria-labelledby="prompt-label"
                    className="prompt-editor"
                    rows={9}
                    maxLength={20000}
                    spellCheck={false}
                    value={draft.polish.prompt}
                    onChange={(event) =>
                      patch("polish", {
                        ...draft.polish,
                        prompt: event.target.value,
                      })
                    }
                  />
                  <details className="help-details">
                    <summary>{t("润色说明")}</summary>
                    <div>
                      <p>
                        {t(
                          "直接编辑完整提示词。{{dictionary}} 会替换为个人词典；不需要时可删除。",
                        )}
                      </p>
                      <p>{t("文字将发送给所选润色服务，失败时保留原文。")}</p>
                    </div>
                  </details>
                </section>
                <section className="settings-card">
                  <div className="section-title">
                    <h3>{t("润色模型")}</h3>
                  </div>
                  <div className="form-grid">
                    <Field label={t("服务类型")}>
                      <select
                        value={draft.polish.provider}
                        onChange={(event) => {
                          const provider = event.target
                            .value as Settings["polish"]["provider"];
                          patch("polish", {
                            ...draft.polish,
                            provider,
                            model:
                              provider === "gemini"
                                ? "gemini-2.5-flash"
                                : "llama-3.3-70b-versatile",
                          });
                        }}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="compatible">
                          {t("兼容接口（Groq / DeepSeek / 火山方舟 / 本地）")}
                        </option>
                      </select>
                    </Field>
                    <Field label={t("模型名称")}>
                      <input
                        value={draft.polish.model}
                        onChange={(event) =>
                          patch("polish", {
                            ...draft.polish,
                            model: event.target.value,
                          })
                        }
                      />
                    </Field>
                    {draft.polish.provider === "compatible" && (
                      <Field
                        label="API Base URL"
                        hint={t("填写兼容 /chat/completions 的接口前缀。")}
                      >
                        <input
                          value={draft.polish.baseUrl}
                          onChange={(event) =>
                            patch("polish", {
                              ...draft.polish,
                              baseUrl: event.target.value,
                            })
                          }
                        />
                      </Field>
                    )}
                    {keyField(
                      "polish",
                      t("润色 API Key"),
                      draft.polish.provider === "gemini"
                        ? t("未单独配置时，使用已保存的 Gemini Key。")
                        : t("单独配置此服务的密钥；本地无鉴权服务可留空。"),
                    )}
                  </div>
                </section>
              </>
            )}
            {page === "dictionary" && (
              <>
                <section className="settings-card">
                  <div className="section-title">
                    <h3>{t("词条")}</h3>
                    <span className="subtle-tag">
                      {draft.dictionary.length} / 100
                    </span>
                  </div>
                  <form
                    className="add-term"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = term.trim();
                      if (
                        value &&
                        !draft.dictionary.includes(value) &&
                        draft.dictionary.length < 100
                      ) {
                        patch("dictionary", [...draft.dictionary, value]);
                        setTerm("");
                      }
                    }}
                  >
                    <input
                      maxLength={100}
                      aria-label={t("新词条")}
                      placeholder={t("例如：FlowWhisper、Kubernetes、张小明")}
                      value={term}
                      onChange={(event) => setTerm(event.target.value)}
                    />
                    <button
                      className="button primary"
                      disabled={!term.trim() || draft.dictionary.length >= 100}
                    >
                      <Plus size={16} />
                      {t("添加词条")}
                    </button>
                  </form>
                  <div className="term-list">
                    {draft.dictionary.length ? (
                      draft.dictionary.map((word) => (
                        <span className="term" key={word}>
                          {word}
                          <button
                            aria-label={t("删除 {word}", { word })}
                            onClick={() =>
                              patch(
                                "dictionary",
                                draft.dictionary.filter(
                                  (item) => item !== word,
                                ),
                              )
                            }
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <div className="dictionary-empty">
                        <BookOpen size={32} />
                        <p>{t("暂无词条")}</p>
                      </div>
                    )}
                  </div>
                  <details className="help-details">
                    <summary>{t("词典适用范围")}</summary>
                    <div className="inline-note">
                      <BookOpen size={16} />
                      <span>
                        {t(
                          "用于 Gemini 识别提示、Groq / 兼容接口的 prompt 和 AI 润色。火山识别暂不传递个人词典。",
                        )}
                      </span>
                    </div>
                  </details>
                </section>
              </>
            )}
            {page === "settings" && (
              <>
                <section className="settings-card">
                  <h3>{t("外观与语言")}</h3>
                  <div className="form-grid">
                    <Field label={t("主题")}>
                      <select
                        value={draft.theme}
                        onChange={(event) =>
                          patch(
                            "theme",
                            event.target.value as Settings["theme"],
                          )
                        }
                      >
                        <option value="system">{t("跟随系统")}</option>
                        <option value="light">{t("浅色")}</option>
                        <option value="dark">{t("暗色")}</option>
                      </select>
                    </Field>
                    <Field label={t("界面语言")}>
                      <select
                        value={draft.uiLanguage}
                        onChange={(event) =>
                          patch(
                            "uiLanguage",
                            event.target.value as Settings["uiLanguage"],
                          )
                        }
                      >
                        <option value="zh-CN">{t("简体中文")}</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                  </div>
                </section>
                <section className="settings-card">
                  <h3 className="settings-section-heading">
                    <Keyboard size={18} />
                    {t("输入与快捷键")}
                  </h3>
                  <div className="field">
                    <span>{t("全局快捷键")}</span>
                    <HotkeyRecorder
                      value={draft.hotkey}
                      mac={mac}
                      disabled={busy || saving || !desktop}
                      onChange={(value) => patch("hotkey", value)}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <strong>{t("自动粘贴到原应用")}</strong>
                    </div>
                    <Toggle
                      label={t("自动粘贴到原应用")}
                      checked={draft.autoPaste}
                      onChange={(value) => patch("autoPaste", value)}
                    />
                  </div>
                  <h3 className="settings-section-heading spaced">
                    <Mic size={18} />
                    {t("麦克风")}
                  </h3>
                  <Field
                    label={t("输入设备")}
                    hint={t("首次录音授权后可显示完整设备名称。")}
                  >
                    <select
                      value={draft.microphoneId}
                      onChange={(event) =>
                        patch("microphoneId", event.target.value)
                      }
                    >
                      <option value="">{t("跟随系统默认麦克风")}</option>
                      {devices
                        .filter(
                          (device) =>
                            device.deviceId && device.deviceId !== "default",
                        )
                        .map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label ||
                              t("麦克风 {index}", { index: index + 1 })}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button
                    className="text-button"
                    onClick={() => void refreshDevices()}
                  >
                    {t("刷新设备列表")}
                  </button>
                  {mac && (
                    <div className="inline-note">
                      <Keyboard size={16} />
                      <span>
                        {t("自动输入需要 macOS 辅助功能与自动化权限。")}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          void bridge
                            .accessibility()
                            .then((ok) =>
                              setToast(
                                ok
                                  ? t("辅助功能权限已开启")
                                  : t(
                                      "请在系统设置中允许 FlowWhisper 的辅助功能权限",
                                    ),
                              ),
                            )
                        }
                      >
                        {t("检查权限")}
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  )}
                  <h3 className="settings-section-heading spaced">
                    <ShieldCheck size={18} />
                    {t("隐私与历史")}
                  </h3>
                  <div className="settings-row">
                    <div>
                      <strong>{t("在本机保留文字历史")}</strong>
                    </div>
                    <Toggle
                      label={t("在本机保留文字历史")}
                      checked={draft.keepHistory}
                      onChange={(value) => patch("keepHistory", value)}
                    />
                  </div>
                  <details className="help-details">
                    <summary>{t("使用与隐私说明")}</summary>
                    <div>
                      <p>
                        {t(
                          "全局快捷键开始录音后，文字会输入到原应用；切换窗口后请手动粘贴。单次录音最长 5 分钟。",
                        )}
                      </p>
                      <p>
                        {t(
                          "最多保留 200 条文字历史。关闭历史后不再保存新记录，已有记录需在历史页清空。",
                        )}
                      </p>
                      <p>
                        {t(
                          "音频仅在内存中处理，文字历史为本机明文，密钥由系统加密。关闭窗口后驻留托盘，退出请使用托盘菜单。",
                        )}
                      </p>
                    </div>
                  </details>
                </section>
                <div className="about-line">
                  <span>FlowWhisper v{boot.version} · Windows & macOS</span>
                  <button
                    className="text-button muted"
                    onClick={() => void bridge.openLink("reference")}
                  >
                    {t("灵感来自 Jot")}
                    <ExternalLink size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            <span>{message(toast)}</span>
            <button aria-label={t("关闭通知")} onClick={() => setToast("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {clearConfirm && (
          <div className="modal-scrim">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-title"
            >
              <Trash2 size={27} />
              <h2 id="clear-title">{t("清空所有输入历史？")}</h2>
              <p>
                {t("本机保存的 {count} 条文字记录将被删除，此操作无法撤销。", {
                  count: history.length,
                })}
              </p>
              <div>
                <button
                  className="button secondary"
                  onClick={() => setClearConfirm(false)}
                >
                  {t("保留记录")}
                </button>
                <button
                  className="button danger"
                  onClick={() =>
                    void bridge.historyClear().then(() => {
                      setHistory([]);
                      setClearConfirm(false);
                      setToast(t("历史记录已清空"));
                    })
                  }
                >
                  {t("清空历史")}
                </button>
              </div>
            </section>
          </div>
        )}
        {pendingTemplate && (
          <div className="modal-scrim">
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="template-title"
            >
              <h2 id="template-title">{t("加载此模板？")}</h2>
              <p>{t("当前自定义提示词将被替换。")}</p>
              <div>
                <button
                  className="button secondary"
                  onClick={() => setPendingTemplate(undefined)}
                >
                  {t("保留当前提示词")}
                </button>
                <button
                  className="button primary"
                  onClick={() => applyTemplate(pendingTemplate)}
                >
                  {t("替换提示词")}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </LocaleContext.Provider>
  );
}
function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
