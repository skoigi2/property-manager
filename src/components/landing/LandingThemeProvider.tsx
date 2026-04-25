"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ThemeCtx {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} });

export function LandingThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(localStorage.getItem("landing-dark") === "true");
  }, []);

  const toggle = () =>
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("landing-dark", String(next));
      return next;
    });

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <div className={dark ? "dark" : ""}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export const useLandingTheme = () => useContext(ThemeContext);
