import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Fonts in the spirit of the game's menus, self-hosted by Next at build time. No file from the game is used.
const display = Cinzel({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600"] });
const body = EB_Garamond({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Dark Souls Challenge",
  description:
    "Challenges for replaying Dark Souls: a manual of orders to follow, each challenge checked to be possible.",
};

export const viewport: Viewport = { themeColor: "#0b0a08" };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
