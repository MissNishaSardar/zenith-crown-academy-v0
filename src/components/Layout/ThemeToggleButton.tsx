"use client";

import { MoonStarIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

const ThemeToggleButton = () => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground relative flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors">
      <SunIcon
        size={20}
        className="-rotate-90 opacity-100 transition-all duration-300 dark:rotate-0 dark:opacity-0"
      />

      <MoonStarIcon
        size={20}
        className="absolute inset-0 m-auto -rotate-90 opacity-0 transition-all duration-300 dark:rotate-0 dark:opacity-100"
      />
    </button>
  );
};

export default ThemeToggleButton;
