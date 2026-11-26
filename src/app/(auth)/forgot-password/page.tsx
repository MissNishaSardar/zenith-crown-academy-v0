import type { Metadata } from "next";

import AuthCard from "@/components/Auth/AuthCard";
import ForgotPasswordForm from "@/components/Auth/ForgotPasswordForm";
import {
  displayLogoPath,
  displaySchoolName,
  getSchoolBranding,
} from "@/lib/school-branding";

export const metadata: Metadata = {
  title: "Forgot password",
};

const ForgotPasswordPage = async () => {
  const branding = await getSchoolBranding();
  return (
    <AuthCard
      title="Forgot password"
      logoSrc={displayLogoPath(branding)}
      schoolName={displaySchoolName(branding)}
      description="Enter your account email and we will send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
};

export default ForgotPasswordPage;
