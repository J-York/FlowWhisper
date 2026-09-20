import { _electron as electron, expect } from "@playwright/test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
mkdirSync("test-results", { recursive: true });
const profile = mkdtempSync(path.resolve("test-results/profile-"));
const nativeModule = path.resolve("test-results/native-test.cjs");
await build({
  entryPoints: ["electron/native.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: nativeModule,
  external: ["electron"],
});
const requests = [];
const server = createServer(async (req, res) => {
  const buffers = [];
  for await (const buffer of req) buffers.push(buffer);
  const body = Buffer.concat(buffers);
  requests.push({ url: req.url, body });
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/audio/transcriptions") {
    assert.ok(
      body.includes(Buffer.from("RIFF")),
      "audio upload must contain a WAV",
    );
    res.end(
      JSON.stringify({ text: "嗯，明天下午 3 点，我们一起讨论 FlowWhisper。" }),
    );
  } else if (req.url === "/v1/chat/completions")
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: "明天下午 3 点，我们一起讨论 FlowWhisper。" } },
        ],
      }),
    );
  else {
    res.statusCode = 404;
    res.end("{}");
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env, FLOWWHISPER_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let oldClipboard;
try {
  const executablePath = process.env.FLOWWHISPER_EXECUTABLE;
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(executablePath ? [] : ["."]),
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    env,
    timeout: 30000,
  });
  await expect
    .poll(() =>
      app
        .windows()
        .some(
          (page) =>
            page.url().includes("index.html") &&
            !page.url().includes("#overlay"),
        ),
    )
    .toBe(true);
  const page = app
    .windows()
    .find(
      (page) =>
        page.url().includes("index.html") && !page.url().includes("#overlay"),
    );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await expect(
    page.getByRole("heading", { name: "语音输入", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/home.png" });
  oldClipboard = await app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read();
    return Promise.all(
      items.map(async (item) => {
        const data = {};
        for (const type of item.types) {
          const value = await item.getType(type);
          data[type] =
            type === "electron application/bookmark"
              ? value
              : {
                  base64: Buffer.from(await value.arrayBuffer()).toString(
                    "base64",
                  ),
                  type: value.type,
                };
        }
        return data;
      }),
    );
  });
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(
    page
      .getByText("请先在模型服务中保存 Gemini API Key。", { exact: true })
      .first(),
  ).toBeVisible();
  for (const [name, heading] of [
    ["模型服务", "模型服务"],
    ["AI 润色", "AI 润色"],
    ["个人词典", "个人词典"],
    ["偏好设置", "偏好设置"],
    ["输入历史", "输入历史"],
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: new RegExp(heading) }).first(),
    ).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflows, false, `${name} has no horizontal overflow`);
    await page.screenshot({ path: `test-results/page-${name}.png` });
  }
  // Use an isolated shortcut so a normally running copy of the app does not
  // conflict with this profile's registration.
  await page.evaluate(async () => {
    const { settings } = await window.flow.bootstrap();
    await window.flow.saveSettings({ ...settings, hotkey: "Control+Alt+F10" });
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "偏好设置", exact: true })
    .click();
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (win) => !win.webContents.getURL().includes("#overlay"),
    );
    win.show();
    win.focus();
  });
  await page.getByRole("button", { name: "录制快捷键", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消录制" })).toBeVisible();
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("Control+Alt+F10"),
    ),
    false,
  );
  await page.keyboard.press("Control+Alt+J");
  await expect(page.getByLabel("当前快捷键")).toHaveText("Ctrl+Alt+J");
  assert.equal(
    (await page.evaluate(() => window.flow.bootstrap())).settings.hotkey,
    "Control+Alt+F10",
  );
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.flow.bootstrap())).settings.hotkey,
    )
    .toBe("Control+Alt+J");
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("Control+Alt+J"),
    ),
    true,
  );
  await page.getByRole("button", { name: "录制快捷键", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消录制" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("当前快捷键")).toHaveText("Ctrl+Alt+J");
  await expect(
    page.getByRole("button", { name: "录制快捷键", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "录制快捷键", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消录制" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("button", { name: "录制快捷键", exact: true }),
  ).toBeVisible();
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("Control+Alt+J"),
    ),
    true,
  );
  assert.equal(
    (await page.evaluate(() => window.flow.bootstrap())).state.phase,
    "error",
  ); // Initial missing-key test, no accidental recording.
  await page.screenshot({ path: "test-results/hotkey-recorder.png" });
  await page
    .locator("nav")
    .getByRole("button", { name: "个人词典", exact: true })
    .click();
  await page.getByRole("textbox", { name: "新词条" }).fill("FlowWhisper");
  await page.getByRole("button", { name: "添加词条" }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  const persisted = await page.evaluate(() => window.flow.bootstrap());
  assert.deepEqual(persisted.settings.dictionary, ["FlowWhisper"]);
  await page.evaluate(async (baseUrl) => {
    const { settings } = await window.flow.bootstrap();
    await window.flow.saveSettings(
      {
        ...settings,
        provider: "compatible",
        autoPaste: false,
        compatible: { baseUrl, model: "test-whisper" },
        polish: {
          ...settings.polish,
          enabled: true,
          provider: "compatible",
          baseUrl,
          model: "test-polish",
        },
      },
      { compatible: "smoke-test-secret-only" },
    );
  }, baseUrl);
  assert.ok(
    !readFileSync(path.join(profile, "secrets.enc")).includes(
      Buffer.from("smoke-test-secret-only"),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "开始录音", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(page.getByRole("heading", { name: "正在录音…" })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.flow.bootstrap().then((value) => value.state.level),
      ),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/recording.png" });
  const overlayPage = app
    .windows()
    .find((page) => page.url().includes("#overlay"));
  await expect(overlayPage.locator(".status-orb")).toBeVisible();
  assert.equal(
    await overlayPage.locator(".status-orb").evaluate((el) => el.textContent),
    "",
  );
  const orb = await overlayPage.locator(".status-orb").boundingBox();
  assert.equal(orb.width, 38);
  assert.equal(orb.height, 38);
  const overlayCapture = await app.evaluate(async ({ BrowserWindow }) => {
    const hud = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("#overlay"),
    );
    const shot = await hud.webContents.capturePage();
    return {
      bounds: hud.getBounds(),
      corner: Array.from(shot.toBitmap().subarray(0, 4)),
      png: shot.toPNG().toString("base64"),
    };
  });
  assert.equal(overlayCapture.bounds.width, 64);
  assert.equal(overlayCapture.bounds.height, 64);
  assert.deepEqual(overlayCapture.corner, [0, 0, 0, 0]);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    "test-results/recording-orb.png",
    Buffer.from(overlayCapture.png, "base64"),
  );
  await page.getByRole("button", { name: "结束录音", exact: true }).click();
  await expect(page.locator(".transcript-box")).toContainText(
    "明天下午 3 点，我们一起讨论 FlowWhisper。",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.flow.bootstrap().then((value) => value.state.phase),
      ),
    )
    .toBe("done");
  const result = await page.evaluate(() => window.flow.bootstrap());
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].polished, true);
  assert.ok(result.history[0].durationMs > 0);
  assert.equal(
    await app.evaluate(async ({ clipboard }) => clipboard.readText()),
    result.history[0].text,
  );
  assert.equal(
    requests.filter((item) => item.url.endsWith("/audio/transcriptions"))
      .length,
    1,
  );
  assert.equal(
    requests.filter((item) => item.url.endsWith("/chat/completions")).length,
    1,
  );
  await page.screenshot({ path: "test-results/completed.png" });
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(page.getByRole("heading", { name: "正在录音…" })).toBeVisible();
  await page
    .locator(".transcript-heading")
    .getByRole("button", { name: /取消/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.flow.bootstrap().then((value) => value.state.phase),
      ),
    )
    .toBe("idle");
  assert.equal(
    requests.filter((item) => item.url.endsWith("/audio/transcriptions"))
      .length,
    1,
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /^输入历史/ })
    .click();
  await page.getByRole("button", { name: "查看原始转写" }).click();
  await expect(page.locator("blockquote")).toContainText("嗯，");
  await page.getByRole("button", { name: "清空历史", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "清空历史", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "还没有输入记录" }),
  ).toBeVisible();
  if (process.platform === "win32") {
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = new BrowserWindow({ width: 500, height: 260, show: true });
      await win.loadURL(
        'data:text/html,<title>FlowWhisper input test</title><textarea id="target" style="width:95%;height:150px" autofocus></textarea>',
      );
      win.focus();
    });
    const targetPage = app
      .windows()
      .find((item) => item.url().startsWith("data:text/html"));
    await targetPage.locator("#target").click();
    const nativeResult = await app.evaluate(
      async ({ clipboard, BrowserWindow }, modulePath) => {
        const native = process
          .getBuiltinModule("module")
          .createRequire(modulePath)(modulePath);
        const targetWindow = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().startsWith("data:text/html"),
        );
        targetWindow.setAlwaysOnTop(true);
        targetWindow.show();
        targetWindow.focus();
        const handle = targetWindow.getNativeWindowHandle();
        const target = (
          handle.length === 8
            ? handle.readBigUInt64LE()
            : BigInt(handle.readUInt32LE())
        ).toString();
        const focused = await native.foreground();
        await clipboard.writeText("FlowWhisper original clipboard");
        const message = await native.deliver(
          "跨平台语音输入测试。",
          target,
          new AbortController().signal,
        );
        return {
          message,
          clipboard: await clipboard.readText(),
          target,
          focused,
        };
      },
      nativeModule,
    );
    const pasted = nativeResult.message.includes("已发送粘贴");
    if (pasted) {
      await expect(targetPage.locator("#target")).toHaveValue(
        "跨平台语音输入测试。",
      );
      assert.equal(nativeResult.clipboard, "FlowWhisper original clipboard");
      console.log("Native paste into a focused Windows textarea passed.");
    } else {
      assert.match(nativeResult.message, /请手动粘贴/);
      assert.equal(nativeResult.clipboard, "跨平台语音输入测试。");
      await expect(targetPage.locator("#target")).toHaveValue("");
      console.log(
        "Windows denied foreground activation; guarded fallback passed. Real paste requires a focused test window.",
      );
    }
    const restored = await app.evaluate(
      async ({ clipboard, ClipboardItem }, modulePath) => {
        const native = process
          .getBuiltinModule("module")
          .createRequire(modulePath)(modulePath);
        await clipboard.write([
          new ClipboardItem({
            "text/plain": "original",
            "text/html": "<b>original</b>",
          }),
        ]);
        const message = await native.deliver(
          "synthetic-paste",
          "0",
          new AbortController().signal,
          async () => true,
        );
        const items = await clipboard.read();
        return {
          message,
          text: await clipboard.readText(),
          html: await (await items[0].getType("text/html")).text(),
        };
      },
      nativeModule,
    );
    assert.match(restored.message, /已恢复/);
    assert.equal(restored.text, "original");
    assert.ok(restored.html.includes("<b>original</b>"));
    const refused = await app.evaluate(async ({ clipboard }, modulePath) => {
      const native = process
        .getBuiltinModule("module")
        .createRequire(modulePath)(modulePath);
      return {
        message: await native.deliver(
          "只复制，不输入。",
          "0",
          new AbortController().signal,
        ),
        clipboard: await clipboard.readText(),
      };
    }, nativeModule);
    assert.match(refused.message, /请手动粘贴/);
    assert.equal(refused.clipboard, "只复制，不输入。");
    assert.equal(
      await targetPage.locator("#target").inputValue(),
      pasted ? "跨平台语音输入测试。" : "",
    );
    await targetPage.close();
  }
  assert.deepEqual(errors, [], "renderer should have no errors");
  console.log(
    "Desktop smoke passed: 6 pages, shortcut recording/cancel/blur recovery, transparent 38px orb, encrypted credentials, real AudioWorklet PCM, WAV upload, polishing, clipboard, history, cancel, Windows guarded paste and clipboard restore.",
  );
} finally {
  if (app && oldClipboard)
    await app
      .evaluate(async ({ clipboard, ClipboardItem }, items) => {
        await clipboard.write(
          items.map(
            (data) =>
              new ClipboardItem(
                Object.fromEntries(
                  Object.entries(data).map(([type, value]) => [
                    type,
                    type === "electron application/bookmark"
                      ? value
                      : new Blob([Buffer.from(value.base64, "base64")], {
                          type: value.type,
                        }),
                  ]),
                ),
              ),
          ),
        );
      }, oldClipboard)
      .catch(() => {});
  if (app) await app.close();
  server.close();
}
