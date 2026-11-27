"use client";

import { MoonStarIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/shadcnui/button";

const ThemeToggleButton = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      size="icon"
      type="button"
      variant="ghost"
      className="relative shrink-0">
      <SunIcon className="-rotate-90 opacity-100 transition-all duration-300 dark:rotate-0 dark:opacity-0" />
      <MoonStarIcon className="absolute inset-0 m-auto -rotate-90 opacity-0 transition-all duration-300 dark:rotate-0 dark:opacity-100" />
    </Button>
  );
};

export default ThemeToggleButton;
