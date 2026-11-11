"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BanIcon, LoaderIcon } from "lucide-react";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcnui/toggle-group";
import { toast } from "@/components/shadcnui/toast";

import { authClient } from "@/lib/auth-client";
import type { AdminUserRow } from "@/server/users";
import { logAudit } from "@/server/audit";
import { banUserSchema, type banUserType } from "@/lib/zodSchema";

const UNIT_SECONDS = {
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
  months: 2592000,
} as const;

type BanUnit = keyof typeof UNIT_SECONDS;

type BanDialogProps = {
  onDone: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: AdminUserRow | null;
};

const BanDialog = ({ onDone, onOpenChange, open, user }: BanDialogProps) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    setValue,
  } = useForm<banUserType>({
    resolver: zodResolver(banUserSchema),
    defaultValues: {
      reason: "",
      expiresIn: undefined,
    },
    mode: "all",
  });

  const expiresIn = useWatch({ control, name: "expiresIn" });
  const duration: "permanent" | "temporary" =
    expiresIn ? "temporary" : "permanent";

  const onSubmit = async (values: banUserType) => {
    if (!user) {
      return;
    }
    const reason = values.reason.trim();
    const expiresInSeconds =
      values.expiresIn ?
        values.expiresIn.amount * UNIT_SECONDS[values.expiresIn.unit as BanUnit]
      : undefined;
    const { error } = await authClient.admin.banUser({
      userId: user.id,
      banReason: reason,
      ...(expiresInSeconds ? { banExpiresIn: expiresInSeconds } : {}),
    });
    if (error) {
      toast.add({
        type: "error",
        title: "Could not ban user",
        description: error.message || "Ban failed. Try again.",
      });
      return;
    }
    try {
      await logAudit({
        action: "user.ban",
        target: { userId: user.id, name: user.name, email: user.email },
        details:
          values.expiresIn ?
            {
              reason,
              duration: "temporary",
              amount: values.expiresIn.amount,
              unit: values.expiresIn.unit,
              expiresInSeconds,
            }
          : { reason, duration: "permanent" },
      });
    } catch {
      toast.add({
        type: "warning",
        title: "User banned, audit entry failed",
        description: "The ban was applied but the audit trail was not updated.",
      });
    }
    toast.add({
      type: "success",
      title: `${user.name} banned`,
      description:
        values.expiresIn ?
          "The ban lifts automatically when the time is up."
        : "The ban stays until you lift it.",
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span
            aria-hidden="true"
            className="border-destructive/20 bg-destructive/10 text-destructive inline-flex size-11 items-center justify-center rounded-2xl border">
            <BanIcon className="size-5" />
          </span>
          <DialogTitle className="font-heading text-lg">
            Ban {user?.name ?? "user"}
          </DialogTitle>
          <DialogDescription>
            {user?.name ?? "This user"} will be signed out of all devices
            immediately and cannot sign back in until the ban is lifted.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4">
          <Controller
            name="reason"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoFocus
                  placeholder="Visible to you in the audit trail"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="ban-duration">Duration</FieldLabel>
            <ToggleGroup
              value={[duration]}
              onValueChange={(values: string[]) => {
                const next = values.at(-1);
                if (next === "permanent") {
                  setValue("expiresIn", undefined, { shouldDirty: true });
                } else if (next === "temporary" && !expiresIn) {
                  setValue(
                    "expiresIn",
                    { amount: 7, unit: "days" },
                    { shouldDirty: true },
                  );
                }
              }}
              spacing={0}
              variant="outline"
              size="sm"
              id="ban-duration"
              aria-label="Ban duration">
              <ToggleGroupItem value="permanent">Permanent</ToggleGroupItem>
              <ToggleGroupItem value="temporary">Temporary</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {expiresIn ?
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="expiresIn.amount"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Amount</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-invalid={fieldState.invalid}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="expiresIn.unit"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="ban-unit">Unit</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}>
                      <SelectTrigger
                        id="ban-unit"
                        className="w-full">
                        <SelectValue>
                          {(value: string) =>
                            value.charAt(0).toUpperCase() + value.slice(1)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="minutes">Minutes</SelectItem>
                          <SelectItem value="hours">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="weeks">Weeks</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>
          : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting}>
              {isSubmitting ?
                <>
                  <LoaderIcon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Banning
                </>
              : <>
                  <BanIcon aria-hidden="true" />
                  Ban user
                </>
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BanDialog;
