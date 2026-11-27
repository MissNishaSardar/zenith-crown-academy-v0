"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import {
  assignmentSchema,
  assignmentStatusNames,
  type assignmentType,
} from "@/lib/zodSchema";
import {
  createAssignment,
  updateAssignment,
} from "@/server/academics/assignmentActions";

export type AssignmentEdit = {
  classId: string;
  dueDate: string;
  id: string;
  instructions: string;
  sectionId: string | null;
  status: string;
  subjectId: string;
  title: string;
  yearId: string;
};

type AssignmentDialogProps = {
  assignment?: AssignmentEdit | null;
  canWrite: boolean;
  classes: { id: string; name: string }[];
  classSubjects: { classId: string; subjectId: string }[];
  sections: { classId: string; id: string; name: string; yearId: string }[];
  subjects: { code: string; id: string; name: string }[];
  years: { id: string; name: string; status: string }[];
};

const AssignmentDialog = ({
  assignment,
  canWrite,
  classes,
  classSubjects,
  sections,
  subjects,
  years,
}: AssignmentDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(assignment);

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<assignmentType>({
    defaultValues: {
      classId: assignment?.classId ?? "",
      dueDate: assignment?.dueDate ?? "",
      instructions: assignment?.instructions ?? "",
      sectionId: assignment?.sectionId ?? null,
      status: (assignment?.status ?? "DRAFT") as assignmentType["status"],
      subjectId: assignment?.subjectId ?? "",
      title: assignment?.title ?? "",
      yearId: assignment?.yearId ?? "",
    },
    mode: "all",
    resolver: zodResolver(assignmentSchema),
  });

  const yearId = watch("yearId");
  const classId = watch("classId");

  const visibleSections = useMemo(() => {
    if (!yearId || !classId) return [];
    return sections.filter(
      (row) => row.yearId === yearId && row.classId === classId,
    );
  }, [sections, yearId, classId]);

  const visibleSubjects = useMemo(() => {
    if (!classId) return [];
    const ids = new Set(
      classSubjects
        .filter((row) => row.classId === classId)
        .map((row) => row.subjectId),
    );
    if (ids.size === 0) return [];
    const scoped = subjects.filter((subject) => ids.has(subject.id));
    if (
      assignment?.subjectId &&
      !scoped.some((subject) => subject.id === assignment.subjectId)
    ) {
      const current = subjects.find(
        (subject) => subject.id === assignment.subjectId,
      );
      if (current) return [...scoped, current];
    }
    return scoped;
  }, [assignment?.subjectId, classId, classSubjects, subjects]);

  const openCreate = () => {
    reset({
      classId: assignment?.classId ?? "",
      dueDate: assignment?.dueDate ?? "",
      instructions: assignment?.instructions ?? "",
      sectionId: assignment?.sectionId ?? null,
      status: (assignment?.status ?? "DRAFT") as assignmentType["status"],
      subjectId: assignment?.subjectId ?? "",
      title: assignment?.title ?? "",
      yearId:
        assignment?.yearId ??
        years.find((row) => row.status === "CURRENT")?.id ??
        "",
    });
    setOpen(true);
  };

  const onSubmit = async (values: assignmentType) => {
    const result =
      isEdit && assignment ?
        await withMinimumLoad(
          updateAssignment({ ...values, id: assignment.id }),
        )
      : await withMinimumLoad(createAssignment(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof assignmentType, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite}
        onClick={openCreate}
        size={isEdit ? "sm" : "default"}
        type="button"
        variant={isEdit ? "outline" : "default"}
        title={canWrite ? undefined : "Assigned teachers or principal only"}>
        {isEdit ? "Edit" : "New assignment"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit assignment" : "New assignment"}
            </DialogTitle>
            <DialogDescription>
              Due date is required to publish. Creation is limited to assigned
              teachers and principal.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <Controller
              name="title"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Fractions practice set 3"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="yearId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Year</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        Pick a year
                      </NativeSelectOption>
                      {years.map((year) => (
                        <NativeSelectOption
                          key={year.id}
                          value={year.id}>
                          {year.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="classId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Class</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={(event) => {
                        const nextClass = event.target.value;
                        field.onChange(event);
                        const allowed = new Set(
                          classSubjects
                            .filter((row) => row.classId === nextClass)
                            .map((row) => row.subjectId),
                        );
                        const currentSubject = getValues("subjectId");
                        if (currentSubject && !allowed.has(currentSubject)) {
                          setValue("subjectId", "", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        Pick a class
                      </NativeSelectOption>
                      {classes.map((schoolClass) => (
                        <NativeSelectOption
                          key={schoolClass.id}
                          value={schoolClass.id}>
                          {schoolClass.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="sectionId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Section, blank for whole class
                    </FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value ?? ""}
                      onChange={(event) => {
                        const next =
                          event.target.value === "" ? null : event.target.value;
                        field.onChange(next);
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        Whole class
                      </NativeSelectOption>
                      {visibleSections.map((section) => (
                        <NativeSelectOption
                          key={section.id}
                          value={section.id}>
                          {section.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="subjectId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Subject</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        Pick a subject
                      </NativeSelectOption>
                      {visibleSubjects.map((subject) => (
                        <NativeSelectOption
                          key={subject.id}
                          value={subject.id}>
                          {`${subject.name} (${subject.code})`}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {!classId ?
                      <p className="text-muted-foreground text-xs">
                        Pick a class to see its subjects.
                      </p>
                    : visibleSubjects.length === 0 ?
                      <p className="text-muted-foreground text-xs">
                        No subjects mapped to this class yet. Map one in
                        Subjects first.
                      </p>
                    : null}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="instructions"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Instructions</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Solve all questions, show working"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="dueDate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Due date</FieldLabel>
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
                      {assignmentStatusNames.map((option) => (
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
            </div>
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
                : isEdit ?
                  "Save changes"
                : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssignmentDialog;
