export interface KeyStroke {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}
export function recordedHotkey(event: KeyStroke, mac: boolean): string | null {
  if (event.repeat || event.isComposing || event.key === "Escape") return null;
  const aliases: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
  };
  const key =
    aliases[event.code] ??
    (/^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3)
      : /^Digit[0-9]$/.test(event.code)
        ? event.code.slice(5)
        : /^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)
          ? event.code
          : null);
  if (!key || !(event.ctrlKey || event.altKey || event.metaKey)) return null;
  return [
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && (mac ? "Command" : "Super"),
    key,
  ]
    .filter(Boolean)
    .join("+");
}
