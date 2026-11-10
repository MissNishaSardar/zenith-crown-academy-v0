"use client";

import { useEffect } from "react";

import ErrorState from "@/components/ErrorState";

type AppErrorProps = Readonly<{
  error: unknown;
  reset: () => void;
}>;

const AppError = ({ error, reset }: AppErrorProps) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      eyebrow="Unexpected error"
      title="Something went wrong"
      description="An unexpected error interrupted this page. Trying again usually fixes it."
      onRetry={reset}
      secondaryLabel="Back to home"
      secondaryHref="/"
    />
  );
};

export default AppError;
