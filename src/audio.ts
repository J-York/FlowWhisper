export class Microphone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private disposed = false;
  private flushResolve?: () => void;
  constructor(
    private onAudio: (pcm: ArrayBuffer, level: number) => void,
    private onFailure: () => void,
  ) {}
  async start(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      });
      if (this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!this.disposed) this.onFailure();
        };
      });
      const context = (this.context = new AudioContext({ sampleRate: 16000 }));
      if (context.sampleRate !== 16000)
        throw new Error("当前设备无法提供 16 kHz 音频。");
      await context.audioWorklet.addModule(
        new URL("../public/pcm-worklet.js", import.meta.url),
      );
      if (this.disposed) return;
      const node = (this.node = new AudioWorkletNode(context, "pcm-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      }));
      node.port.onmessage = (event) => {
        if (event.data.type === "audio")
          this.onAudio(event.data.pcm, event.data.level);
        if (event.data.type === "flushed") this.flushResolve?.();
      };
      const silence = context.createGain();
      silence.gain.value = 0;
      context.createMediaStreamSource(stream).connect(node);
      node.connect(silence);
      silence.connect(context.destination);
      await context.resume();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  async stop() {
    if (this.node && this.context?.state === "running") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("录音收尾超时，最后一小段音频可能不完整。")),
          1500,
        );
        this.flushResolve = () => {
          clearTimeout(timer);
          resolve();
        };
        this.node!.port.postMessage("flush");
      });
    }
    this.dispose();
  }
  dispose() {
    this.disposed = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node?.disconnect();
    if (this.context && this.context.state !== "closed")
      void this.context.close();
  }
}
