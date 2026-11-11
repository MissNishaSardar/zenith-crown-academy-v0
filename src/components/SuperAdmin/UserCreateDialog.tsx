"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderIcon, TriangleAlertIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcnui/select";
import { toast } from "@/components/shadcnui/toast";

import { authClient } from "@/lib/auth-client";
import { roleLabels } from "@/lib/auth/permissions";
import { generateTempPassword } from "@/lib/password";
import { logAudit } from "@/server/audit";
import {
  assignableRoles,
  createUserSchema,
  type createUserType,
} from "@/lib/zodSchema";
import { isUsernameTaken, suggestUsernames } from "@/server/users";
import PasswordGenerateInput from "@/components/SuperAdmin/PasswordGenerateInput";

type AssignableRole = (typeof assignableRoles)[number];

const pairFor = (role: AssignableRole): AssignableRole | null =>
  role === "parent" ? "teacher"
  : role === "teacher" ? "parent"
  : null;

type UserCreateDialogProps = {
  onCreated: (password: string, userName: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const UserCreateDialog = ({
  onCreated,
  onOpenChange,
  open,
}: UserCreateDialogProps) => {
  // One check state keyed to the typed value. A stale answer for an older
  // value never matches the current input, so it can never overwrite newer UI.
  const [usernameCheck, setUsernameCheck] = useState<{
    value: string;
    taken: boolean;
    suggestions: string[];
  } | null>(null);
  // Submit-level failure shown inside the dialog, next to the fields, so it
  // cannot be buried behind the modal overlay the way a toast can.
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<createUserType>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      username: "",
      password: generateTempPassword(),
      roles: ["student"],
    },
    mode: "all",
  });

  const usernameValue = useWatch({ control, name: "username" });
  const trimmedUsername = (usernameValue ?? "").trim();
  const activeCheck =
    usernameCheck && usernameCheck.value === trimmedUsername ?
      usernameCheck
    : null;
  const usernameTaken = activeCheck?.taken ?? false;
  const suggestions = activeCheck?.suggestions ?? [];

  const checkUsername = async (value: string): Promise<{ taken: boolean }> => {
    const trimmed = value.trim();
    if (!trimmed) {
      setUsernameCheck(null);
      return { taken: false };
    }
    let result: { value: string; taken: boolean; suggestions: string[] };
    try {
      const taken = await isUsernameTaken({ username: trimmed });
      let nextSuggestions: string[] = [];
      if (taken) {
        try {
          nextSuggestions = await suggestUsernames({ base: trimmed });
        } catch {
          nextSuggestions = [];
        }
      }
      result = { value: trimmed, taken, suggestions: nextSuggestions };
    } catch {
      // Check unavailable (network or auth): leave the state unchecked and let
      // the submit-time guard and the database act as the backstop.
      result = { value: trimmed, taken: false, suggestions: [] };
    }
    setUsernameCheck(result);
    return { taken: result.taken };
  };

  const onPickSuggestion = (suggestion: string) => {
    setValue("username", suggestion, { shouldDirty: true });
    setUsernameCheck(null);
  };

  const onSubmit = async (values: createUserType) => {
    setFormError(null);
    const trimmed = {
      name: values.name.trim(),
      email: values.email.trim(),
      username: values.username.trim(),
    };
    const { taken } = await checkUsername(trimmed.username);
    // The inline FieldError under the username input carries this case.
    if (taken) {
      return;
    }
    const { data, error } = await authClient.admin.createUser({
      email: trimmed.email,
      password: values.password,
      name: trimmed.name,
      role: values.roles,
      data: { username: trimmed.username },
    });
    if (error) {
      const message =
        /already taken/i.test(error.message ?? "") ?
          "That username is already taken."
        : error.message || "Create user failed. Try again.";
      setFormError(message);
      return;
    }
    try {
      await logAudit({
        action: "user.create",
        target: {
          userId: data?.user?.id ?? null,
          name: trimmed.name,
          email: trimmed.email,
        },
        details: { roles: values.roles, username: trimmed.username },
      });
    } catch {
      toast.add({
        type: "warning",
        title: "User created, audit entry failed",
        description: "The account exists but the audit trail was not updated.",
      });
    }
    toast.add({
      type: "success",
      title: "User created",
      description: `${trimmed.name} can now sign in.`,
    });
    onCreated(values.password, trimmed.name);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] sm:max-w-lg">
        <DialogHeader>
          <span
            aria-hidden="true"
            className="border-border bg-secondary/60 text-muted-foreground inline-flex size-11 items-center justify-center rounded-2xl border">
            <UserPlusIcon className="size-5" />
          </span>
          <DialogTitle className="font-heading text-lg">
            Create user
          </DialogTitle>
          <DialogDescription>
            New accounts get the role you pick and the temporary password you
            see at the end. Share it offline.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4">
          {formError ?
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-relaxed">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">Could not create user</span>
                <span>{formError}</span>
              </span>
            </div>
          : null}
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="name"
                  placeholder="Full name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="username"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || usernameTaken}>
                <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="off"
                  placeholder="Username"
                  aria-invalid={fieldState.invalid || usernameTaken}
                  onBlur={(event) => {
                    field.onBlur();
                    checkUsername(event.target.value);
                  }}
                />
                {suggestions.length > 0 ?
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">Try:</span>
                    {suggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        type="button"
                        variant="outline"
                        size="xs"
                        className="rounded-full"
                        onClick={() => onPickSuggestion(suggestion)}>
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                : null}
                {usernameTaken ?
                  <FieldError
                    errors={[{ message: "That username is already taken." }]}
                  />
                : fieldState.invalid ?
                  <FieldError errors={[fieldState.error]} />
                : null}
              </Field>
            )}
          />
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="name@school.example"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="roles"
            control={control}
            render={({ field, fieldState }) => {
              const primary = (field.value[0] ?? "student") as AssignableRole;
              const pair = pairFor(primary);
              const secondary: AssignableRole | "none" =
                pair && field.value.includes(pair) ? pair : "none";
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="create-primary-role">Role</FieldLabel>
                  <div className="flex flex-col gap-2">
                    <Select
                      value={primary}
                      onValueChange={(next) => {
                        const nextRole = next as AssignableRole;
                        const nextPair = pairFor(nextRole);
                        const keepPair =
                          nextPair && field.value.includes(nextPair) ?
                            [nextRole, nextPair]
                          : [nextRole];
                        field.onChange(keepPair);
                      }}>
                      <SelectTrigger
                        id="create-primary-role"
                        aria-invalid={fieldState.invalid}
                        className="w-full">
                        <SelectValue placeholder="Select a role">
                          {(value: string) =>
                            roleLabels[value as AssignableRole] ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {assignableRoles.map((role) => (
                            <SelectItem
                              key={role}
                              value={role}>
                              {roleLabels[role]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {pair ?
                      <Select
                        value={secondary}
                        onValueChange={(next) => {
                          field.onChange(
                            next === "none" ?
                              [primary]
                            : [primary, next as AssignableRole],
                          );
                        }}>
                        <SelectTrigger
                          aria-label="Optional second role"
                          className="w-full">
                          <SelectValue>
                            {(value: string) =>
                              value === "none" ? "No second role" : (
                                roleLabels[value as AssignableRole]
                              )
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="none">No second role</SelectItem>
                            <SelectItem value={pair}>
                              {roleLabels[pair]}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    : null}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Only a parent and teacher pair can hold two roles.
                  </p>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />
          <Controller
            name="password"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Temporary password</FieldLabel>
                <PasswordGenerateInput
                  id={field.name}
                  value={field.value}
                  onChange={field.onChange}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}>
              {isSubmitting ?
                <>
                  <LoaderIcon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Creating
                </>
              : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserCreateDialog;
