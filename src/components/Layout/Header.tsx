import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import { buttonVariants } from "@/components/shadcnui/button";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import ThemeToggleButton from "./ThemeToggleButton";

const Header = async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 h-16 border-b backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Zenith Crown Academy home"
          className="flex items-center gap-2.5">
          <Image
            src={"/logo-mark.png"}
            alt={""}
            width={954}
            height={561}
            priority
            className="h-9 w-auto"
          />
          <span className="font-heading text-foreground text-base leading-none font-bold tracking-tight sm:text-lg">
            Zenith Crown{" "}
            <span className="text-muted-foreground font-semibold">Academy</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={session ? "/dashboard" : "/login"}
            className={cn(
              buttonVariants({ variant: "default", size: "default" }),
              "h-9 px-4 text-sm font-semibold",
            )}>
            {session ? "Dashboard" : "Sign in"}
          </Link>
          <ThemeToggleButton />
        </div>
      </div>
    </header>
  );
};

export default Header;
