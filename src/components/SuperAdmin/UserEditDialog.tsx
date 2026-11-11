"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderIcon, PencilLineIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";
import { toast } from "@/components/shadcnui/toast";

import { authClient } from "@/lib/auth-client";
import { parseRoleNames, roleLabels } from "@/lib/auth/permissions";
import type { AdminUserRow } from "@/server/users";
import { isUsernameTaken, suggestUsernames } from "@/server/users";
import { logAudit } from "@/server/audit";
import {
  assignableRoles,
  editUserSchema,
  type editUserType,
} from "@/lib/zodSchema";

type AssignableRole = (typeof assignableRoles)[number];

const pairFor = (role: AssignableRole): AssignableRole | null =>
  role === "parent" ? "teacher"
  : role === "teacher" ? "parent"
  : null;

const sameRoles = (a: AssignableRole[], b: AssignableRole[]) =>
  a.length === b.length && a.every((role, index) => role === b[index]);

type UserEditDialogProps = {
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: AdminUserRow | null;
};

const UserEditDialog = ({
  onDone,
  onOpenChange,
  open,
  user,
}: UserEditDialogProps) => {
  const isSuperAdminTarget =
    user ? parseRoleNames(user.role).includes("super_admin") : false;

  const originalRoles: AssignableRole[] =
    user ?
      parseRoleNames(user.role).filter((role): role is AssignableRole =>
        (assignableRoles as readonly string[]).includes(role),
      )
    : [];

  // One check state keyed to the typed value. A stale answer for an older
  // value never matches the current input, so it can never overwrite newer UI.
  const [usernameCheck, setUsernameCheck] = useState<{
    value: string;
    taken: boolean;
    suggestions: string[];
  } | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<editUserType>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      username: user?.username ?? "",
      roles: originalRoles.length > 0 ? originalRoles : ["student"],
      newPassword: "",
    },
    mode: "all",
  });

  const usernameValue = useWatch({ control, name: "username" });

  if (!user) {
    return null;
  }

  const originalUsername = user.username ?? "";
  const trimmedUsername = (usernameValue ?? "").trim();
  const activeCheck =
    usernameCheck && usernameCheck.value === trimmedUsername ?
      usernameCheck
    : null;
  const usernameTaken = activeCheck?.taken ?? false;
  const suggestions = activeCheck?.suggestions ?? [];

  const checkUsername = async (value: string): Promise<{ taken: boolean }> => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === originalUsername) {
      setUsernameCheck(null);
      return { taken: false };
    }
    let result: { value: string; taken: boolean; suggestions: string[] };
    try {
      const taken = await isUsernameTaken({
        excludeUserId: user.id,
        username: trimmed,
      });
      let nextSuggestions: string[] = [];
      if (taken) {
        try {
          nextSuggestions = await suggestUsernames({
            base: trimmed,
            excludeUserId: user.id,
          });
        } catch {
          nextSuggestions = [];
        }
      }
      result = { value: trimmed, taken, suggestions: nextSuggestions };
    } catch {
      // Check unavailable (network or auth): leave the state unchecked and
      // let the submit-time guard and the database act as the backstop.
      result = { value: trimmed, taken: false, suggestions: [] };
    }
    setUsernameCheck(result);
    return { taken: result.taken };
  };

  const onPickSuggestion = (suggestion: string) => {
    setValue("username", suggestion, { shouldDirty: true });
    setUsernameCheck(null);
  };

  const onSubmit = async (values: editUserType) => {
    const trimmed = {
      name: values.name.trim(),
      email: values.email.trim(),
      username: values.username.trim(),
    };
    const { taken } = await checkUsername(trimmed.username);
    if (taken) {
      toast.add({
        type: "error",
        title: "Username taken",
        description: "Pick a different username or use a suggestion.",
      });
      return;
    }
    const identityChanges: Partial<typeof trimmed> = {};
    if (trimmed.name !== user.name) {
      identityChanges.name = trimmed.name;
    }
    if (trimmed.email !== user.email) {
      identityChanges.email = trimmed.email;
    }
    if (trimmed.username !== (user.username ?? "")) {
      identityChanges.username = trimmed.username;
    }

    const nextRoles = values.roles as AssignableRole[];
    const rolesChanged =
      !isSuperAdminTarget && !sameRoles(nextRoles, originalRoles);
    const newPassword = values.newPassword.trim();

    const audit = async (
      action: "user.update" | "user.role_set" | "user.password_set",
    ) => {
      try {
        await logAudit({
          action,
          target: { userId: user.id, name: trimmed.name, email: trimmed.email },
          details:
            action === "user.role_set" ? { roles: nextRoles }
            : action === "user.update" ? { changes: identityChanges }
            : {},
        });
      } catch {
        toast.add({
          type: "warning",
          title: "Saved, audit entry failed",
          description:
            "The change was applied but the audit trail was not updated.",
        });
      }
    };

    if (Object.keys(identityChanges).length > 0) {
      const { error } = await authClient.admin.updateUser({
        userId: user.id,
        data: identityChanges,
      });
      if (error) {
        const message =
          /already taken/i.test(error.message ?? "") ?
            "That username is already taken."
          : /email/i.test(error.message ?? "") ? "That email is already taken."
          : error.message || "Could not update the user.";
        toast.add({
          type: "error",
          title: "Could not update user",
          description: message,
        });
        return;
      }
      await audit("user.update");
    }

    if (rolesChanged) {
      const { error } = await authClient.admin.setRole({
        userId: user.id,
        role: nextRoles,
      });
      if (error) {
        toast.add({
          type: "error",
          title: "Could not update roles",
          description: error.message || "Role change failed. Try again.",
        });
        return;
      }
      await audit("user.role_set");
    }

    if (newPassword) {
      const { error } = await authClient.admin.setUserPassword({
        userId: user.id,
        newPassword,
      });
      if (error) {
        toast.add({
          type: "error",
          title: "Could not set password",
          description: error.message || "Set password failed. Try again.",
        });
        return;
      }
      await audit("user.password_set");
    }

    toast.add({
      type: "success",
      title: "User updated",
      description: `${trimmed.name} was saved.`,
    });
    onDone();
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
            <PencilLineIcon className="size-5" />
          </span>
          <DialogTitle className="font-heading text-lg">
            Edit {user.name}
          </DialogTitle>
          <DialogDescription>
            Identity edits apply to any account. Roles are locked for super
            admin accounts.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4">
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
              const rolesBlock = isSuperAdminTarget;
              const picker = (
                <div className="flex flex-col gap-2">
                  <Select
                    value={primary}
                    disabled={rolesBlock}
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
                      id="edit-primary-role"
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
                      disabled={rolesBlock}
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
              );
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-primary-role">Role</FieldLabel>
                  {rolesBlock ?
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className="block"
                            tabIndex={0}>
                            {picker}
                          </span>
                        }
                      />
                      <TooltipContent side="top">
                        <ShieldCheckIcon
                          aria-hidden="true"
                          className="size-3.5"
                        />
                        Super admin roles can only change in the auth config
                      </TooltipContent>
                    </Tooltip>
                  : picker}
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />
          <Controller
            name="newPassword"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  New password{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep the current password"
                  aria-invalid={fieldState.invalid}
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
              disabled={isSubmitting || !isDirty}>
              {isSubmitting ?
                <>
                  <LoaderIcon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Saving
                </>
              : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserEditDialog;
