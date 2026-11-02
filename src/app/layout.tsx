import type { Metadata } from "next";
import SilkBackground from "@/components/Layout/SilkBackground";
import ThemeProvider from "@/components/Providers/ThemeProvider";
import Header from "@/components/Layout/Header";
import { clientEnv } from "@/lib/env/clientEnv";
import { geistMono, geistSans, interHeading } from "@/lib/fonts";
import { LayoutProps } from "@/lib/types";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    clientEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Zenith Crown Academy",
    template: "%s | Zenith Crown Academy",
  },
  description:
    "Zenith Crown Academy helps students rise to the highest point of their learning with focused programs, expert guidance, and results crowned with distinction.",
  openGraph: {
    title: "Zenith Crown Academy",
    description:
      "Rise to the highest point of your learning, and let every milestone be crowned with distinction.",
    siteName: "Zenith Crown Academy",
    type: "website",
  },
};

const RootLayout = ({ children }: LayoutProps) => {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        interHeading.variable,
      )}
      suppressHydrationWarning>
      <body>
        <SilkBackground />
        <ThemeProvider
          attribute={"class"}
          defaultTheme="dark"
          enableSystem={false}>
          <Header />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
