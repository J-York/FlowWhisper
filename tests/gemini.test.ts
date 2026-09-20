import { afterEach, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { defaults } from "../shared/types";
import { GeminiTranscriber } from "../electron/providers/gemini";
const servers: WebSocketServer[] = [];
afterEach(() => {
  vi.useRealTimers();
  servers.forEach((server) => {
    server.clients.forEach((client) => client.terminate());
    server.close();
  });
  servers.length = 0;
});
it("finishes when Transcribe Live sends generationComplete without turnComplete", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await once(server, "listening");
  server.on("connection", (socket) =>
    socket.on("message", (data) => {
      const value = JSON.parse(data.toString());
      if (value.setup) socket.send(JSON.stringify({ setupComplete: {} }));
      if (value.realtimeInput?.activityEnd) {
        socket.send(
          JSON.stringify({
            serverContent: {
              inputTranscription: { text: "明天下午 3 点开会。" },
            },
          }),
        );
        socket.send(
          JSON.stringify({ serverContent: { generationComplete: true } }),
        );
      }
    }),
  );
  const provider = new GeminiTranscriber(
    defaults,
    "local-test",
    { update: () => {}, error: () => {} },
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  await provider.connect();
  let timer: NodeJS.Timeout;
  try {
    const result = await Promise.race([
      provider.finish(),
      new Promise<string>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "final transcript was received but finish stayed pending",
              ),
            ),
          1000,
        );
      }),
    ]);
    expect(result).toBe("明天下午 3 点开会。");
  } finally {
    clearTimeout(timer!);
    provider.cancel();
  }
});

