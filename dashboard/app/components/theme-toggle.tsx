"use client";

import { useTheme } from "next-themes";
import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <Button
      isIconOnly
      variant="light"
      size="sm"
      onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Cambiar tema"
      style={{ position: "fixed", top: 12, right: 12, zIndex: 50, fontSize: "1.1rem" }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </Button>
  );
}