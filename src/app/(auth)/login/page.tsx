import type { Metadata } from "next";

import AuthCard from "@/components/Auth/AuthCard";
import LoginForm from "@/components/Auth/LoginForm";
import {
  displayLogoPath,
  displaySchoolName,
  getSchoolBranding,
} from "@/lib/school-branding";

export const metadata: Metadata = {
  title: "Sign in",
};

const LoginPage = async () => {
  const branding = await getSchoolBranding();
  return (
    <AuthCard
      title="Welcome back"
      logoSrc={displayLogoPath(branding)}
      schoolName={displaySchoolName(branding)}>
      <LoginForm />
    </AuthCard>
  );
};

export default LoginPage;
