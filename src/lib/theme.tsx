'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Mode = 'light' | 'dark';
export type Pref = Mode | 'system';

const KEY = 'visby-theme';

type Ctx = { mode: Mode; pref: Pref; setPref: (p: Pref) => void; toggle: () => void };
const ThemeCtx = createContext<Ctx>({ mode: 'light', pref: 'system', setPref: () => {}, toggle: () => {} });

// Runs before paint (injected in <head>) so there is no flash of the wrong theme.
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var m=(p==='light'||p==='dark')?p:(d?'dark':'light');document.documentElement.dataset.theme=m;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<Pref>('system');
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') setPrefState(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const m: Mode = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
      setMode(m);
      document.documentElement.dataset.theme = m;
    };
    apply();
    if (pref === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [pref]);

  const setPref = useCallback((p: Pref) => {
    setPrefState(p);
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  }, []);

  const toggle = useCallback(() => setPref(mode === 'dark' ? 'light' : 'dark'), [mode, setPref]);

  return <ThemeCtx.Provider value={{ mode, pref, setPref, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

export function ThemeToggle({ size = 38 }: { size?: number }) {
  const { mode, toggle } = useTheme();
  const dark = mode === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: size, height: size, borderRadius: 'var(--pill)',
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'var(--glass-inner)', color: 'var(--text)',
        transition: 'transform .3s var(--ease), background .3s var(--ease)',
      }}
    >
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
