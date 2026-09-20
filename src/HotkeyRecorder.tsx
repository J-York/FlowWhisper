import { useEffect, useRef, useState } from "react";
import { Keyboard, Square } from "lucide-react";
import { bridge } from "./bridge";
import { recordedHotkey } from "../shared/hotkey";
import { useTranslation } from "./i18n";

export function HotkeyRecorder({
  value,
  mac,
  disabled,
  onChange,
}: {
  value: string;
  mac: boolean;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const t = useTranslation();
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState("");
  const mounted = useRef(true);
  const button = useRef<HTMLButtonElement>(null);
  const candidate = useRef<string | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void bridge.recordHotkey(false).catch(() => {});
    };
  }, []);
  async function stop() {
    candidate.current = null;
    setRecording(false);
    await bridge.recordHotkey(false).catch(() => {});
  }
  useEffect(() => {
    if (!recording) return;
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        void stop();
        setHint(t("已取消录制，原快捷键不变。"));
        return;
      }
      if (candidate.current) return;
      const captured = recordedHotkey(event, mac);
      if (!captured) {
        setHint(t("请按 Ctrl / Command / Alt 与其他按键的组合。"));
        return;
      }
      candidate.current = captured;
      setHint(t("已捕获组合键，松开按键即可完成。"));
    };
    const keyup = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (
        candidate.current &&
        !(event.ctrlKey || event.altKey || event.shiftKey || event.metaKey)
      ) {
        change.current(candidate.current);
        setHint(t("已记录，点击「保存设置」生效。"));
        void stop();
      }
    };
    const blur = () => {
      void stop();
      setHint(t("已取消录制，原快捷键不变。"));
    };
    const timer = setTimeout(blur, 30000);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    button.current?.focus();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
    };
  }, [recording, mac]);
  async function start() {
    setPending(true);
    setHint("");
    try {
      await bridge.recordHotkey(true);
      if (mounted.current) setRecording(true);
      else await bridge.recordHotkey(false);
    } catch {
      setHint(t("请先结束录音，再录制快捷键。"));
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  const display = value
    .replace("CommandOrControl", mac ? "⌘" : "Ctrl")
    .replace("Control", "Ctrl")
    .replace("Command", "⌘")
    .replace("Super", "Win")
    .replace("Space", t("空格"));
  return (
    <div className="hotkey-recorder">
      <div className={`hotkey-capture ${recording ? "capturing" : ""}`}>
        <output aria-label={t("当前快捷键")}>
          {recording ? t("请按下组合键…") : display}
        </output>
        <button
          ref={button}
          type="button"
          className="button secondary"
          disabled={disabled || pending}
          onClick={() => {
            if (recording) {
              setHint(t("已取消录制，原快捷键不变。"));
              void stop();
            } else void start();
          }}
        >
          {recording ? <Square size={14} /> : <Keyboard size={15} />}
          {recording ? t("取消录制") : t("录制快捷键")}
        </button>
      </div>
      {(hint || recording) && (
        <small aria-live="polite">
          {t(hint || t("Esc 取消 · 30 秒无操作自动退出"))}
        </small>
      )}
    </div>
  );
}
