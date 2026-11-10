import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/shadcnui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = Readonly<{
  eyebrow: string;
  title: string;
  description?: string;

  onRetry?: () => void;
  retryLabel?: string;

  secondaryLabel?: string;
  secondaryHref?: Route;

  embedded?: boolean;
}>;

const ErrorState = ({
  eyebrow,
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  secondaryLabel,
  secondaryHref,
  embedded = false,
}: ErrorStateProps) => {
  return (
    <main
      className={
        embedded ?
          "grid flex-1 place-items-center px-4 py-10 sm:px-6"
        : "grid min-h-svh place-items-center px-4 py-10 sm:px-6"
      }>
      <section className="bg-card text-card-foreground border-border w-full max-w-[428px] rounded-[22px] border p-7 shadow-2xl sm:p-[34px_30px_28px]">
        <div className="flex justify-center">
          <Image
            src="/logo-mark.png"
            alt="Zenith Crown Academy crown and graduation cap mark"
            width={954}
            height={561}
            priority
            style={{ width: "auto" }}
            className="h-16 w-auto drop-shadow-[0_12px_28px_oklch(0_0_0/0.45)]"
          />
        </div>
        <p className="font-heading text-destructive mt-4 text-center text-sm font-bold tracking-widest">
          {eyebrow}
        </p>
        <h1 className="font-heading mt-2 text-center text-[30px] leading-none font-extrabold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-3 text-center text-sm leading-relaxed">
            {description}
          </p>
        )}
        {(onRetry || secondaryHref) && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {onRetry && (
              <Button
                onClick={onRetry}
                className="h-11 px-5 text-sm font-semibold">
                {retryLabel}
              </Button>
            )}
            {secondaryHref && secondaryLabel && (
              <Link
                href={secondaryHref}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "default" }),
                  "h-11 px-5 text-sm font-semibold",
                )}>
                {secondaryLabel}
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
};

export default ErrorState;
