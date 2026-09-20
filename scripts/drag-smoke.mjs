import { _electron as electron, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import assert from "node:assert/strict";
if (process.platform !== "win32")
  throw new Error("Native mouse drag test requires Windows.");
mkdirSync("test-results", { recursive: true });
const profile = mkdtempSync(path.resolve("test-results/drag-profile-"));
const env = { ...process.env, FLOWWHISPER_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.FLOWWHISPER_EXECUTABLE;
const launch = () =>
  electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [] : ["."],
    env,
  });
let app;
async function start() {
  app = await launch();
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
  await page.evaluate(async () => {
    const { settings } = await window.flow.bootstrap();
    await window.flow.saveSettings({
      ...settings,
      provider: "compatible",
      autoPaste: false,
      hotkey: "Control+Alt+F11",
    });
    await window.flow.start(); // Exercise the session state without opening a microphone or contacting a model.
  });
  await expect.poll(() => bounds().then((value) => value.visible)).toBe(true);
  const hudPage = app.windows().find((page) => page.url().includes("#overlay"));
  await expect(hudPage.locator(".status-orb")).toHaveCSS("cursor", "grab");
  await hudPage.screenshot({ path: "test-results/draggable-orb.png" });
  return page;
}
function bounds() {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const hud = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("#overlay"),
    );
    const bounds = hud.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return {
      ...bounds,
      visible: hud.isVisible(),
      focused: hud.isFocused(),
      area,
      pid: process.pid,
    };
  });
}
try {
  let page = await start();
  const before = await bounds();
  const coordinates = await app.evaluate(
    ({ screen }, b) => ({
      start: screen.dipToScreenPoint({ x: b.x + 32, y: b.y + 32 }),
      end: screen.dipToScreenPoint({
        x: b.area.x + Math.round(b.area.width / 2),
        y: b.area.y + Math.round(b.area.height / 3),
      }),
    }),
    before,
  );
  const source = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DragTest {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
$old = New-Object DragTest+POINT
[void][DragTest]::GetCursorPos([ref]$old)
$before = [DragTest]::GetForegroundWindow().ToInt64()
try {
 [void][DragTest]::SetCursorPos(${coordinates.start.x},${coordinates.start.y})
 $actual = New-Object DragTest+POINT
 [void][DragTest]::GetCursorPos([ref]$actual)
 $hitPid = [uint32]0
 [void][DragTest]::GetWindowThreadProcessId([DragTest]::WindowFromPoint($actual), [ref]$hitPid)
 Start-Sleep -Milliseconds 150
 [DragTest]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 100
 for($i=1;$i -le 10;$i++) {
  [void][DragTest]::SetCursorPos([int](${coordinates.start.x}+(${coordinates.end.x}-${coordinates.start.x})*$i/10),[int](${coordinates.start.y}+(${coordinates.end.y}-${coordinates.start.y})*$i/10))
  Start-Sleep -Milliseconds 45
 }
} finally {
 [DragTest]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 150
 [void][DragTest]::SetCursorPos($old.X,$old.Y)
}
@{ before=$before; after=[DragTest]::GetForegroundWindow().ToInt64(); hitPid=$hitPid; actualX=$actual.X; actualY=$actual.Y } | ConvertTo-Json -Compress`;
  const native = await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(source, "utf16le").toString("base64"),
    ],
    { windowsHide: true, timeout: 15000 },
  );
  const focus = JSON.parse(native.stdout.trim());
  assert.equal(focus.after, focus.before, "drag must not steal keyboard focus");
  const moved = await bounds();
  assert.ok(
    Math.abs(moved.x - before.x) > 30,
    "native mouse drag must move the orb",
  );
  assert.equal(moved.focused, false);
  const expectedPosition = { x: moved.x, y: moved.y };
  await expect
    .poll(() => {
      try {
        return JSON.parse(
          readFileSync(path.join(profile, "window-state.json"), "utf8"),
        );
      } catch {
        return null;
      }
    })
    .toEqual(expectedPosition);
  await page.evaluate(async () => {
    const { state } = await window.flow.bootstrap();
    for (let i = 0; i < 10; i++)
      window.flow.audio(state.id, new ArrayBuffer(3200), 0.4);
  });
  const updated = await bounds();
  assert.deepEqual(
    { x: updated.x, y: updated.y },
    expectedPosition,
    "stream updates must not reset the drag",
  );
  await page.evaluate(async () => {
    await window.flow.cancel();
    await window.flow.start();
  });
  const reopened = await bounds();
  assert.deepEqual({ x: reopened.x, y: reopened.y }, expectedPosition);
  await app.close();
  app = undefined;
  page = await start();
  const restarted = await bounds();
  assert.deepEqual(
    { x: restarted.x, y: restarted.y },
    expectedPosition,
    "position survives app restart",
  );
  await app.close();
  app = undefined;
  writeFileSync(
    path.join(profile, "window-state.json"),
    JSON.stringify({ x: 999999, y: -999999 }),
  );
  await start();
  const recovered = await bounds();
  assert.ok(recovered.x >= recovered.area.x && recovered.y >= recovered.area.y);
  assert.ok(
    recovered.x + 64 <= recovered.area.x + recovered.area.width &&
      recovered.y + 64 <= recovered.area.y + recovered.area.height,
  );
  console.log(
    "Native drag passed: mouse drag, no focus theft, no reset during stream, persistence across sessions/restart, off-screen recovery.",
  );
  writeFileSync(
    "test-results/drag-verification.json",
    JSON.stringify(
      { before, moved, restarted, recovered, focusPreserved: true },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
}
