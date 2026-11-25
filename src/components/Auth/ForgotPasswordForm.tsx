"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
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
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
            <Input
              {...field}
              id={field.name}
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
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
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
            Sending link
          </>
        : "Send reset link"}
      </Button>
      <p className="mt-4 text-center text-sm">
        <a
          href="/login"
          className="text-primary font-semibold underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </p>
    </form>
  );
};

export default ForgotPasswordForm;
