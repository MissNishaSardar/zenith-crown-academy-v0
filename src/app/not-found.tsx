import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/shadcnui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
};

const NotFoundPage = () => {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10 sm:px-6">
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
        <p className="font-heading text-primary mt-4 text-center text-sm font-bold tracking-widest">
          404
        </p>
        <h1 className="font-heading mt-2 text-center text-[30px] leading-none font-extrabold tracking-tight">
          This page could not be found
        </h1>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "default", size: "default" }),
              "h-11 px-5 text-sm font-semibold",
            )}>
            Back to home
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "secondary", size: "default" }),
              "h-11 px-5 text-sm font-semibold",
            )}>
            Go to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
};

export default NotFoundPage;
