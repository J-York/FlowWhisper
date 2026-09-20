import { z } from "zod";
import { migrateSettings } from "./polish-prompt";
const text = (max = 200) => z.string().trim().max(max);
const endpoint = (websocket = false) =>
  text(2048).refine((value) => {
    try {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === (websocket ? "wss:" : "https:") ||
          (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
            url.protocol === (websocket ? "ws:" : "http:")))
      );
    } catch {
      return false;
    }
  }, "接口地址必须使用 HTTPS / WSS，本机服务可使用 HTTP；不能包含密钥、查询参数或片段");
export const settingsSchema = z.preprocess(
  migrateSettings,
  z.object({
    uiLanguage: z.enum(["zh-CN", "en"]).default("zh-CN"),
    theme: z.enum(["system", "light", "dark"]).default("system"),
    provider: z.enum(["gemini", "groq", "volcengine", "compatible"]),
    language: z.enum(["auto", "zh", "en", "ja", "ko"]),
    hotkey: text(100)
      .min(3)
      .refine(
        (value) => value.includes("+") && !/(^|\+)Esc(ape)?$/i.test(value),
        "请使用带修饰键的组合，Esc 保留用于取消录音",
      ),
    autoPaste: z.boolean(),
    keepHistory: z.boolean(),
    microphoneId: text(1024),
    dictionary: z.array(text(100).min(1)).max(100),
    gemini: z.object({
      model: text()
        .min(1)
        .regex(/^[a-zA-Z0-9._-]+$/),
    }),
    groq: z.object({ model: text().min(1) }),
    volcengine: z.object({
      appId: text(),
      resourceId: text().min(1),
      endpoint: endpoint(true),
      authMode: z.enum(["apiKey", "legacy"]),
    }),
    compatible: z.object({ baseUrl: endpoint(), model: text().min(1) }),
    polish: z.object({
      enabled: z.boolean(),
      provider: z.enum(["gemini", "compatible"]),
      baseUrl: endpoint(),
      model: text()
        .min(1)
        .regex(/^[a-zA-Z0-9/._:-]+$/),
      style: z.enum(["natural", "professional", "concise"]),
      prompt: z
        .string()
        .min(1)
        .max(20000)
        .refine((value) => value.trim().length > 0, "提示词不能为空"),
    }),
  }),
);
export const secretsSchema = z.object({
  gemini: text(4096).optional(),
  groq: text(4096).optional(),
  volcengine: text(4096).optional(),
  volcAccess: text(4096).optional(),
  compatible: text(4096).optional(),
  polish: text(4096).optional(),
});
