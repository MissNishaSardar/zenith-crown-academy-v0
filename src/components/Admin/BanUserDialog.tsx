"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
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
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { banUserSchema, type banUserType } from "@/lib/zodSchema";
import type { UsersRow } from "./UsersColumns";

import { banUser } from "@/server/admin/userActions";

type BanUserDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UsersRow | null;
};

const BanUserDialog = ({ onOpenChange, open, user }: BanUserDialogProps) => {
  const router = useRouter();

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<banUserType>({
    defaultValues: { banExpires: "", banReason: "", id: "" },
    mode: "all",
    resolver: zodResolver(banUserSchema),
  });

  const userId = user?.id;

  useEffect(() => {
    if (open && userId) {
      reset({ banExpires: "", banReason: "", id: userId });
    }
  }, [open, reset, userId]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const onSubmit = async (values: banUserType) => {
    const result = await withMinimumLoad(banUser(values));
    if (!result.ok) {
      if (result.errors.banReason) {
        setError("banReason", { message: result.errors.banReason });
      }
      if (result.errors.banExpires) {
        setError("banExpires", { message: result.errors.banExpires });
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
          <DialogTitle>Ban user</DialogTitle>
          <DialogDescription>
            {user ?
              `Ban ${user.name}. They are signed out everywhere and cannot sign in until unbanned.`
            : "Ban this user. They are signed out everywhere and cannot sign in until unbanned."
            }
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate>
          <FieldGroup>
            <Controller
              name="banReason"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="text"
                    autoComplete="off"
                    placeholder="Enter a reason"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="banExpires"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    Expiry date (optional)
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="date"
                    aria-invalid={fieldState.invalid}
                  />
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
              variant="destructive"
              disabled={!isDirty || isSubmitting}>
              {isSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Banning
                </>
              : "Ban user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BanUserDialog;
