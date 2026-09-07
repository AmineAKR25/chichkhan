import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { FloatingNav } from "@/components/FloatingNav";
import { site } from "@/lib/site";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Havana — Carte digitale",
    template: "%s · Havana",
  },
  description: site.intro,
  openGraph: {
    title: "Havana — Carte digitale",
    description: site.intro,
    locale: "fr_TN",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#14181A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${cormorant.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <FloatingNav />
      </body>
    </html>
  );
}
