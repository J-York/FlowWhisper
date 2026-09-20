import { describe, expect, it } from "vitest";
import { defaults } from "../shared/types";
import { settingsSchema } from "../shared/validation";
import {
  defaultPolishPrompt,
  renderPolishPrompt,
} from "../shared/polish-prompt";
import { polish } from "../electron/polish";
import { localizeMessage, translator } from "../shared/i18n";

describe("Editable polish prompts and upgrades", () => {
  it("upgrades old settings without losing supplemental instructions or recognition language", () => {
    const legacy: any = structuredClone(defaults);
    delete legacy.uiLanguage;
    delete legacy.theme;
    delete legacy.polish.prompt;
    legacy.polish.style = "professional";
    legacy.polish.instruction = "保留所有技术术语，用列表输出。";
    legacy.language = "ja";
    const migrated = settingsSchema.parse(legacy);
    expect(migrated.uiLanguage).toBe("zh-CN");
    expect(migrated.theme).toBe("system");
    expect(migrated.language).toBe("ja");
    expect(migrated.polish.prompt).toContain(
      defaultPolishPrompt("professional", "zh-CN"),
    );
    expect(migrated.polish.prompt).toContain(legacy.polish.instruction);
    expect(migrated.polish).not.toHaveProperty("instruction");
  });
  it("preserves the complete custom prompt exactly across validation and repeated migration", () => {
    const settings = structuredClone(defaults);
    settings.uiLanguage = "en";
    settings.theme = "dark";
    settings.polish.prompt = "  自定义 instructions\nKeep my spacing.\n";
    const parsed = settingsSchema.parse(settings);
    expect(parsed).toEqual(settings);
    expect(settingsSchema.parse(parsed)).toEqual(settings);
  });
  it.each(["", " \n ", "x".repeat(20001)])(
    "rejects empty or oversized templates",
    (prompt) => {
      expect(
        settingsSchema.safeParse({
          ...defaults,
          polish: { ...defaults.polish, prompt },
        }).success,
      ).toBe(false);
    },
  );
  it("substitutes dictionary content literally without appending hidden instructions", () => {
    expect(renderPolishPrompt("Only my rules", ["Example"], "en")).toBe(
      "Only my rules",
    );
    expect(
      renderPolishPrompt(
        "{{dictionary}} / {{dictionary}}",
        ["$&", "{{dictionary}}"],
        "en",
      ),
    ).toBe("$&, {{dictionary}} / $&, {{dictionary}}");
  });
  it.each(["gemini", "compatible"] as const)(
    "sends the edited prompt as the entire %s system instruction",
    async (provider) => {
      const settings = structuredClone(defaults);
      settings.polish.provider = provider;
      settings.polish.prompt =
        "Apply only these custom rules. Terms: {{dictionary}}";
      settings.uiLanguage = "en";
      settings.dictionary = ["FlowWhisper"];
      await polish(
        "Hello",
        settings,
        "test-key",
        new AbortController().signal,
        async (_url, init) => {
          const body = JSON.parse(String(init!.body));
          const expected = "Apply only these custom rules. Terms: FlowWhisper";
          if (provider === "gemini") {
            expect(body.systemInstruction.parts).toEqual([{ text: expected }]);
            expect(body.contents).toEqual([
              { role: "user", parts: [{ text: "Hello" }] },
            ]);
            return Response.json({
              candidates: [{ content: { parts: [{ text: "Hello." }] } }],
            });
          }
          expect(body.messages).toEqual([
            { role: "system", content: expected },
            { role: "user", content: "Hello" },
          ]);
          return Response.json({
            choices: [{ message: { content: "Hello." } }],
          });
        },
      );
    },
  );
});

describe("Interface localization", () => {
  it("interpolates user values without translating their content", () => {
    expect(translator("en")("删除 {word}", { word: "中文名称" })).toBe(
      "Delete 中文名称",
    );
    expect(
      translator("en")(
        "直接编辑完整提示词。{{dictionary}} 会替换为个人词典；不需要时可删除。",
      ),
    ).toContain("{{dictionary}}");
  });
  it("translates combined backend notices and preserves error codes", () => {
    const message =
      "润色未完成或结果未通过检查，已保留原文。 已复制到剪贴板，可粘贴到任意应用。";
    expect(localizeMessage(message, "en")).not.toMatch(/\p{Script=Han}/u);
    expect(
      localizeMessage("Gemini 连接中断 (1006)，已保留收到的文字。", "en"),
    ).toContain("1006");
    expect(localizeMessage(message, "zh-CN")).toBe(message);
  });
});
