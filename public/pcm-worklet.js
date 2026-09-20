class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(1600);
    this.offset = 0;
    this.energy = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this.flush();
        this.stopped = true;
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  flush() {
    if (!this.offset) return;
    const chunk = this.buffer.slice(0, this.offset);
    this.port.postMessage(
      {
        type: "audio",
        pcm: chunk.buffer,
        level: Math.min(1, Math.sqrt(this.energy / this.offset) * 5),
      },
      [chunk.buffer],
    );
    this.offset = 0;
    this.energy = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const samples = inputs[0]?.[0];
    if (samples)
      for (const sample of samples) {
        const value = Math.max(-1, Math.min(1, sample));
        this.buffer[this.offset++] = Math.round(
          value * (value < 0 ? 32768 : 32767),
        );
        this.energy += value * value;
        if (this.offset === this.buffer.length) this.flush();
      }
    return true;
  }
}
registerProcessor("pcm-recorder", PCMProcessor);
