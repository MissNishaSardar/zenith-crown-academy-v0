import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon } from "lucide-react";

import AuthCard from "@/components/Auth/AuthCard";
import { buttonVariants } from "@/components/shadcnui/button";
import {
  displayLogoPath,
  displaySchoolName,
  getSchoolBranding,
} from "@/lib/school-branding";
import {
  FALLBACK_LOGO_PATH,
  FALLBACK_SCHOOL_NAME,
} from "@/lib/school-branding-constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  description: "The page you asked for does not exist at Zenith Crown Academy.",
  title: "Page Not Found",
};

const NotFound = async () => {
  let logoSrc = FALLBACK_LOGO_PATH;
  let schoolName = FALLBACK_SCHOOL_NAME;
  try {
    const branding = await getSchoolBranding();
    logoSrc = displayLogoPath(branding);
    schoolName = displaySchoolName(branding);
  } catch {
    logoSrc = FALLBACK_LOGO_PATH;
    schoolName = FALLBACK_SCHOOL_NAME;
  }
  return (
    <AuthCard
      title="This path leads nowhere yet"
      description="The page you asked for does not exist or was moved. Check the address or return to familiar ground."
      logoSrc={logoSrc}
      schoolName={schoolName}>
      <div className="flex flex-col items-center gap-4">
        <span className="border-border bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-widest uppercase">
          <CompassIcon className="size-3.5" />
          404 • Not Found
        </span>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-[50px] w-full text-[15px] font-extrabold",
          )}>
          Return home
        </Link>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-[50px] w-full text-[15px] font-extrabold",
          )}>
          Go to dashboard
        </Link>
      </div>
    </AuthCard>
  );
};

export default NotFound;
