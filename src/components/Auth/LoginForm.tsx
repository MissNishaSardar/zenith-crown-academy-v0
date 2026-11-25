"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import { Checkbox } from "@/components/shadcnui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { authClient } from "@/lib/auth-client";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { signinSchema, type signinType } from "@/lib/zodSchema";

const LoginForm = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<signinType>({
    resolver: zodResolver(signinSchema),
    defaultValues: { identifier: "", password: "", rememberMe: false },
    mode: "all",
  });

  const onSubmit = async (values: signinType) => {
    const identifier = values.identifier.trim();
    const { error } = await withMinimumLoad(
      identifier.includes("@") ?
        authClient.signIn.email({
          email: identifier,
          password: values.password,
          rememberMe: values.rememberMe,
        })
      : authClient.signIn.username({
          username: identifier,
          password: values.password,
          rememberMe: values.rememberMe,
        }),
    );
    if (error) {
      setError("root", {
        message:
          error.status === 403 ?
            "This account is blocked. Contact school admin."
          : "Invalid email or username or password. Try again.",
      });
      return;
    }
    router.push("/dashboard");
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate>
      <FieldGroup>
        <Controller
          name="identifier"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Email or username</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="text"
                autoComplete="username"
                placeholder="you@school.edu or your username"
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="password"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Password</FieldLabel>
              <div className="relative">
                <Input
                  {...field}
                  id={field.name}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  aria-invalid={fieldState.invalid}
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2">
                  {showPassword ?
                    <EyeOff aria-hidden="true" />
                  : <Eye aria-hidden="true" />}
                </Button>
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Controller
          name="rememberMe"
          control={control}
          render={({ field: { value, onChange, onBlur, name } }) => (
            <Field
              orientation="horizontal"
              className="w-auto">
              <Checkbox
                id="rememberMe"
                name={name}
                checked={value}
                onCheckedChange={(checked) => onChange(checked === true)}
                onBlur={onBlur}
              />
              <FieldLabel htmlFor="rememberMe">Remember me</FieldLabel>
            </Field>
          )}
        />
        <a
          href="/forgot-password"
          className="text-primary text-sm font-semibold underline-offset-4 hover:underline">
          Forgot password?
        </a>
      </div>
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
            Signing in
          </>
        : "Sign in"}
      </Button>
    </form>
  );
};

export default LoginForm;
