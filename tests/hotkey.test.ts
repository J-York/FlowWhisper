import { expect, it } from "vitest";
import { recordedHotkey, type KeyStroke } from "../shared/hotkey";
const stroke = (value: Partial<KeyStroke>): KeyStroke => ({
  code: "KeyA",
  key: "a",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...value,
});
it("records Windows and macOS modifiers and physical letter keys under IME", () => {
  expect(
    recordedHotkey(
      stroke({ code: "Space", key: " ", ctrlKey: true, shiftKey: true }),
      false,
    ),
  ).toBe("Control+Shift+Space");
  expect(
    recordedHotkey(
      stroke({ code: "KeyJ", key: "Process", metaKey: true, altKey: true }),
      true,
    ),
  ).toBe("Alt+Command+J");
  expect(
    recordedHotkey(stroke({ code: "F8", key: "F8", metaKey: true }), false),
  ).toBe("Super+F8");
});
it("ignores modifiers, repeats, composition, bare keys and reserved Escape", () => {
  for (const value of [
    {},
    { shiftKey: true },
    { ctrlKey: true, repeat: true },
    { ctrlKey: true, isComposing: true },
    { ctrlKey: true, code: "ControlLeft", key: "Control" },
    { ctrlKey: true, code: "Escape", key: "Escape" },
  ])
    expect(recordedHotkey(stroke(value), false)).toBeNull();
});
