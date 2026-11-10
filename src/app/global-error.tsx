"use client";

import { useEffect } from "react";

import ErrorState from "@/components/ErrorState";
import { geistMono, geistSans, interHeading } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import "./globals.css";

type GlobalAppErrorProps = Readonly<{
  error: unknown;
  reset: () => void;
}>;

const GlobalAppError = ({ error, reset }: GlobalAppErrorProps) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={cn(
        "dark antialiased",
        geistSans.variable,
        geistMono.variable,
        interHeading.variable,
      )}
      suppressHydrationWarning>
      <body>
        <ErrorState
          eyebrow="Critical error"
          title="The app could not load"
          description="A critical error stopped the app from rendering. Trying again may restore it."
          onRetry={reset}
          secondaryLabel="Back to home"
          secondaryHref="/"
        />
      </body>
    </html>
  );
};

export default GlobalAppError;
