"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
  CopyIcon,
  Eye,
  EyeOff,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import { Checkbox } from "@/components/shadcnui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { generatePassword } from "@/lib/auth/passwordGenerator";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { setPasswordSchema, type setPasswordType } from "@/lib/zodSchema";
import type { UsersRow } from "./UsersColumns";

import { setPassword } from "@/server/admin/userActions";

type ResetPasswordDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UsersRow | null;
};

const ResetPasswordDialog = ({
  onOpenChange,
  open,
  user,
}: ResetPasswordDialogProps) => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [sharedPassword, setSharedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<setPasswordType>({
    defaultValues: { id: "", password: "" },
    mode: "all",
    resolver: zodResolver(setPasswordSchema),
  });

  const userId = user?.id;

  useEffect(() => {
    if (open && userId) {
      reset({ id: userId, password: "" });
    }
  }, [open, reset, userId]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      setSharedPassword(null);
      setCopied(false);
      setShared(false);
      setShowPassword(false);
    }
    onOpenChange(next);
  };

  const onSubmit = async (values: setPasswordType) => {
    const result = await withMinimumLoad(setPassword(values));
    if (!result.ok) {
      if (result.errors.password) {
        setError("password", { message: result.errors.password });
      }
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      return;
    }
    setSharedPassword(values.password);
    reset();
  };

  const handleCopy = async () => {
    if (!sharedPassword) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sharedPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDone = () => {
    setSharedPassword(null);
    setCopied(false);
    setShared(false);
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        {sharedPassword === null ?
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                {user ?
                  `Set a new password for ${user.name}. This revokes all sessions.`
                : "Set a new password. This revokes all sessions."}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate>
              <FieldGroup>
                <Controller
                  name="password"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                      <div className="relative">
                        <Input
                          {...field}
                          id={field.name}
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Generated or typed, 12 characters"
                          aria-invalid={fieldState.invalid}
                          className="pr-9"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((v) => !v)}
                          className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2">
                          {showPassword ?
                            <EyeOff aria-hidden="true" />
                          : <Eye aria-hidden="true" />}
                        </Button>
                      </div>
                      <div>
                        <Button
                          onClick={() => {
                            field.onChange(generatePassword());
                          }}
                          size="sm"
                          type="button"
                          variant="outline">
                          <RefreshCwIcon aria-hidden="true" />
                          Generate password
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
                  className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                  {errors.root.message}
                </p>
              : null}
              <DialogFooter className="mt-5">
                <Button
                  onClick={() => handleOpenChange(false)}
                  type="button"
                  variant="outline">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isDirty || isSubmitting}>
                  {isSubmitting ?
                    <>
                      <Loader2Icon
                        aria-hidden="true"
                        className="animate-spin"
                      />
                      Saving
                    </>
                  : "Save password"}
                </Button>
              </DialogFooter>
            </form>
          </>
        : <>
            <DialogHeader>
              <DialogTitle>Share this password once</DialogTitle>
              <DialogDescription>
                {user ? `${user.name} signs in with this password. ` : null}
                It never shows again after this dialog closes.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted flex items-center justify-between gap-3 rounded-md px-3.5 py-3">
              <code className="text-sm font-semibold break-all">
                {sharedPassword}
              </code>
              <Button
                onClick={handleCopy}
                size="sm"
                type="button"
                variant="outline">
                {copied ?
                  <>
                    <CheckIcon aria-hidden="true" />
                    Copied
                  </>
                : <>
                    <CopyIcon aria-hidden="true" />
                    Copy
                  </>
                }
              </Button>
            </div>
            <Field
              orientation="horizontal"
              className="w-auto">
              <Checkbox
                id="reset-share-confirm"
                checked={shared}
                onCheckedChange={(checked) => setShared(checked === true)}
              />
              <FieldLabel htmlFor="reset-share-confirm">
                I have shared this password securely
              </FieldLabel>
            </Field>
            <DialogFooter className="mt-2">
              <Button
                onClick={handleDone}
                type="button"
                disabled={!shared}>
                Done
              </Button>
            </DialogFooter>
          </>
        }
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordDialog;
