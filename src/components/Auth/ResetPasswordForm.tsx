"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { authClient } from "@/lib/auth-client";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { resetPasswordSchema, type resetPasswordType } from "@/lib/zodSchema";

type ResetPasswordFormProps = {
  token: string;
};

const ResetPasswordForm = ({ token }: ResetPasswordFormProps) => {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<resetPasswordType>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "all",
  });

  const onSubmit = async (values: resetPasswordType) => {
    const { error } = await withMinimumLoad(
      authClient.resetPassword({
        newPassword: values.newPassword,
        token,
      }),
    );
    if (error) {
      setError("root", {
        message: "This reset link is invalid or expired. Request a new link.",
      });
      return;
    }
    router.push("/login");
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate>
      <FieldGroup>
        <Controller
          name="newPassword"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>New password</FieldLabel>
              <div className="relative">
                <Input
                  {...field}
                  id={field.name}
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={fieldState.invalid}
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showNew ? "Hide password" : "Show password"}
                  onClick={() => setShowNew((v) => !v)}
                  className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2">
                  {showNew ?
                    <EyeOff aria-hidden="true" />
                  : <Eye aria-hidden="true" />}
                </Button>
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="confirmPassword"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
              <div className="relative">
                <Input
                  {...field}
                  id={field.name}
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  aria-invalid={fieldState.invalid}
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2">
                  {showConfirm ?
                    <EyeOff aria-hidden="true" />
                  : <Eye aria-hidden="true" />}
                </Button>
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
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
            Resetting password
          </>
        : "Reset password"}
      </Button>
    </form>
  );
};

export default ResetPasswordForm;
