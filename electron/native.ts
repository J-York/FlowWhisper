import { clipboard, ClipboardItem, systemPreferences } from "electron";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
const exec = promisify(execFile);
const windowsDefinitions = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FlowNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@\n`;
async function powershell(script: string) {
  return (
    await exec(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, timeout: 8000, maxBuffer: 8192 },
    )
  ).stdout.trim();
}
export async function foreground(): Promise<string | null> {
  try {
    if (process.platform === "win32")
      return await powershell(
        `${windowsDefinitions}[FlowNative]::GetForegroundWindow().ToInt64().ToString()`,
      );
    if (process.platform === "darwin")
      return (
        await exec(
          "/usr/bin/osascript",
          [
            "-e",
            'tell application "System Events" to get unix id of first process whose frontmost is true',
          ],
          { timeout: 4000 },
        )
      ).stdout.trim();
  } catch {
    /* A failed focus query must never permit blind insertion. */
  }
  return null;
}
async function guardedPaste(target: string): Promise<boolean> {
  if (!/^\d+$/.test(target)) return false;
  if (process.platform === "win32") {
    const script = `${windowsDefinitions}
$deadline = [DateTime]::UtcNow.AddSeconds(2)
while (([FlowNative]::GetAsyncKeyState(17) -lt 0 -or [FlowNative]::GetAsyncKeyState(16) -lt 0 -or [FlowNative]::GetAsyncKeyState(18) -lt 0 -or [FlowNative]::GetAsyncKeyState(91) -lt 0) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 25 }
if ([DateTime]::UtcNow -ge $deadline) { Write-Output 'blocked'; exit }
if ([FlowNative]::GetForegroundWindow().ToInt64() -ne ${target}) { Write-Output 'changed'; exit }
[FlowNative]::keybd_event(17, 0, 0, [UIntPtr]::Zero)
[FlowNative]::keybd_event(86, 0, 0, [UIntPtr]::Zero)
[FlowNative]::keybd_event(86, 0, 2, [UIntPtr]::Zero)
[FlowNative]::keybd_event(17, 0, 2, [UIntPtr]::Zero)
Write-Output 'pasted'`;
    return (await powershell(script)) === "pasted";
  }
  if (process.platform === "darwin") {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) return false;
    const script = `tell application "System Events"
if (unix id of first process whose frontmost is true) is ${target} then
keystroke "v" using command down
return "pasted"
end if
end tell`;
    return (
      (
        await exec("/usr/bin/osascript", ["-e", script], { timeout: 5000 })
      ).stdout.trim() === "pasted"
    );
  }
  return false;
}
export async function deliver(
  text: string,
  target: string | null,
  signal: AbortSignal,
  paste = guardedPaste,
): Promise<string> {
  if (signal.aborted) return "已取消";
  if (!target) {
    await clipboard.writeText(text);
    return "已复制到剪贴板，可粘贴到任意应用。";
  }
  // Electron 44 read items are read-only. Materialize payloads into writable items before changing the clipboard.
  let original: Electron.ClipboardItem[];
  try {
    original = await Promise.all(
      (await clipboard.read()).map(
        async (item) =>
          new ClipboardItem(
            Object.fromEntries(
              await Promise.all(
                item.types.map(async (type) => [
                  type,
                  await item.getType(type),
                ]),
              ),
            ),
          ),
      ),
    );
  } catch {
    if (signal.aborted) return "已取消";
    await clipboard.writeText(text);
    return "文字已复制；无法备份原剪贴板，请手动粘贴。";
  }
  if (signal.aborted) return "已取消";
  const markerType = "web application/x-flowwhisper-session";
  const marker = randomUUID();
  await clipboard.write([
    new ClipboardItem({ "text/plain": text, [markerType]: marker }),
  ]);
  try {
    if (signal.aborted || !(await paste(target)))
      return "文字已复制；目标窗口已改变或无法自动输入，请手动粘贴。";
    await delay(500);
    // Never overwrite a newer clipboard entry created by the user or another app.
    try {
      const current = await clipboard.read();
      const marked = current.find((item) => item.types.includes(markerType));
      if (
        marked &&
        (await ((await marked.getType(markerType)) as Blob).text()) ===
          marker &&
        (await clipboard.readText()) === text
      ) {
        await clipboard.write(original);
        return "已发送粘贴快捷键，原剪贴板已恢复。";
      }
      return "已发送粘贴快捷键。";
    } catch {
      return "已发送粘贴快捷键，但未能恢复原剪贴板。";
    }
  } catch {
    return "文字已复制，自动输入不可用，请手动粘贴。";
  }
}
