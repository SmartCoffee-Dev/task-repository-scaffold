"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { HeroUIProvider } from "@heroui/react";
import { ThemeToggle } from "./components/theme-toggle";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <HeroUIProvider locale="es-ES">
        <ThemeToggle />
        {children}
      </HeroUIProvider>
    </NextThemesProvider>
  );
}