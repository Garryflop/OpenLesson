import clsx from "clsx";
import { LANG_LABELS, LANGS, useI18n } from "../i18n";

/** KZ / RU / EN segmented switch; the choice is remembered on this device and in the user profile. */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.common.lang.label} className={clsx("inline-flex rounded-full bg-gray-900/5 p-0.5 text-xs font-semibold", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          title={t.common.lang[l]}
          onClick={() => lang !== l && setLang(l)}
          className={clsx(
            "min-w-9 rounded-full px-2.5 py-1 transition",
            lang === l ? "bg-white text-gray-900 shadow-card" : "text-gray-500 hover:text-gray-900",
          )}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
