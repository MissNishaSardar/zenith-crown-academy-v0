"use client";

import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import AuthCard from "@/components/Auth/AuthCard";
import { buttonVariants } from "@/components/shadcnui/button";
import {
  FALLBACK_LOGO_PATH,
  FALLBACK_SCHOOL_NAME,
} from "@/lib/school-branding-constants";
import { cn } from "@/lib/utils";

type ErrorProps = {
  error: unknown;
  retry: () => void;
};

const Error = ({ retry }: ErrorProps) => {
  return (
    <AuthCard
      title="Something went wrong on our side"
      description="The page ran into an unexpected problem. Try again, or return home and continue from there."
      logoSrc={FALLBACK_LOGO_PATH}
      schoolName={FALLBACK_SCHOOL_NAME}>
      <div className="flex flex-col items-center gap-4">
        <span className="border-border bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-widest uppercase">
          <TriangleAlertIcon className="size-3.5" />
          Error
        </span>
        <button
          type="button"
          onClick={retry}
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-[50px] w-full text-[15px] font-extrabold",
          )}>
          Try again
        </button>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-[50px] w-full text-[15px] font-extrabold",
          )}>
          Return home
        </Link>
      </div>
    </AuthCard>
  );
};

export default Error;
