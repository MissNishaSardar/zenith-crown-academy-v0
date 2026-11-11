import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AuthCard from "@/components/Auth/AuthCard";
import LoginForm from "@/components/Auth/LoginForm";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

const LoginPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    redirect("/dashboard");
  }
  return (
    <AuthCard title="Welcome back">
      <LoginForm />
    </AuthCard>
  );
};

export default LoginPage;
