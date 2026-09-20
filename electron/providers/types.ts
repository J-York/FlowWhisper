export interface Transcript {
  text: string;
  interim: string;
}
export interface Transcriber {
  connect(): Promise<void>;
  push(pcm: Buffer): void;
  finish(): Promise<string>;
  cancel(): void;
}
export interface Callbacks {
  update(value: Transcript): void;
  error(error: Error): void;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A connection can fail before finish() attaches its awaiter.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
export async function deadline<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export function httpError(status: number) {
  if (status === 401 || status === 403)
    return new Error(
      `鉴权失败 (${status})，请检查 API Key、模型权限与服务是否开通。`,
    );
  if (status === 429)
    return new Error("请求超过额度或频率限制 (429)，请稍后重试或切换服务。");
  return new Error(`服务返回 HTTP ${status}，请检查接口地址与模型配置。`);
}
