import { createContext, useContext, useMemo } from "react";
import { translator } from "../shared/i18n";
import type { UiLanguage } from "../shared/polish-prompt";

export const LocaleContext = createContext<UiLanguage>("zh-CN");
export function useTranslation() {
  const language = useContext(LocaleContext);
  return useMemo(() => translator(language), [language]);
}
