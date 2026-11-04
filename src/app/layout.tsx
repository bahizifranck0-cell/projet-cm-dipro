import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Police téléchargée au moment de la compilation puis servie par le serveur local (fonctionne sans Internet).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CMD Pro", template: "%s · CMD Pro" },
  description: "Logiciel de gestion hospitalière — Centre Médical Dieu est Fidélité, Goma",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#071a45", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
