import { Sora, Space_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata = {
  title: "ProjectDeck",
  description: "A personal developer command center for software projects.",
};

const themeInitializationScript = `
  (function () {
    try {
      var storedTheme = localStorage.getItem("projectdeck-theme");
      var systemTheme = window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
      document.documentElement.dataset.theme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : systemTheme;
    } catch (error) {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
