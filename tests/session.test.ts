import { describe, expect, it, vi } from "vitest";
import { SessionController } from "../electron/session";
import { defaults, type HistoryEntry, type Settings } from "../shared/types";
import {
  deferred,
  type Callbacks,
  type Transcriber,
} from "../electron/providers/types";
function fixture(
  config?: Partial<Settings>,
  overrides?: Partial<Transcriber>,
  rewrite?: () => Promise<string>,
) {
  let callbacks!: Callbacks;
  const saved: HistoryEntry[] = [];
  const provider: Transcriber = {
    connect: async () => {},
    push: vi.fn(),
    finish: async () => "今天 3 点开会。",
    cancel: vi.fn(),
    ...overrides,
  };
  const deliver = vi.fn(
    async (_text: string, _target: string | null, _signal: AbortSignal) =>
      "已复制",
  );
  const engine = new SessionController({
    settings: () => ({ ...structuredClone(defaults), ...config }),
    secrets: () => ({}),
    publish: () => {},
    save: (entry) => saved.push(entry),
    deliver,
    createProvider: (_c, _s, c) => {
      callbacks = c;
      return provider;
    },
    polish: rewrite,
  });
  return { engine, saved, provider, deliver, callbacks: () => callbacks };
}
describe("Recording lifecycle", () => {
  it("records, transcribes, persists before delivery, and ignores stale audio", async () => {
    const f = fixture();
    const id = await f.engine.start("123");
    f.engine.audio(id, Buffer.alloc(3200), 0.5);
    await f.engine.stop(id);
    expect(f.engine.state.phase).toBe("done");
    expect(f.saved[0].durationMs).toBe(100);
    expect(f.saved[0].raw).toBe("今天 3 点开会。");
    expect(f.deliver).toHaveBeenCalledWith(
      "今天 3 点开会。",
      "123",
      expect.any(AbortSignal),
    );
    f.engine.audio(id, Buffer.alloc(3200), 0.5);
    expect(f.provider.push).toHaveBeenCalledTimes(1);
  });
  it("falls back to raw transcript on polishing failure", async () => {
    const f = fixture(
      { polish: { ...defaults.polish, enabled: true, provider: "compatible" } },
      {},
      async () => {
        throw new Error("timeout");
      },
    );
    const id = await f.engine.start();
    await f.engine.stop(id);
    expect(f.saved[0].polished).toBe(false);
    expect(f.saved[0].warning).toContain("原文");
    expect(f.engine.state.output).toBe("今天 3 点开会。");
  });
  it("does not deliver a completed request after cancellation", async () => {
    const pending = deferred<string>();
    const f = fixture({}, { finish: () => pending.promise });
    const id = await f.engine.start();
    const stop = f.engine.stop(id);
    f.engine.cancel();
    pending.resolve("旧结果");
    await stop;
    expect(f.deliver).not.toHaveBeenCalled();
    expect(f.saved).toHaveLength(0);
    expect(f.engine.state.phase).toBe("idle");
  });
  it("cancels startup and ignores late provider events", async () => {
    const pending = deferred<void>();
    const f = fixture({}, { connect: () => pending.promise });
    const start = f.engine.start();
    f.engine.cancel();
    pending.resolve();
    await expect(start).rejects.toThrow("已取消");
    f.callbacks().update({ text: "late", interim: "" });
    expect(f.engine.state.transcript).toBe("");
    expect(f.provider.cancel).toHaveBeenCalled();
  });
  it("retains partial transcripts exactly once and never auto-pastes failures", async () => {
    const f = fixture();
    await f.engine.start();
    f.callbacks().update({ text: "已经说完", interim: "正在说" });
    f.callbacks().error(new Error("断线"));
    f.callbacks().error(new Error("重复错误"));
    expect(f.saved).toHaveLength(1);
    expect(f.saved[0].text).toBe("已经说完正在说");
    expect(f.saved[0].warning).toContain("部分");
    expect(f.deliver).not.toHaveBeenCalled();
    expect(f.engine.state.partial).toBe(true);
  });
  it("does not save or paste empty audio results", async () => {
    const f = fixture({}, { finish: async () => " " });
    const id = await f.engine.start();
    await f.engine.stop(id);
    expect(f.saved).toHaveLength(0);
    expect(f.deliver).not.toHaveBeenCalled();
    expect(f.engine.state.message).toContain("没有识别");
  });
  it("prevents overlapping recordings and routes disabled auto-paste to clipboard", async () => {
    const f = fixture({ autoPaste: false });
    const id = await f.engine.start("123");
    await expect(f.engine.start()).rejects.toThrow("正在进行");
    await f.engine.stop(id);
    expect(f.deliver.mock.calls[0][1]).toBeNull();
  });
});
