import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AuthCard from "@/components/Auth/AuthCard";
import ForgotPasswordForm from "@/components/Auth/ForgotPasswordForm";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Forgot password",
};

const ForgotPasswordPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    redirect("/dashboard");
  }
  return (
    <AuthCard
      title="Forgot password"
      description="Enter your account email and we will send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
};

export default ForgotPasswordPage;
