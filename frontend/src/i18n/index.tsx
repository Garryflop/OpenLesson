/**
 * Interface language (KK / RU / EN).
 *
 * Messages are typed dictionaries (`ru/*.ts` is the source, `en/*.ts` must match its shape), read as
 * `const { t } = useI18n(); t.schedule.title`. Switching the language remounts the routed app, so
 * helpers that read the dictionary outside React (`msgs()`, `lib/format.ts`) are always current.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { kk } from "./kk";
import { ru, type Messages } from "./ru";

export type Lang = "kk" | "ru" | "en";
/** Order of the switch: Kazakh (state language), Russian, English. */
export const LANGS: Lang[] = ["kk", "ru", "en"];
/** Short labels for the switch. */
export const LANG_LABELS: Record<Lang, string> = { kk: "KZ", ru: "RU", en: "EN" };
/** BCP 47 tags for Intl / toLocale*String. */
export const LOCALES: Record<Lang, string> = { kk: "kk-KZ", ru: "ru-RU", en: "en-GB" };

const STORAGE_KEY = "ol.lang";
const DICTS: Record<Lang, Messages> = { kk, ru, en };

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "ru" || v === "en" || v === "kk" ? v : null;
  } catch {
    return null;
  }
}

function detect(): Lang {
  const nav = navigator.language?.toLowerCase() ?? "";
  return readStored() ?? (nav.startsWith("en") ? "en" : nav.startsWith("kk") || nav.startsWith("kz") ? "kk" : "ru");
}

let current: Lang = detect();

/** Current language outside React (API client, formatters). */
export function getLang(): Lang {
  return current;
}

/** Current dictionary outside React components. */
export function msgs(): Messages {
  return DICTS[current];
}

/** True when the user picked a language explicitly on this device. */
export function hasStoredLang(): boolean {
  return readStored() !== null;
}

type Ctx = { lang: Lang; t: Messages; setLang: (lang: Lang, opts?: { remember?: boolean }) => void };
const I18nContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(current);

  const setLang = useCallback((next: Lang, opts: { remember?: boolean } = {}) => {
    current = next;
    if (opts.remember !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable — keep for this session only */
      }
    }
    setState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LangProvider>");
  return ctx;
}

export type { Messages };
