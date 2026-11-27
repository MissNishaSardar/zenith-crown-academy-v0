"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import DatePickerField from "@/components/Layout/DatePickerField";
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
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { disciplineSchema, type disciplineType } from "@/lib/zodSchema";
import {
  createDisciplineIncident,
  updateDisciplineIncident,
} from "@/server/academics/disciplineActions";

export type DisciplineIncidentSummary = {
  actionTaken: string | null;
  category: string;
  date: string;
  description: string;
  id: string;
  status: string;
  studentId: string;
  studentName: string;
  yearId: string;
};

type DisciplineDialogProps = {
  incident?: DisciplineIncidentSummary | null;
  studentId: string;
  studentName: string;
  yearId: string;
};

const categoryOptions = [
  "LATE",
  "MISCONDUCT",
  "BULLYING",
  "CHEATING",
  "VANDALISM",
  "ABSENTEEISM",
  "OTHER",
] as const;

const DisciplineDialog = ({
  incident,
  studentId,
  studentName,
  yearId,
}: DisciplineDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(incident);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<disciplineType>({
    defaultValues: {
      actionTaken: incident?.actionTaken ?? "",
      category: (incident?.category ??
        "MISCONDUCT") as disciplineType["category"],
      categoryNote: "",
      date: incident?.date ?? new Date().toISOString().slice(0, 10),
      description: incident?.description ?? "",
      status: (incident?.status ?? "OPEN") as disciplineType["status"],
      studentId: incident?.studentId ?? studentId,
      yearId: incident?.yearId ?? yearId,
    },
    mode: "all",
    resolver: zodResolver(disciplineSchema),
  });

  const openDialog = () => {
    reset({
      actionTaken: incident?.actionTaken ?? "",
      category: (incident?.category ??
        "MISCONDUCT") as disciplineType["category"],
      categoryNote: "",
      date: incident?.date ?? new Date().toISOString().slice(0, 10),
      description: incident?.description ?? "",
      status: (incident?.status ?? "OPEN") as disciplineType["status"],
      studentId: incident?.studentId ?? studentId,
      yearId: incident?.yearId ?? yearId,
    });
    setOpen(true);
  };

  const onSubmit = async (values: disciplineType) => {
    const result =
      isEdit && incident ?
        await withMinimumLoad(
          updateDisciplineIncident({ ...values, id: incident.id }),
        )
      : await withMinimumLoad(createDisciplineIncident(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      if (result.errors.actionTaken) {
        setError("actionTaken", { message: result.errors.actionTaken });
      }
      if (result.errors.description) {
        setError("description", { message: result.errors.description });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}>
      <Button
        onClick={openDialog}
        size="sm"
        type="button"
        variant={isEdit ? "outline" : "default"}>
        {isEdit ? "Resolve" : `Log for ${studentName}`}
      </Button>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Resolve incident" : "Log discipline incident"}
          </DialogTitle>
          <DialogDescription>
            Action taken is required to close. All writes pass scope checks.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Controller
              name="category"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Category</FieldLabel>
                  <NativeSelect
                    id={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}>
                    {categoryOptions.map((option) => (
                      <NativeSelectOption
                        key={option}
                        value={option}>
                        {option}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="date"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Date</FieldLabel>
                  <DatePickerField
                    ariaInvalid={fieldState.invalid}
                    id={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value ?? ""}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>
          <Controller
            name="categoryNote"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  Category note when other
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id={field.name}
                  autoComplete="off"
                  placeholder="Required when category is other"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="description"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="off"
                  placeholder="What happened"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="actionTaken"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Action taken</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  id={field.name}
                  autoComplete="off"
                  placeholder="Required to close"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="status"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Status</FieldLabel>
                <NativeSelect
                  id={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}>
                  <NativeSelectOption value="OPEN">Open</NativeSelectOption>
                  <NativeSelectOption value="CLOSED">Closed</NativeSelectOption>
                </NativeSelect>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          {errors.root ?
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {errors.root.message}
            </p>
          : null}
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
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
              : "Save incident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DisciplineDialog;
