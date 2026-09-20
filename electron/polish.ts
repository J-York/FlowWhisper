import type { Settings } from "../shared/types";
import { renderPolishPrompt } from "../shared/polish-prompt";
import { httpError } from "./providers/types";
export function polishPrompt(settings: Settings): string {
  return renderPolishPrompt(
    settings.polish.prompt,
    settings.dictionary,
    settings.uiLanguage,
  );
}
export function validatePolish(raw: string, result: string) {
  const clean = result.trim();
  if (
    !clean ||
    clean.length > Math.max(raw.length * 3, raw.length + 150) ||
    (raw.length > 80 && clean.length < raw.length * 0.25)
  )
    throw new Error("润色结果长度异常");
  const numbers = raw.match(/\d+(?:[.:/-]\d+)*%?/g) ?? [];
  if (numbers.some((number) => !clean.includes(number)))
    throw new Error("润色改变了原文中的数字");
  if (
    /^(当然[，！!]|以下是|润色后[的：:]|好的[，！!])/.test(clean) ||
    clean.startsWith("```")
  )
    throw new Error("润色模型未按要求返回正文");
  return clean;
}
export async function polish(
  raw: string,
  settings: Settings,
  key: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<string> {
  const config = settings.polish;
  const gemini = config.provider === "gemini";
  const url = gemini
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`
    : `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = gemini
    ? {
        systemInstruction: { parts: [{ text: polishPrompt(settings) }] },
        contents: [{ role: "user", parts: [{ text: raw }] }],
        generationConfig: { temperature: 0.2 },
      }
    : {
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: polishPrompt(settings) },
          { role: "user", content: raw },
        ],
      };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key)
    headers[gemini ? "x-goog-api-key" : "Authorization"] = gemini
      ? key
      : `Bearer ${key}`;
  const response = await request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    redirect: "error",
  });
  if (!response.ok) throw httpError(response.status);
  const data: any = await response.json();
  const result = gemini
    ? data.candidates?.[0]?.content?.parts
        ?.filter((part: any) => !part.thought)
        .map((part: any) => part.text ?? "")
        .join("")
    : data.choices?.[0]?.message?.content;
  if (typeof result !== "string") throw new Error("润色未返回文字");
  return validatePolish(raw, result);
}
