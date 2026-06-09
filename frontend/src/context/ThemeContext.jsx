import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'note_all_theme';
const MODE_KEY = 'note_all_mode';
const TYPOGRAPHY_KEY = 'note_all_typography';
const CUSTOM_TYPOGRAPHY_KEY = 'note_all_custom_typography';

const DEFAULT_TYPOGRAPHY = {
  fontSize: 16,
  lineHeight: 1.8,
  pMargin: 0.8,
  headingSpacing: 1.0,
};

const COMPACT_TYPOGRAPHY = {
  fontSize: 14,
  lineHeight: 1.5,
  pMargin: 0.4,
  headingSpacing: 0.6,
};

const THEMES = [
  { id: 'cyber', name: '赛博朋克', accent: '#66fcf1', description: '青色系，科技感' },
  { id: 'blue', name: '午夜蓝调', accent: '#3b82f6', description: '蓝色系，专业沉稳' },
  { id: 'forest', name: '森林绿意', accent: '#10b981', description: '绿色系，自然护眼' },
];

const MODES = [
  { id: 'dark', name: '暗色' },
  { id: 'light', name: '亮色' },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved || 'cyber';
  });

  const [mode, setModeState] = useState(() => {
    const saved = localStorage.getItem(MODE_KEY);
    return saved || 'light';
  });

  const [typography, setTypographyState] = useState(() => {
    const saved = localStorage.getItem(TYPOGRAPHY_KEY);
    return saved || 'default';
  });

  const [customTypography, setCustomTypographyState] = useState(() => {
    const saved = localStorage.getItem(CUSTOM_TYPOGRAPHY_KEY);
    try {
      return saved ? JSON.parse(saved) : DEFAULT_TYPOGRAPHY;
    } catch {
      return DEFAULT_TYPOGRAPHY;
    }
  });

  // 应用主题和排版到 DOM
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', mode);

    let config = DEFAULT_TYPOGRAPHY;
    if (typography === 'compact') {
      config = COMPACT_TYPOGRAPHY;
    } else if (typography === 'custom') {
      config = { ...DEFAULT_TYPOGRAPHY, ...customTypography };
    }

    root.style.setProperty('--note-font-size', `${config.fontSize}px`);
    root.style.setProperty('--note-line-height', `${config.lineHeight}`);
    root.style.setProperty('--note-p-margin', `${config.pMargin}em`);

    const h1Top = (1.2 * config.headingSpacing).toFixed(2);
    const h1Bottom = (0.6 * config.headingSpacing).toFixed(2);
    const h2Top = (1.0 * config.headingSpacing).toFixed(2);
    const h2Bottom = (0.4 * config.headingSpacing).toFixed(2);
    const h3Top = (0.8 * config.headingSpacing).toFixed(2);
    const h3Bottom = (0.3 * config.headingSpacing).toFixed(2);

    root.style.setProperty('--note-h1-margin', `${h1Top}em 0 ${h1Bottom}em`);
    root.style.setProperty('--note-h2-margin', `${h2Top}em 0 ${h2Bottom}em`);
    root.style.setProperty('--note-h3-margin', `${h3Top}em 0 ${h3Bottom}em`);
  }, [theme, mode, typography, customTypography]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  };

  const setMode = (newMode) => {
    setModeState(newMode);
    localStorage.setItem(MODE_KEY, newMode);
  };

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const setTypography = (newTypography) => {
    setTypographyState(newTypography);
    localStorage.setItem(TYPOGRAPHY_KEY, newTypography);
  };

  const setCustomTypography = (updater) => {
    setCustomTypographyState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem(CUSTOM_TYPOGRAPHY_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      mode,
      setTheme,
      setMode,
      toggleMode,
      themes: THEMES,
      modes: MODES,
      typography,
      setTypography,
      customTypography,
      setCustomTypography,
      defaultTypography: DEFAULT_TYPOGRAPHY,
      compactTypography: COMPACT_TYPOGRAPHY
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { THEMES, MODES };