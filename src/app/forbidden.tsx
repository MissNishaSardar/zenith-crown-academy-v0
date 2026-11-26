import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";

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
  description:
    "Your current role does not include this area of Zenith Crown Academy.",
  title: "Access Forbidden",
};

const Forbidden = async () => {
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
      title="This hall stays sealed for your role"
      description="You are signed in, but your current role does not include this area. Ask an administrator for access or return to your dashboard."
      logoSrc={logoSrc}
      schoolName={schoolName}>
      <div className="flex flex-col items-center gap-4">
        <span className="border-border bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-widest uppercase">
          <ShieldAlertIcon className="size-3.5" />
          403 • Forbidden
        </span>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-[50px] w-full text-[15px] font-extrabold",
          )}>
          Back to dashboard
        </Link>
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

export default Forbidden;
