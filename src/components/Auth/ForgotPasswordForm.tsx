"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import { authClient } from "@/lib/auth-client";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { forgotPasswordSchema, type forgotPasswordType } from "@/lib/zodSchema";

const ForgotPasswordForm = () => {
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<forgotPasswordType>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "all",
  });

  const onSubmit = async (values: forgotPasswordType) => {
    const { error } = await withMinimumLoad(
      authClient.requestPasswordReset({
        email: values.email,
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    if (error) {
      setError("root", {
        message:
          "Could not send the reset link. Check your connection and try again.",
      });
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div
        role="status"
        className="bg-card text-sm leading-relaxed">
        Check your email for a reset link. If the address has an account, the
        link will arrive shortly. The link works once and expires in one hour.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate>
      <Controller
        name="email"
        control={control}
        render={({ field, fieldState }) => (
          <div data-invalid={fieldState.invalid}>
            <label
              htmlFor={field.name}
              className="mb-2 block text-[13.5px] font-semibold">
              Email address
            </label>
            <input
              {...field}
              id={field.name}
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              aria-invalid={fieldState.invalid}
              className="border-input bg-background/60 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-12 w-full rounded-xl border px-3.5 text-[15px] outline-none focus-visible:ring-[3px]"
            />
            {fieldState.invalid && fieldState.error ?
              <p
                role="alert"
                className="text-destructive mt-1.5 text-[13px]">
                {fieldState.error.message}
              </p>
            : null}
          </div>
        )}
      />
      {errors.root ?
        <p
          role="alert"
          className="text-destructive bg-destructive/10 mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {errors.root.message}
        </p>
      : null}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 h-[50px] w-full text-[15px] font-extrabold">
        {isSubmitting ?
          <>
            <LoaderIcon
              aria-hidden="true"
              className="animate-spin"
            />
            Sending link
          </>
        : "Send reset link"}
      </Button>
      <p className="text-muted-foreground mt-4 text-[13px] leading-relaxed">
        Reset email is stubbed until a real mail service is added.
      </p>
    </form>
  );
};

export default ForgotPasswordForm;
