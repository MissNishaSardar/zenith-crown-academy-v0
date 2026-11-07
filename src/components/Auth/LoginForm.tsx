"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
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
      <Controller
        name="identifier"
        control={control}
        render={({ field, fieldState }) => (
          <div data-invalid={fieldState.invalid}>
            <label
              htmlFor={field.name}
              className="mb-2 block text-[13.5px] font-semibold">
              Email or username
            </label>
            <input
              {...field}
              id={field.name}
              type="text"
              autoComplete="username"
              placeholder="you@school.edu or admission number"
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
      <Controller
        name="password"
        control={control}
        render={({ field, fieldState }) => (
          <div
            className="mt-4"
            data-invalid={fieldState.invalid}>
            <label
              htmlFor={field.name}
              className="mb-2 block text-[13.5px] font-semibold">
              Password
            </label>
            <div className="relative">
              <input
                {...field}
                id={field.name}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                aria-invalid={fieldState.invalid}
                className="border-input bg-background/60 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-12 w-full rounded-xl border px-3.5 pr-[72px] text-[15px] outline-none focus-visible:ring-[3px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="text-muted-foreground absolute top-1/2 right-1.5 -translate-y-1/2">
                {showPassword ?
                  <>
                    <EyeOff aria-hidden="true" />
                    Hide
                  </>
                : <>
                    <Eye aria-hidden="true" />
                    Show
                  </>
                }
              </Button>
            </div>
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Controller
          name="rememberMe"
          control={control}
          render={({ field }) => (
            <label
              htmlFor="rememberMe"
              className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input
                id="rememberMe"
                type="checkbox"
                checked={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="accent-primary size-[18px] cursor-pointer"
              />
              Remember me
            </label>
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
