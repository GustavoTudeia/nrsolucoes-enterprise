import type { Metadata } from "next";
import "./globals.css";
import { Inter, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster as RadixToaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { WhatsAppFab } from "@/components/support/whatsapp-fab";
import { ConsoleProvider } from "@/components/console/console-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "NRSoluções | NR-1 Saúde Mental (Riscos Psicossociais)",
  description: "Plataforma nacional para diagnóstico, gestão e evidências de conformidade com a NR-1 (riscos psicossociais), com LGPD, rastreabilidade e plano de ação.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${sora.variable}`}>
        <ThemeProvider>
          <ConsoleProvider>
            {children}
            <RadixToaster />
            <SonnerToaster position="top-right" />
            <WhatsAppFab />
          </ConsoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
