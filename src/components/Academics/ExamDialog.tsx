"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Button } from "@/components/shadcnui/button";
import { Badge } from "@/components/shadcnui/badge";
import { Card, CardContent } from "@/components/shadcnui/card";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
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
import DatePickerField from "@/components/Layout/DatePickerField";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  componentKindNames,
  examNameLabels,
  examNameNames,
  examPaperSchema,
  examSchema,
  type examPaperType,
  type examType,
} from "@/lib/zodSchema";
import {
  createExam,
  createExamPaper,
  savePaperComponents,
  transitionExamStatus,
  updateExam,
  updateExamPaper,
} from "@/server/academics/examActions";

export type ExamRow = {
  canFinalize: boolean;
  canWrite: boolean;
  classId: string | null;
  className: string;
  endDate: string;
  id: string;
  isLocked: boolean;
  name: string;
  nameLabel: string;
  paperCount: number;
  startDate: string;
  status: string;
  streamId: string | null;
  streamName: string;
  yearId: string;
  yearName: string;
};

export type ExamComponentRow = {
  kind: string;
  maxMarks: string;
  passMarks: string;
};

export type ExamPaperRow = {
  canWrite: boolean;
  classId: string;
  className: string;
  components: ExamComponentRow[];
  date: string;
  durationMin: number;
  examId: string;
  examName: string;
  examStatus: string;
  id: string;
  isLocked: boolean;
  maxMarks: string;
  passMarks: string;
  subjectId: string;
  subjectName: string;
};

type Option = { id: string; name: string };
type ClassOption = { id: string; name: string; order: number };
type StreamOption = { classId: string; id: string; name: string };
type SubjectOption = { code: string; id: string; name: string };

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "SCHEDULED",
  SCHEDULED: "PUBLISHED",
  PUBLISHED: "LOCKED",
  LOCKED: "FINALIZED",
  FINALIZED: null,
};

