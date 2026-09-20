import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
it("captures a full packet and flushes every trailing sample before acknowledging stop", () => {
  const messages: any[] = [];
  let Processor: any;
  class AudioWorkletProcessor {
    port = {
      onmessage: (_: any) => {},
      postMessage: (value: unknown) => messages.push(value),
    };
  }
  vm.runInNewContext(
    readFileSync(new URL("../public/pcm-worklet.js", import.meta.url), "utf8"),
    {
      AudioWorkletProcessor,
      Int16Array,
      Math,
      registerProcessor: (_name: string, value: unknown) => {
        Processor = value;
      },
    },
  );
  const processor = new Processor();
  processor.process([[new Float32Array(1600).fill(0.5)]]);
  processor.process([[new Float32Array([1, -1, 0])]]);
  expect(messages).toHaveLength(1);
  expect(new Int16Array(messages[0].pcm)).toHaveLength(1600);
  processor.port.onmessage({ data: "flush" });
  expect([...new Int16Array(messages[1].pcm)]).toEqual([32767, -32768, 0]);
  expect(messages[2]).toEqual({ type: "flushed" });
  expect(processor.process([[new Float32Array([1])]])).toBe(false);
  expect(messages).toHaveLength(3);
});
