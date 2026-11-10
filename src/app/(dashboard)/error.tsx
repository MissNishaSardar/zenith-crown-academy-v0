"use client";

import { useEffect } from "react";

import ErrorState from "@/components/ErrorState";

type DashboardErrorProps = Readonly<{
  error: unknown;
  reset: () => void;
}>;

const DashboardError = ({ error, reset }: DashboardErrorProps) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      embedded
      eyebrow="Dashboard error"
      title="Something went wrong"
      description="An unexpected error interrupted this workspace. You can try again or return to your dashboard."
      onRetry={reset}
      secondaryLabel="Go to dashboard"
      secondaryHref="/dashboard"
    />
  );
};

export default DashboardError;
