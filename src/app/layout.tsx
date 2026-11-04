import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CMD Pro", template: "%s · CMD Pro" },
  description: "Logiciel de gestion hospitalière — Centre Médical Dieu est Fidélité, Goma",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#071a45", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