const ExamDialog = ({
  canWrite,
  classes,
  exam,
  streams,
  years,
}: {
  canWrite: boolean;
  classes: ClassOption[];
  exam?: ExamRow | null;
  streams: StreamOption[];
  years: Option[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(exam);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<examType>({
    defaultValues: {
      classId: exam?.classId ?? null,
      endDate: exam?.endDate ?? "",
      name: (exam?.name as examType["name"]) ?? "UNIT_TEST",
      startDate: exam?.startDate ?? "",
      streamId: exam?.streamId ?? null,
      yearId: exam?.yearId ?? "",
    },
    mode: "all",
    resolver: zodResolver(examSchema),
  });

  const classId = watch("classId");
  const normalizedClass =
    typeof classId === "string" && classId.trim() !== "" ? classId : null;
  const visibleStreams = useMemo(() => {
    if (!normalizedClass) return [];
    return streams.filter((row) => row.classId === normalizedClass);
  }, [streams, normalizedClass]);

  const openDialog = () => {
    reset({
      classId: exam?.classId ?? null,
      endDate: exam?.endDate ?? "",
      name: (exam?.name as examType["name"]) ?? "UNIT_TEST",
      startDate: exam?.startDate ?? "",
      streamId: exam?.streamId ?? null,
      yearId: exam?.yearId ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (values: examType) => {
    const result =
      isEdit && exam != null ?
        await withMinimumLoad(updateExam({ ...values, id: exam.id }))
      : await withMinimumLoad(createExam(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as never, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite || (isEdit && exam?.isLocked === true)}
        onClick={openDialog}
        size={isEdit ? "sm" : "default"}
        type="button"
        variant={isEdit ? "outline" : "default"}
        title={
          isEdit && exam?.isLocked === true ? "Locked exam"
          : canWrite ?
            undefined
          : "Principal only"
        }>
        {isEdit ? "Edit" : "New exam"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit exam" : "New exam"}</DialogTitle>
            <DialogDescription>
              School-wide when class stays blank. Papers carry their own class
              plus subject.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
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
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Exam</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      {examNameNames.map((name) => (
                        <NativeSelectOption
                          key={name}
                          value={name}>
                          {examNameLabels[name]}
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
                name="classId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Class, blank for all
                    </FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value ?? ""}
                      onChange={(event) => {
                        const next =
                          event.target.value === "" ? null : event.target.value;
                        field.onChange(next);
                        setValue("streamId", null, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="">
                        All classes
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
              <Controller
                name="streamId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Stream, blank when none
                    </FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value ?? ""}
                      onChange={(event) => {
                        field.onChange(
                          event.target.value === "" ? null : event.target.value,
                        );
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                      disabled={visibleStreams.length === 0}>
                      <NativeSelectOption value="">
                        No stream
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="startDate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Start date</FieldLabel>
                    <DatePickerField
                      id={field.name}
                      value={field.value}
                      minDate={isEdit ? undefined : todayKey}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ariaInvalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>End date</FieldLabel>
                    <DatePickerField
                      id={field.name}
                      value={field.value}
                      minDate={isEdit ? undefined : todayKey}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ariaInvalid={fieldState.invalid}
                    />
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
                : "Save exam"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const StatusButton = ({ exam }: { exam: ExamRow }) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = NEXT_STATUS[exam.status] ?? null;

  if (!next) return <Badge variant="outline">Final</Badge>;

  const allowed =
    next === "LOCKED" || next === "FINALIZED" ?
      exam.canFinalize
    : exam.canWrite;

  const move = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await withMinimumLoad(
        transitionExamStatus({ examId: exam.id, target: next as never }),
      );
      if (!result.ok) {
        setError(result.errors.root ?? "Could not move this exam.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        disabled={!allowed || busy}
        size="sm"
        type="button"
        variant="outline"
        onClick={move}
        title={allowed ? `Move to ${next}` : "Principal only"}>
        {busy ?
          <>
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
            />
            Working
          </>
        : `To ${next}`}
      </Button>
      {error ?
        <p
          role="alert"
          className="text-destructive text-xs">
          {error}
        </p>
      : null}
    </div>
  );
};

const PaperDialog = ({
  canWrite,
  classSubjects,
  classes,
  exam,
  examClassId,
  examStreamId,
  holidayDates,
  paper,
  streamSubjects,
  subjects,
}: {
  canWrite: boolean;
  classSubjects: { classId: string; subjectId: string }[];
  classes: ClassOption[];
  exam: ExamRow;
  examClassId: string | null;
  examStreamId: string | null;
  holidayDates: string[];
  paper?: ExamPaperRow | null;
  streamSubjects: { streamId: string; subjectId: string }[];
  subjects: SubjectOption[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(paper);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const lockedClass = examClassId ?? paper?.classId ?? "";

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<examPaperType>({
    defaultValues: {
      classId: paper?.classId ?? lockedClass,
      date: paper?.date ?? "",
      durationMin: paper?.durationMin ?? 120,
      examId: exam.id,
      maxMarks: paper ? Number(paper.maxMarks) : 100,
      passMarks: paper ? Number(paper.passMarks) : 40,
      subjectId: paper?.subjectId ?? "",
    },
    mode: "all",
    resolver: zodResolver(examPaperSchema),
  });

  const dateValue = watch("date");
  const onHoliday = dateValue !== "" && holidayDates.includes(dateValue);

  const visibleSubjects = useMemo(() => {
    const activeClass = lockedClass !== "" ? lockedClass : null;
    if (!activeClass) return subjects;
    const classIds = new Set(
      classSubjects
        .filter((row) => row.classId === activeClass)
        .map((row) => row.subjectId),
    );
    if (classIds.size === 0) return [];
    if (examStreamId) {
      const streamIds = new Set(
        streamSubjects
          .filter((row) => row.streamId === examStreamId)
          .map((row) => row.subjectId),
      );
      return subjects.filter(
        (subject) => classIds.has(subject.id) && streamIds.has(subject.id),
      );
    }
    return subjects.filter((subject) => classIds.has(subject.id));
  }, [classSubjects, examStreamId, lockedClass, streamSubjects, subjects]);

  const openDialog = () => {
    reset({
      classId: paper?.classId ?? lockedClass,
      date: paper?.date ?? "",
      durationMin: paper?.durationMin ?? 120,
      examId: exam.id,
      maxMarks: paper ? Number(paper.maxMarks) : 100,
      passMarks: paper ? Number(paper.passMarks) : 40,
      subjectId: paper?.subjectId ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (values: examPaperType) => {
    const payload = {
      ...values,
      classId: lockedClass !== "" ? lockedClass : values.classId,
      examId: exam.id,
    };
    const result =
      isEdit && paper ?
        await withMinimumLoad(updateExamPaper({ ...payload, id: paper.id }))
      : await withMinimumLoad(createExamPaper(payload));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as never, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite || exam.isLocked}
        onClick={openDialog}
        size="sm"
        type="button"
        variant={isEdit ? "outline" : "default"}
        title={
          exam.isLocked ? "Locked exam"
          : canWrite ?
            undefined
          : "Principal only"
        }>
        {isEdit ? "Edit paper" : "New paper"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit paper" : "New paper"}</DialogTitle>
            <DialogDescription>
              {exam.nameLabel} plus {exam.yearName}. Date must sit inside exam
              dates.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="classId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Class</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                      disabled={lockedClass !== ""}>
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
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Controller
                name="maxMarks"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Max marks</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="passMarks"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Pass marks</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="durationMin"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Duration minutes
                    </FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={1}
                      max={600}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="date"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Paper date</FieldLabel>
                  <DatePickerField
                    id={field.name}
                    value={field.value}
                    minDate={isEdit ? undefined : todayKey}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ariaInvalid={fieldState.invalid}
                  />
                  {onHoliday ?
                    <p className="text-muted-foreground text-xs">
                      This date is marked as a holiday or exam break in the
                      calendar. Allowed, but double check cover.
                    </p>
                  : null}
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
                : "Save paper"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const toSlots = (paper: ExamPaperRow) => {
  const base = paper.components.map((row) => ({
    kind: row.kind,
    maxMarks: Number(row.maxMarks),
    passMarks: Number(row.passMarks),
  }));
  while (base.length < 3) {
    base.push({
      kind: "",
      maxMarks: "" as unknown as number,
      passMarks: "" as unknown as number,
    });
  }
  return base.slice(0, 3);
};

const ComponentsDialog = ({
  canWrite,
  paper,
}: {
  canWrite: boolean;
  paper: ExamPaperRow;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<{
    paperId: string;
    slots: {
      kind: string;
      maxMarks: number | string;
      passMarks: number | string;
    }[];
  }>({
    defaultValues: {
      paperId: paper.id,
      slots: toSlots(paper),
    },
    mode: "all",
  });

  const openDialog = () => {
    reset({
      paperId: paper.id,
      slots: toSlots(paper),
    });
    setOpen(true);
  };

  const onSubmit = async (values: {
    slots: {
      kind: string;
      maxMarks: number | string;
      passMarks: number | string;
    }[];
  }) => {
    const components = values.slots
      .filter((row) => row.kind !== "")
      .map((row) => ({
        kind: row.kind as "THEORY" | "PRACTICAL" | "INTERNAL",
        maxMarks: Number(row.maxMarks),
        passMarks: Number(row.passMarks),
      }));
    const kinds = components.map((row) => row.kind);
    if (new Set(kinds).size !== kinds.length) {
      setError("root", {
        message: "Each component kind may appear only once.",
      });
      return;
    }
    for (const row of components) {
      if (!Number.isFinite(row.maxMarks) || row.maxMarks <= 0) {
        setError("root", {
          message: "Enter a positive max for each used row.",
        });
        return;
      }
      if (!Number.isFinite(row.passMarks) || row.passMarks < 0) {
        setError("root", { message: "Enter a valid pass for each used row." });
        return;
      }
      if (row.passMarks >= row.maxMarks) {
        setError("root", { message: "Pass must be less than max." });
        return;
      }
    }
    const result = await withMinimumLoad(
      savePaperComponents({ components, paperId: paper.id }),
    );
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError("root", { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite || paper.isLocked}
        onClick={openDialog}
        size="sm"
        type="button"
        variant="outline"
        title={
          paper.isLocked ? "Locked exam"
          : canWrite ?
            undefined
          : "Principal only"
        }>
        Components
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Paper components</DialogTitle>
            <DialogDescription>
              {paper.subjectName} worth {paper.maxMarks} with pass{" "}
              {paper.passMarks}. Totals must match exactly when components
              exist. Empty list clears components.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-3 rounded-xl border px-3 py-3 sm:grid-cols-3">
                <Controller
                  name={`slots.${index}.kind` as never}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${paper.id}-kind-${index}`}>
                        Kind {index + 1}
                      </FieldLabel>
                      <NativeSelect
                        id={`${paper.id}-kind-${index}`}
                        value={String(field.value ?? "")}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}>
                        <NativeSelectOption value="">None</NativeSelectOption>
                        {componentKindNames.map((kind) => (
                          <NativeSelectOption
                            key={kind}
                            value={kind}>
                            {kind}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name={`slots.${index}.maxMarks` as never}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${paper.id}-max-${index}`}>
                        Max
                      </FieldLabel>
                      <Input
                        id={`${paper.id}-max-${index}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={
                          typeof field.value === "number" ? field.value : ""
                        }
                        onChange={(event) =>
                          field.onChange(Number(event.target.value))
                        }
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name={`slots.${index}.passMarks` as never}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${paper.id}-pass-${index}`}>
                        Pass
                      </FieldLabel>
                      <Input
                        id={`${paper.id}-pass-${index}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={
                          typeof field.value === "number" ? field.value : ""
                        }
                        onChange={(event) =>
                          field.onChange(Number(event.target.value))
                        }
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              Leave unused rows on None. Each kind once. Example Class 10
              Science 100 equals theory 70 plus practical 30.
            </p>
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
                : "Save components"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const columnHelper = legacyCreateColumnHelper<ExamRow>();

const getExamColumns = (options: {
  classes: ClassOption[];
  streams: StreamOption[];
  years: Option[];
}) =>
  columnHelper.columns([
    columnHelper.accessor("nameLabel", {
      cell: ({ getValue, row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{getValue()}</span>
          <span className="text-muted-foreground text-xs">
            {row.original.yearName} plus {row.original.className} plus{" "}
            {row.original.streamName}
          </span>
        </div>
      ),
      header: ({ column }) => (
        <DataTableSortButton
          column={column}
          label="Exam"
        />
      ),
    }),
    columnHelper.accessor("startDate", {
      cell: ({ getValue, row }) => (
        <span className="text-muted-foreground text-sm">
          {getValue()} to {row.original.endDate}
        </span>
      ),
      header: ({ column }) => (
        <DataTableSortButton
          column={column}
          label="Dates"
        />
      ),
    }),
    columnHelper.accessor("status", {
      cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
      header: "Status",
    }),
    columnHelper.accessor("paperCount", {
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">
          {getValue()} papers
        </span>
      ),
      header: "Papers",
    }),
    columnHelper.display({
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <ExamDialog
            canWrite={row.original.canWrite}
            classes={options.classes}
            exam={row.original}
            streams={options.streams}
            years={options.years}
          />
          <StatusButton exam={row.original} />
        </div>
      ),
      header: "Manage",
      id: "manage",
    }),
  ]);

const ExamsList = ({
  canWrite,
  classes,
  classSubjects,
  dir,
  holidayDates,
  page,
  pageSize,
  papers,
  rows,
  sort,
  streamSubjects,
  streams,
  subjects,
  total,
  totalPages,
  years,
}: {
  canWrite: boolean;
  classes: ClassOption[];
  classSubjects: { classId: string; subjectId: string }[];
  dir: string;
  holidayDates: string[];
  page: number;
  pageSize: number;
  papers: ExamPaperRow[];
  rows: ExamRow[];
  sort: string;
  streamSubjects: { streamId: string; subjectId: string }[];
  streams: StreamOption[];
  subjects: SubjectOption[];
  total: number;
  totalPages: number;
  years: Option[];
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const columns = useMemo(
    () => getExamColumns({ classes, streams, years }),
    [classes, streams, years],
  );

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      const params = new URLSearchParams(searchParams.toString());
      if (first && (first.id !== "startDate" || first.desc)) {
        params.set("sort", first.id);
        params.set("dir", first.desc ? "desc" : "asc");
      } else {
        params.delete("sort");
        params.delete("dir");
      }
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    },
    pageCount: totalPages,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ desc: dir === "desc", id: sort }],
    },
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  const papersByExam = useMemo(() => {
    const grouped = new Map<string, ExamPaperRow[]>();
    for (const paper of papers) {
      const list = grouped.get(paper.examId) ?? [];
      list.push(paper);
      grouped.set(paper.examId, list);
    }
    return grouped;
  }, [papers]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Setup uses manage exams. Lock plus finalize uses finalize exams.
              Moves go one step forward only. Papers freeze on lock.
            </p>
            <div className="flex flex-wrap gap-2">
              <ExamDialog
                canWrite={canWrite}
                classes={classes}
                streams={streams}
                years={years}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No exams match these filters."
          minWidthClass="min-w-[860px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} exams. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((exam) => {
          const examPapers = papersByExam.get(exam.id) ?? [];
          return (
            <Card key={exam.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {exam.nameLabel} plus {exam.yearName}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {exam.className} plus {exam.streamName} plus{" "}
                      {exam.startDate} to {exam.endDate} plus {exam.status} plus{" "}
                      {exam.paperCount} papers
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusButton exam={exam} />
                    <PaperDialog
                      canWrite={canWrite}
                      classSubjects={classSubjects}
                      classes={classes}
                      exam={exam}
                      examClassId={exam.classId}
                      examStreamId={exam.streamId}
                      holidayDates={holidayDates}
                      streamSubjects={streamSubjects}
                      subjects={subjects}
                    />
                  </div>
                </div>
                {examPapers.length === 0 ?
                  <p className="text-muted-foreground text-sm">
                    No papers yet. Add the first paper to enable lock.
                  </p>
                : <div className="flex flex-col gap-2">
                    {examPapers.map((paper) => (
                      <div
                        key={paper.id}
                        className="flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {paper.subjectName} plus {paper.className}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {paper.date} plus max {paper.maxMarks} pass{" "}
                            {paper.passMarks} plus {paper.durationMin} min
                            {paper.components.length > 0 ?
                              ` plus ${paper.components
                                .map(
                                  (component) =>
                                    `${component.kind} ${component.maxMarks}/${component.passMarks}`,
                                )
                                .join(", ")}`
                            : " plus no components"}
                            {holidayDates.includes(paper.date) ?
                              " plus holiday hint"
                            : ""}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <PaperDialog
                            canWrite={paper.canWrite}
                            classSubjects={classSubjects}
                            classes={classes}
                            exam={exam}
                            examClassId={exam.classId}
                            examStreamId={exam.streamId}
                            holidayDates={holidayDates}
                            paper={paper}
                            streamSubjects={streamSubjects}
                            subjects={subjects}
                          />
                          <ComponentsDialog
                            canWrite={paper.canWrite}
                            paper={paper}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ExamsList;
