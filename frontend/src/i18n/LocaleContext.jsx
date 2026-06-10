import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from './translations';

/* Centralised locale state — mirrors ThemeContext.
   - Source of truth is `<html lang>` + `<html dir>` (set pre-paint by inline
     script in index.html to avoid a flash), mirrored in React state.
   - Persisted under `locale`; default 'en'.
   - `t(key)` returns the active language string, falling back to English,
     then to the key itself — so wrapping existing English text is safe even
     before its Arabic translation is added. */

const STORAGE_KEY = 'locale';
const LocaleContext = createContext({ locale: 'en', setLocale: () => {}, toggleLocale: () => {}, t: (k) => k });

function getInitialLocale() {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'ar' ? 'ar' : 'en';
  } catch { return 'en'; }
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
  }, [locale]);

  const setLocale = useCallback((l) => setLocaleState(l === 'ar' ? 'ar' : 'en'), []);
  const toggleLocale = useCallback(() => setLocaleState(l => (l === 'ar' ? 'en' : 'ar')), []);

  const t = useCallback((key, fallback) => {
    const dict = translations[locale] || {};
    if (key in dict) return dict[key];
    return fallback ?? key;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, toggleLocale, t }), [locale, setLocale, toggleLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useLocale().t;
}

/* Reusable language-toggle button — drop into any header.
   Shows the OPPOSITE language's label, so a user always sees what they'd
   switch to. Compact (2-3 chars) so it sits next to the theme toggle. */
export function LocaleToggle({ className = '' }) {
  const { locale, toggleLocale } = useLocale();
  const isAr = locale === 'ar';
  return (
    <button
      type="button"
      onClick={toggleLocale}
      title={isAr ? 'Switch to English' : 'تبديل إلى العربية'}
      aria-label="Toggle language"
      className={className}
    >
      <span className="text-[13px] font-bold">{isAr ? 'EN' : 'ع'}</span>
    </button>
  );
}
