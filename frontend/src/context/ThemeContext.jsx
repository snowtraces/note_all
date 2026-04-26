import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'note_all_theme';
const MODE_KEY = 'note_all_mode';

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

  // 应用主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', mode);
  }, [theme, mode]);

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

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, toggleMode, themes: THEMES, modes: MODES }}>
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