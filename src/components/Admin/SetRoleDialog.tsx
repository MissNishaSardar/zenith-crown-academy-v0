"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/shadcnui/field";
import { roleLabels } from "@/lib/auth/permissions";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  assignableRoleNames,
  setRoleSchema,
  type setRoleType,
} from "@/lib/zodSchema";
import type { UsersRow } from "./UsersColumns";

import { setRole } from "@/server/admin/userActions";

type SetRoleDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UsersRow | null;
};

const SetRoleDialog = ({ onOpenChange, open, user }: SetRoleDialogProps) => {
  const router = useRouter();

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<setRoleType>({
    defaultValues: { id: "", role: "student" },
    mode: "all",
    resolver: zodResolver(setRoleSchema),
  });

  const userId = user?.id;
  const userRolesKey = (user?.roles ?? []).join(",");

  useEffect(() => {
    if (open && userId) {
      const assignableStored = userRolesKey
        .split(",")
        .filter((role) =>
          (assignableRoleNames as readonly string[]).includes(role),
        );
      reset({
        id: userId,
        role: assignableStored as setRoleType["role"],
      });
    }
  }, [open, reset, userId, userRolesKey]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const onSubmit = async (values: setRoleType) => {
    const result = await withMinimumLoad(setRole(values));
    if (!result.ok) {
      if (result.errors.role) {
        setError("role", { message: result.errors.role });
      }
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      return;
    }
    handleOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change roles</DialogTitle>
          <DialogDescription>
            {user ?
              `Pick roles for ${user.name}. First checked is primary. Changing roles signs the user out everywhere.`
            : "Pick roles. First checked is primary. Changing roles signs the user out everywhere."
            }
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate>
          <Controller
            name="role"
            control={control}
            render={({ field, fieldState }) => {
              type AssignableRole = (typeof assignableRoleNames)[number];
              const selected = (
                Array.isArray(field.value) ?
                  field.value
                : [field.value]).filter((role): role is AssignableRole =>
                (assignableRoleNames as readonly string[]).includes(role),
              );
              const toggle = (roleName: AssignableRole, checked: boolean) => {
                if (checked) {
                  if (!selected.includes(roleName)) {
                    field.onChange([...selected, roleName]);
                  }
                  return;
                }
                if (selected.length <= 1) {
                  return;
                }
                field.onChange(selected.filter((role) => role !== roleName));
              };
              return (
                <FieldSet>
                  <FieldLegend>Roles</FieldLegend>
                  <FieldDescription>
                    Allowed pairs: Parent with Teacher, Office staff, Librarian,
                    Accountant. Teacher with Principal, Vice principal.
                  </FieldDescription>
                  <div className="flex flex-col gap-2">
                    {assignableRoleNames.map((role) => (
                      <Field
                        key={role}
                        orientation="horizontal"
                        className="w-auto">
                        <Checkbox
                          id={`role-${role}`}
                          checked={selected.includes(role)}
                          onCheckedChange={(checked) =>
                            toggle(role, checked === true)
                          }
                          disabled={
                            selected.length === 1 && selected.includes(role)
                          }
                        />
                        <FieldLabel htmlFor={`role-${role}`}>
                          {roleLabels[role]}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldSet>
              );
            }}
          />
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
              : "Save roles"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetRoleDialog;
