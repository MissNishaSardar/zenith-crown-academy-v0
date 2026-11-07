import type { Metadata } from "next";
import Link from "next/link";

import AuthCard from "@/components/Auth/AuthCard";
import ResetPasswordForm from "@/components/Auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
};

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ResetPasswordPage = async ({ searchParams }: ResetPasswordPageProps) => {
  const params = await searchParams;
  const tokenParam = params.token;
  const token =
    typeof tokenParam === "string" ? tokenParam
    : Array.isArray(tokenParam) ? tokenParam[0]
    : undefined;

  if (!token) {
    return (
      <AuthCard
        title="Reset password"
        description="This link is missing or expired.">
        <p
          role="alert"
          className="text-destructive bg-destructive/10 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          This reset link is invalid or expired. Request a new link from the
          forgot password page.
        </p>
        <Link
          href="/forgot-password"
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 flex h-[50px] w-full items-center justify-center rounded-md text-[15px] font-extrabold">
          Request new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset password"
      description="Choose a new password for your account. The old password stops working on the next sign in.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
};

export default ResetPasswordPage;
