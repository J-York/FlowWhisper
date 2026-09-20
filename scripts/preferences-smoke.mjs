import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";

mkdirSync("test-results", { recursive: true });
const defaultsModule = path.resolve("test-results/defaults-test.cjs");
await build({
  entryPoints: ["shared/types.ts"],
  outfile: defaultsModule,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { defaults } = createRequire(import.meta.url)(defaultsModule);
const profile = mkdtempSync(path.resolve("test-results/preferences-profile-"));
const legacy = structuredClone(defaults);
delete legacy.theme;
delete legacy.uiLanguage;
delete legacy.polish.prompt;
legacy.polish.instruction = "Keep technical terms unchanged.";
legacy.hotkey = "Control+Alt+F12";
writeFileSync(path.join(profile, "settings.json"), JSON.stringify(legacy));
const env = { ...process.env, FLOWWHISPER_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.FLOWWHISPER_EXECUTABLE;
let app;
let page;
const errors = [];
const checks = [];
async function launch() {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [] : ["."],
    env,
  });
  await expect
    .poll(() =>
      app
        .windows()
        .some(
          (p) =>
            p.url().includes("index.html") && !p.url().includes("#overlay"),
        ),
    )
    .toBe(true);
  page = app
    .windows()
    .find(
      (p) => p.url().includes("index.html") && !p.url().includes("#overlay"),
    );
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator("h1")).toBeVisible();
}
async function navigate(name) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
  await expect(page.locator("h1")).toBeVisible();
}
async function size(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("#overlay"))
        .setContentSize(width, height);
    },
    [width, height],
  );
}
try {
  await launch();
  await navigate("AI 润色");
  const editor = page.getByRole("textbox", { name: "系统提示词" });
  await expect(editor).toHaveValue(/Keep technical terms unchanged/);
  const migrated = await editor.inputValue();
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await page.getByRole("button", { name: "保留当前提示词" }).click();
  await expect(editor).toHaveValue(migrated);
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await page.getByRole("button", { name: "替换提示词" }).click();
  await expect(editor).toHaveValue(defaults.polish.prompt);
  await page.getByRole("button", { name: "专业沟通", exact: true }).click();
  await expect(editor).toHaveValue(/专业、清楚、有礼貌/);
  const custom =
    "Keep my complete custom system prompt.\nUse {{dictionary}} only for spelling.";
  await editor.fill(custom);
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("设置已保存");

  await navigate("偏好设置");
  await page.getByLabel("主题", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await expect(page.locator("h1")).toHaveText("Preferences");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("Settings saved");
  const saved = await page.evaluate(() => window.flow.bootstrap());
  assert.equal(saved.settings.polish.prompt, custom);
  assert.equal(
    saved.settings.language,
    defaults.language,
    "UI language must not change speech language",
  );
  assert.equal(
    await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
    "dark",
  );
  const orb = app.windows().find((p) => p.url().includes("#overlay"));
  await expect(orb.locator("html")).toHaveAttribute("lang", "en");
  await expect(orb.locator("html")).toHaveAttribute("data-theme", "dark");

  for (const theme of ["dark", "light"]) {
    await navigate("Preferences");
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const width of [1180, 900]) {
      await size(width, 760);
      for (const name of [
        "Voice input",
        "Providers",
        "AI polish",
        "Dictionary",
        "Preferences",
        "History",
      ]) {
        await navigate(name);
        await expect(page.locator("h1")).toHaveText(name);
        const metrics = await page
          .locator(".app-shell")
          .evaluate((el) => ({
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
          }));
        assert.ok(
          metrics.scrollWidth <= metrics.width,
          `${name}, ${theme}, ${width}: no horizontal overflow`,
        );
        let text = (await page.locator("main").innerText()).replaceAll(
          "简体中文",
          "",
        );
        if (name === "Preferences") {
          // OS-provided device names retain their original language.
          for (const device of await page
            .getByRole("combobox", { name: /^Input device/ })
            .locator("option")
            .allTextContents())
            text = text.replaceAll(device, "");
        }
        assert.doesNotMatch(
          text,
          /\p{Script=Han}/u,
          `${name}: English UI has no untranslated Chinese`,
        );
        if (theme === "dark")
          assert.equal(
            await page
              .locator(".app-shell")
              .evaluate((el) => getComputedStyle(el).backgroundColor),
            "rgb(21, 28, 24)",
          );
        await page.screenshot({
          path: `test-results/preferences-${theme}-${width}-${name.replaceAll(" ", "-")}.png`,
          animations: "disabled",
        });
        checks.push({ theme, width, page: name, overflow: false });
      }
    }
  }

  // Fit the collapsed page, then expand real notes to trigger a scrollbar.
  await navigate("AI polish");
  await size(1180, 1300);
  const contentHeight = await page
    .locator(".page-content")
    .evaluate((el) => el.getBoundingClientRect().height);
  await size(1180, Math.ceil(contentHeight + 1));
  const before = await page.locator(".prompt-editor").boundingBox();
  const collapsed = await page
    .locator(".app-shell")
    .evaluate((el) => ({
      overflowing: el.scrollHeight > el.clientHeight,
      width: el.clientWidth,
    }));
  assert.equal(
    collapsed.overflowing,
    false,
    "collapsed page fits before expansion",
  );
  await page.getByText("Polish notes", { exact: true }).click();
  const expanded = await page
    .locator(".app-shell")
    .evaluate((el) => ({
      overflowing: el.scrollHeight > el.clientHeight,
      width: el.clientWidth,
    }));
  const after = await page.locator(".prompt-editor").boundingBox();
  assert.equal(
    expanded.overflowing,
    true,
    "expansion must actually create vertical overflow",
  );
  assert.equal(expanded.width, collapsed.width);
  assert.equal(after.x, before.x);
  assert.equal(
    after.width,
    before.width,
    "scrollbar must not shrink the prompt editor",
  );
  checks.push({
    scrollbar: {
      collapsed,
      expanded,
      stableX: before.x,
      stableWidth: before.width,
    },
  });
  await page.getByText("Polish notes", { exact: true }).click();

  await navigate("Preferences");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe("system");
  const darkSystem = await app.evaluate(
    ({ nativeTheme }) => nativeTheme.shouldUseDarkColors,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    darkSystem ? "dark" : "light",
  );
  for (const theme of ["light", "dark"]) {
    // Simulate native appearance updates inside this isolated Electron app.
    await app.evaluate(({ nativeTheme }, theme) => {
      nativeTheme.themeSource = theme;
    }, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(orb.locator("html")).toHaveAttribute("data-theme", theme);
  }
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "system";
  });
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("Settings saved");
  await app.close();
  await launch();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await navigate("AI polish");
  await expect(
    page.getByRole("textbox", { name: "System prompt" }),
  ).toHaveValue(custom);
  await page
    .getByRole("button", { name: "Restore default", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace prompt", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "System prompt" }),
  ).toHaveValue(/You are a text editor/);
  assert.deepEqual(errors, []);
  writeFileSync(
    "test-results/preferences-verification.json",
    JSON.stringify(checks, null, 2),
  );
  console.log(
    "Preferences smoke passed: legacy migration, prompt editing/restoration, 24 English page/theme/size combinations, stable scrollbar expansion, system theme, overlay sync and full restart persistence.",
  );
} finally {
  await app?.close();
}
