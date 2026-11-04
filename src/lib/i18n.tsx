import { cloneElement, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { DICT } from './i18n/translations';

export type Lang = 'hi' | 'en';
const LS_KEY = 'kg_lang';

let currentLang: Lang = 'hi';
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY) === 'en') currentLang = 'en';
} catch {
  /* ignore */
}

/** Plain (hook-free) translator — safe to call from any module, including .ts helpers.
 *  In 'hi' mode (the default) the original string is returned untouched, so every
 *  string in the codebase stays valid Hindi until explicitly wrapped. */
export function t(s: string): string {
  return currentLang === 'en' ? DICT[s] ?? s : s;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx>({ lang: 'hi', setLang: () => undefined });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    setLangState(l);
    try {
      localStorage.setItem(LS_KEY, l);
    } catch {
      /* private mode — ignore */
    }
  }, []);

  // keep <html lang> in sync for screen readers
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LangCtx>(() => ({ lang, setLang }), [lang, setLang]);

  // cloneElement forces the whole subtree to re-render when the language
  // changes (every component calls the plain t() during render, so a full
  // re-render is the only way they all pick up the new language). No state
  // is lost — same element types, only new instances.
  return (
    <Ctx.Provider value={value}>
      {cloneElement(children as ReactElement)}
    </Ctx.Provider>
  );
}

export function useLang() {
  return useContext(Ctx);
}

/** Small header button: shows the language you can switch TO.
 *  In Hindi mode it says "EN", in English mode it says "हिं". */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  const next: Lang = lang === 'hi' ? 'en' : 'hi';
  return (
    <button
      onClick={() => setLang(next)}
      className={`rounded-xl border border-line bg-white px-2.5 py-2 text-xs font-bold tracking-wide hover:bg-cream ${className}`}
      aria-label={lang === 'hi' ? 'Switch to English' : 'हिंदी में पढ़ें'}
      title={lang === 'hi' ? 'Read in English' : 'हिंदी में पढ़ें'}
    >
      {next === 'en' ? 'EN' : 'हिं'}
    </button>
  );
}
