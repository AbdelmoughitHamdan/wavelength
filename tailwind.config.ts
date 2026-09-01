import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141426",
        cream: "#fff9f2",
        coral: "#ff6b6b",
        mint: "#63e6be",
        purple: "#7c5cff"
      },
      boxShadow: { card: "0 20px 60px rgba(36, 22, 74, 0.12)" }
    }
  },
  plugins: []
};
export default config;
