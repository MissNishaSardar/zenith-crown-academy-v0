"use client";

import Image from "next/image";
import Link from "next/link";

import ProfileMenu from "./ProfileMenu";
import ThemeToggleButton from "./ThemeToggleButton";

type DashboardHeaderProps = {
  storedRole: string | null | undefined;
  userEmail: string;
  userImage: string | null | undefined;
  userName: string;
};

const DashboardHeader = ({
  storedRole,
  userEmail,
  userImage,
  userName,
}: DashboardHeaderProps) => {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 h-16 shrink-0 border-b backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/dashboard"
          aria-label="Zenith Crown Academy dashboard home"
          className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/logo-mark.png"
            alt=""
            width={954}
            height={561}
            priority
            className="h-9 w-auto shrink-0"
          />
          <span className="font-heading text-foreground hidden truncate text-base leading-none font-bold tracking-tight min-[400px]:block sm:text-lg">
            Zenith Crown{" "}
            <span className="text-muted-foreground font-semibold">Academy</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ThemeToggleButton />
          <ProfileMenu
            storedRole={storedRole}
            userEmail={userEmail}
            userImage={userImage}
            userName={userName}
          />
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
