"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  enrollmentSchema,
  enrollmentStatusNames,
  type enrollmentType,
} from "@/lib/zodSchema";
import {
  createEnrollment,
  suggestRollNo,
} from "@/server/academics/enrollmentActions";

type EnrollmentDialogProps = {
  canWrite: boolean;
  classSubjects: { classId: string; isOptional: boolean; subjectId: string }[];
  classes: { id: string; name: string; order: number }[];
  enrolledPairs: { studentId: string; yearId: string }[];
  sections: { classId: string; id: string; name: string; yearId: string }[];
  streamSubjects: { streamId: string; subjectId: string }[];
  streams: { classId: string; id: string; name: string }[];
  students: {
    admissionNo: string;
    classId: string;
    firstName: string;
    id: string;
    lastName: string;
    sectionId: string | null;
    yearId: string;
  }[];
  subjects: { code: string; id: string; name: string }[];
  years: { id: string; name: string; status: string }[];
};

const EnrollmentDialog = ({
  canWrite,
  classSubjects,
  classes,
  enrolledPairs,
  sections,
  streamSubjects,
  streams,
  students,
  subjects,
  years,
}: EnrollmentDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<enrollmentType>({
    defaultValues: {
      classId: "",
      rollNo: "",
      sectionId: "",
      status: "ENROLLED",
      streamId: null,
      studentId: "",
      subjectPickIds: [],
      yearId: "",
    },
    mode: "all",
    resolver: zodResolver(enrollmentSchema),
  });

  const yearId = watch("yearId");
  const classId = watch("classId");
  const studentId = watch("studentId");
  const sectionId = watch("sectionId");
  const streamId = watch("streamId");
  const pickIds = watch("subjectPickIds") ?? [];

  const selectedClass = classes.find((row) => row.id === classId) ?? null;
  const senior = (selectedClass?.order ?? 0) >= 14;

  const visibleSections = useMemo(() => {
    if (!yearId || !classId) return [];
    return sections.filter(
      (row) => row.yearId === yearId && row.classId === classId,
    );
  }, [sections, yearId, classId]);

  const visibleStreams = useMemo(
    () => streams.filter((row) => !classId || row.classId === classId),
    [streams, classId],
  );

  const hasYearAndClass = Boolean(yearId && classId);
  const noSectionsForScope = hasYearAndClass && visibleSections.length === 0;

  const duplicateYear = useMemo(() => {
    if (!studentId || !yearId) return null;
    const hit = enrolledPairs.some(
      (row) => row.studentId === studentId && row.yearId === yearId,
    );
    if (!hit) return null;
    return years.find((row) => row.id === yearId) ?? null;
  }, [enrolledPairs, studentId, yearId, years]);

  const optionalSubjects = useMemo(() => {
    if (!classId) return [];
    const optionalIds = new Set(
      classSubjects
        .filter((row) => row.classId === classId && row.isOptional)
        .map((row) => row.subjectId),
    );
    if (optionalIds.size === 0) return [];
    if (streamId) {
      const streamIds = new Set(
        streamSubjects
          .filter((row) => row.streamId === streamId)
          .map((row) => row.subjectId),
      );
      return subjects.filter(
        (subject) => optionalIds.has(subject.id) && streamIds.has(subject.id),
      );
    }
    return subjects.filter((subject) => optionalIds.has(subject.id));
  }, [classSubjects, classId, streamId, streamSubjects, subjects]);

  const openCreate = () => {
    reset({
      classId: "",
      rollNo: "",
      sectionId: "",
      status: "ENROLLED",
      streamId: null,
      studentId: "",
      subjectPickIds: [],
      yearId: years.find((row) => row.status === "CURRENT")?.id ?? "",
    });
    setOpen(true);
  };

  const handleSuggest = async () => {
    if (!sectionId) {
      setError("sectionId", { message: "Pick a section first." });
      return;
    }
    setSuggesting(true);
    try {
      const result = await withMinimumLoad(suggestRollNo(sectionId));
      if (result.ok) {
        setValue("rollNo", result.rollNo, {
          shouldDirty: true,
          shouldValidate: true,
        });
      } else {
        setError("root", { message: result.errors.root ?? "Try again." });
      }
    } finally {
      setSuggesting(false);
    }
  };

  const onSubmit = async (values: enrollmentType) => {
    const result = await withMinimumLoad(createEnrollment(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof enrollmentType, { message });
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
        type="button"
        title={
          canWrite ? "Enroll a student" : "Principal or office staff only"
        }>
        Enroll student
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enroll a student</DialogTitle>
            <DialogDescription>
              Place a student for the year. Capacity, stream, and optional picks
              revalidate on save.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate>
            <FieldGroup>
              <Controller
                name="studentId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Student</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={(event) => {
                        field.onChange(event);
                        const next =
                          students.find(
                            (row) => row.id === event.target.value,
                          ) ?? null;
                        if (!next) return;
                        setValue("yearId", next.yearId, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setValue("classId", next.classId, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        const keepsSection =
                          next.sectionId &&
                          sections.some(
                            (row) =>
                              row.id === next.sectionId &&
                              row.yearId === next.yearId &&
                              row.classId === next.classId,
                          );
                        setValue(
                          "sectionId",
                          keepsSection && next.sectionId ? next.sectionId : "",
                          { shouldDirty: true },
                        );
                        setValue("streamId", null, { shouldDirty: true });
                        setValue("subjectPickIds", [], { shouldDirty: true });
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        Pick a student
                      </NativeSelectOption>
                      {students.map((student) => (
                        <NativeSelectOption
                          key={student.id}
                          value={student.id}>
                          {`${student.firstName} ${student.lastName} (${student.admissionNo})`}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  name="yearId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Year</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value}
                        onChange={(event) => {
                          field.onChange(event);
                          setValue("sectionId", "", { shouldDirty: true });
                        }}
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
                          field.onChange(event);
                          setValue("sectionId", "", { shouldDirty: true });
                          setValue("streamId", null, { shouldDirty: true });
                          setValue("subjectPickIds", [], { shouldDirty: true });
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  name="sectionId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Section</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}>
                        <NativeSelectOption value="">
                          Pick a section
                        </NativeSelectOption>
                        {visibleSections.map((section) => (
                          <NativeSelectOption
                            key={section.id}
                            value={section.id}>
                            {section.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {noSectionsForScope ?
                        <FieldDescription>
                          No sections for this year and class yet. Create one in
                          Sections first.
                        </FieldDescription>
                      : !hasYearAndClass ?
                        <FieldDescription>
                          Pick a year and class to see sections.
                        </FieldDescription>
                      : null}
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="streamId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>
                        {senior ? "Stream" : "Stream (Class 11 and 12 only)"}
                      </FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const next =
                            event.target.value === "" ?
                              null
                            : event.target.value;
                          setValue("streamId", next, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue("subjectPickIds", [], { shouldDirty: true });
                        }}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                        disabled={!senior}>
                        <NativeSelectOption value="">
                          {senior ? "Pick a stream" : "No stream"}
                        </NativeSelectOption>
                        {visibleStreams.map((stream) => (
                          <NativeSelectOption
                            key={stream.id}
                            value={stream.id}>
                            {stream.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  name="rollNo"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Roll number</FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          {...field}
                          id={field.name}
                          type="text"
                          autoComplete="off"
                          placeholder="Suggest or type a roll number"
                          aria-invalid={fieldState.invalid}
                        />
                        <Button
                          onClick={handleSuggest}
                          type="button"
                          variant="outline"
                          disabled={suggesting || !sectionId}>
                          {suggesting ?
                            <>
                              <Loader2Icon
                                aria-hidden="true"
                                className="animate-spin"
                              />
                              Suggesting
                            </>
                          : "Suggest"}
                        </Button>
                      </div>
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
                        {enrollmentStatusNames.map((option) => (
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
              {optionalSubjects.length > 0 ?
                <Controller
                  name="subjectPickIds"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Optional picks</FieldLabel>
                      <div className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
                        {optionalSubjects.map((subject) => {
                          const checked = (field.value ?? []).includes(
                            subject.id,
                          );
                          return (
                            <label
                              key={subject.id}
                              className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const current = new Set(field.value ?? []);
                                  if (next === true) current.add(subject.id);
                                  else current.delete(subject.id);
                                  field.onChange([...current]);
                                }}
                              />
                              <span>
                                {subject.name}
                                <span className="text-muted-foreground">
                                  {` (${subject.code})`}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              : null}
            </FieldGroup>
            {duplicateYear ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {`This student is already enrolled for ${duplicateYear.name}.`}
              </p>
            : null}
            {errors.root ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {errors.root.message}
              </p>
            : null}
            <DialogFooter className="mt-5">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !isDirty ||
                  isSubmitting ||
                  pickIds.length > 12 ||
                  duplicateYear !== null
                }>
                {isSubmitting ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Enrolling
                  </>
                : "Enroll"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EnrollmentDialog;
