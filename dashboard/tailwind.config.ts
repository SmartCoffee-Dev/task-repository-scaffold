import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/react/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2563EB",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#6B7280",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#16A34A",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#D97706",
          foreground: "#FFFFFF",
        },
        danger: {
          DEFAULT: "#DC2626",
          foreground: "#FFFFFF",
        },
      },
      fontSize: {
        tiny: "0.75rem",
        small: "0.875rem",
        medium: "0.9375rem",
        large: "1.125rem",
        xlarge: "1.5rem",
      },
      borderRadius: {
        small: "6px",
        medium: "8px",
        large: "12px",
      },
    },
  },
  darkMode: "class",
  plugins: [heroui()],
};

export default config;