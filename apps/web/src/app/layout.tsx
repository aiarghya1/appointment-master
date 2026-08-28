import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SettingsWidget } from "@/components/settings-widget";
import { THEME_STORAGE_KEY } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Appointment Master",
    template: "%s · Appointment Master",
  },
  description: "Scheduling that respects everyone's calendar — and everyone's time zone.",
};

/**
 * Applies the stored theme before the first paint.
 *
 * This has to be a blocking inline script. Doing it in an effect would let the
 * browser paint the default palette first, so anyone who chose dark would see
 * a white flash on every navigation. Wrapped in try/catch because reading
 * localStorage throws outright in private mode and when site data is blocked —
 * and a settings preference must never be able to break the page.
 */
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <SettingsWidget locale={locale} labels={dict.settings} />
      </body>
    </html>
  );
}