it.each(["generationComplete", "turnComplete"])(
  "waits for the final transcript when %s arrives first",
  async (signal) => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    servers.push(server);
    await once(server, "listening");
    let tail: NodeJS.Timeout;
    const updates: string[] = [];
    server.on("connection", (socket) =>
      socket.on("message", (data) => {
        const value = JSON.parse(data.toString());
        if (value.setup) socket.send(JSON.stringify({ setupComplete: {} }));
        if (value.realtimeInput?.activityEnd) {
          socket.send(
            JSON.stringify({
              serverContent: { interimInputTranscription: { text: "最后一" } },
            }),
          );
          socket.send(JSON.stringify({ serverContent: { [signal]: true } }));
          tail = setTimeout(
            () =>
              socket.send(
                JSON.stringify({
                  serverContent: {
                    inputTranscription: { text: "最后一句也要留下。" },
                  },
                }),
              ),
            80,
          );
        }
      }),
    );
    const provider = new GeminiTranscriber(
      defaults,
      "local-test",
      { update: (value) => updates.push(value.text), error: () => {} },
      `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    );
    await provider.connect();
    let timer: NodeJS.Timeout;
    try {
      const result = await Promise.race([
        provider.finish(),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("final transcript stayed pending")),
            1000,
          );
        }),
      ]);
      expect(result).toBe("最后一句也要留下。");
      expect(updates).toContain("最后一句也要留下。");
    } finally {
      clearTimeout(timer!);
      clearTimeout(tail!);
      provider.cancel();
    }
  },
);

it("accepts an explicitly empty final transcription", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await once(server, "listening");
  server.on("connection", (socket) =>
    socket.on("message", (data) => {
      const value = JSON.parse(data.toString());
      if (value.setup) socket.send(JSON.stringify({ setupComplete: {} }));
      if (value.realtimeInput?.activityEnd)
        socket.send(
          JSON.stringify({
            serverContent: {
              inputTranscription: { text: "" },
              generationComplete: true,
            },
          }),
        );
    }),
  );
  const provider = new GeminiTranscriber(
    defaults,
    "local-test",
    { update: () => {}, error: () => {} },
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  await provider.connect();
  let timer: NodeJS.Timeout;
  try {
    expect(
      await Promise.race([
        provider.finish(),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("empty final stayed pending")),
            1000,
          );
        }),
      ]),
    ).toBe("");
  } finally {
    clearTimeout(timer!);
    provider.cancel();
  }
});

it("still reports a timeout if only interim text arrives", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await once(server, "listening");
  let receivedInterim!: () => void;
  const interim = new Promise<void>((resolve) => {
    receivedInterim = resolve;
  });
  server.on("connection", (socket) =>
    socket.on("message", (data) => {
      const value = JSON.parse(data.toString());
      if (value.setup) socket.send(JSON.stringify({ setupComplete: {} }));
      if (value.realtimeInput?.audio)
        socket.send(
          JSON.stringify({
            serverContent: { interimInputTranscription: { text: "还未确认" } },
          }),
        );
    }),
  );
  const provider = new GeminiTranscriber(
    defaults,
    "local-test",
    { update: receivedInterim, error: () => {} },
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  await provider.connect();
  provider.push(Buffer.alloc(3200, 1));
  await interim;
  vi.useFakeTimers();
  const result = expect(provider.finish()).rejects.toThrow("最终转写超时");
  await vi.advanceTimersByTimeAsync(12000);
  await result;
});
it.each([false, true])(
  "skips exact digital silence while retaining even a one-bit audio signal (signal: %s)",
  async (hasSignal) => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    servers.push(server);
    await once(server, "listening");
    server.on("connection", (socket) =>
      socket.on("message", (data) => {
        const value = JSON.parse(data.toString());
        if (value.setup) socket.send(JSON.stringify({ setupComplete: {} }));
        if (value.realtimeInput?.activityEnd && hasSignal)
          socket.send(
            JSON.stringify({
              serverContent: {
                inputTranscription: { text: "很轻的声音。" },
                generationComplete: true,
              },
            }),
          );
        // With all-zero PCM, the real service sends no final text or completion.
      }),
    );
    const provider = new GeminiTranscriber(
      defaults,
      "local-test",
      { update: () => {}, error: () => {} },
      `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    );
    await provider.connect();
    const pcm = Buffer.alloc(3200);
    if (hasSignal) pcm.writeInt16LE(1, 0);
    provider.push(pcm);
    provider.push(Buffer.alloc(3200));
    let timer: NodeJS.Timeout;
    try {
      const text = await Promise.race([
        provider.finish(),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("finish stayed pending")),
            1000,
          );
        }),
      ]);
      expect(text).toBe(hasSignal ? "很轻的声音。" : "");
    } finally {
      clearTimeout(timer!);
      provider.cancel();
    }
  },
);
it("streams interim hypotheses, commits final text and waits for final turn after activityEnd", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await once(server, "listening");
  const messages: any[] = [];
  const updates: string[] = [];
  server.on("connection", (socket) =>
    socket.on("message", (data) => {
      const value = JSON.parse(data.toString());
      messages.push(value);
      if (value.setup) {
        expect(value.setup.generationConfig.responseModalities).toEqual([
          "TEXT",
        ]);
        socket.send(JSON.stringify({ setupComplete: {} }));
      }
      if (value.realtimeInput?.audio) {
        socket.send(
          JSON.stringify({
            serverContent: { interimInputTranscription: { text: "明天下午" } },
          }),
        );
      }
      if (value.realtimeInput?.activityEnd) {
        socket.send(
          JSON.stringify({
            serverContent: {
              inputTranscription: { text: "明天下午开会。" },
              turnComplete: true,
            },
          }),
        );
      }
    }),
  );
  const provider = new GeminiTranscriber(
    defaults,
    "local-test",
    {
      update: (value) => updates.push(value.text + value.interim),
      error: (error) => {
        throw error;
      },
    },
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  await provider.connect();
  provider.push(Buffer.alloc(3200, 1));
  expect(await provider.finish()).toBe("明天下午开会。");
  expect(updates).toContain("明天下午");
  expect(messages.some((value) => value.realtimeInput?.activityStart)).toBe(
    true,
  );
  expect(
    messages.find((value) => value.realtimeInput?.audio).realtimeInput.audio
      .mimeType,
  ).toBe("audio/pcm;rate=16000");
});
it("rejects a connection that closes before setup completes", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(server);
  await once(server, "listening");
  server.on("connection", (socket) => socket.close(1008));
  const provider = new GeminiTranscriber(
    defaults,
    "local-test",
    { update: () => {}, error: () => {} },
    `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  await expect(provider.connect()).rejects.toThrow("1008");
});
