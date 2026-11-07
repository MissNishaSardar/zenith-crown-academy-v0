import type { Metadata } from "next";

import AuthCard from "@/components/Auth/AuthCard";
import ForgotPasswordForm from "@/components/Auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password",
};

const ForgotPasswordPage = () => {
  return (
    <AuthCard
      title="Forgot password"
      description="Enter your account email and we will send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
};

export default ForgotPasswordPage;
