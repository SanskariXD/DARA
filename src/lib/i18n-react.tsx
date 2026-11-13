"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  formatAppDate,
  getTranslator,
  translateFieldLabel,
  translateMessage,
  translateOptionLabel,
  type AppLanguage,
} from "./i18n";

const LanguageContext = createContext<AppLanguage>("en");
export function LanguageProvider({
  language,
  children,
}: {
  language: AppLanguage;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const language = useContext(LanguageContext);
  return useMemo(
    () => ({
      language,
      t: getTranslator(language),
      message: (
        source: string,
        field?: Parameters<typeof translateFieldLabel>[1],
      ) => translateMessage(language, source, field),
      fieldLabel: (field: Parameters<typeof translateFieldLabel>[1]) =>
        translateFieldLabel(language, field),
      optionLabel: (
        field: Parameters<typeof translateOptionLabel>[1],
        option: Parameters<typeof translateOptionLabel>[2],
      ) => translateOptionLabel(language, field, option),
      formatDate: (value: string, options?: Intl.DateTimeFormatOptions) =>
        formatAppDate(language, value, options),
    }),
    [language],
  );
}
