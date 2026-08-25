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

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
