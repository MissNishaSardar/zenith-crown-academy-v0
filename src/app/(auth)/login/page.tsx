import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
};

const LoginPage = () => {
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight">
        Sign in
      </h1>
    </main>
  );
};

export default LoginPage;
