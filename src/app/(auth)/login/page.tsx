import type { Metadata } from "next";

import AuthCard from "@/components/Auth/AuthCard";
import LoginForm from "@/components/Auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

const LoginPage = () => {
  return (
    <AuthCard title="Welcome back">
      <LoginForm />
    </AuthCard>
  );
};

export default LoginPage;
