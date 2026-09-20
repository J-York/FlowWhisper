import {
  useRef,
  useContext,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Check, LoaderCircle, Mic, X } from "lucide-react";
import type { SessionState } from "../shared/types";
import { bridge } from "./bridge";
import { LocaleContext, useTranslation } from "./i18n";
import { localizeMessage } from "../shared/i18n";

export function StatusOrb({ state }: { state: SessionState }) {
  const t = useTranslation();
  const language = useContext(LocaleContext);
  const pointer = useRef<number | null>(null);
  function end(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    bridge.dragOverlay("end");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div className="orb-stage">
      <div
        className={`status-orb orb-${state.phase}`}
        role="status"
        aria-label={t("{status}，按住小球可拖动位置", {
          status: localizeMessage(state.message || t("语音输入"), language),
        })}
        title={t("按住拖动 · 自动记住位置")}
        style={{ "--voice-level": Math.min(1, state.level) } as CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current !== null) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          bridge.dragOverlay("start");
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) bridge.dragOverlay("move");
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(event) => event.preventDefault()}
      >
        {state.phase === "done" ? (
          <Check size={20} />
        ) : state.phase === "error" ? (
          <X size={20} />
        ) : state.phase === "recording" ? (
          <Mic size={18} />
        ) : (
          <LoaderCircle size={19} className="spin" />
        )}
      </div>
    </div>
  );
}
