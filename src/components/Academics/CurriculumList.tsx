"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Route } from "next";
import Link from "next/link";
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
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  curriculumLockedEditRequestSchema,
  curriculumMinimumSchema,
  curriculumUnitSchema,
  MAX_CURRICULUM_MINIMUM,
  MIN_CURRICULUM_MINIMUM,
  type curriculumLockedEditRequestType,
  type curriculumMinimumType,
  type curriculumUnitType,
} from "@/lib/zodSchema";
import {
  applyCurriculumLockedEdit,
  createCurriculumUnit,
  decideCurriculumLockedEdit,
  moveCurriculumUnit,
  requestCurriculumLockedEdit,
  setCurriculumMinimum,
  updateCurriculumUnit,
} from "@/server/academics/curriculumActions";

export type CurriculumRow = {
  approvalStatus: string | null;
  canRequest: boolean;
  canWrite: boolean;
  classId: string;
  className: string;
  classOrder: number;
  current: number;
  id: string;
  isLocked: boolean;
  objectives: string | null;
  order: number;
  pendingApprovalId: string | null;
  required: number;
  source: string;
  streamId: string | null;
  streamName: string;
  subjectId: string;
  subjectName: string;
  title: string;
  yearId: string;
  yearName: string;
};

type Option = { id: string; name: string };

type ClassSubjectLink = { classId: string; subjectId: string };

type StreamSubjectLink = { streamId: string; subjectId: string };

type CurriculumListProps = {
  canWrite: boolean;
  classes: (Option & { order: number })[];
  classSubjects: ClassSubjectLink[];
  dir: string;
  page: number;
  pageSize: number;
  principalCount: number;
  rows: CurriculumRow[];
  sort: string;
  streams: { classId: string; id: string; name: string }[];
  streamSubjects: StreamSubjectLink[];
  subjects: { code: string; id: string; name: string }[];
  total: number;
  totalPages: number;
  years: { id: string; name: string; status: string }[];
};

const columnHelper = legacyCreateColumnHelper<CurriculumRow>();

const CurriculumUnitDialog = ({
  canWrite,
  classes,
  classSubjects,
  streams,
  streamSubjects,
  subjects,
  unit,
  years,
}: {
  canWrite: boolean;
  classes: Option[];
  classSubjects: ClassSubjectLink[];
  streams: { classId: string; id: string; name: string }[];
  streamSubjects: StreamSubjectLink[];
  subjects: { code: string; id: string; name: string }[];
  unit?: CurriculumRow | null;
  years: Option[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(unit);

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<curriculumUnitType>({
    defaultValues: {
      classId: unit?.classId ?? "",
      objectives: unit?.objectives ?? "",
      streamId: unit?.streamId ?? null,
      subjectId: unit?.subjectId ?? "",
      title: unit?.title ?? "",
      yearId: unit?.yearId ?? "",
    },
    mode: "all",
    resolver: zodResolver(curriculumUnitSchema),
  });

  const yearId = watch("yearId");
  const classId = watch("classId");
  const streamId = watch("streamId");

  const visibleStreams = useMemo(() => {
    if (!classId) return [];
    return streams.filter((row) => row.classId === classId);
  }, [streams, classId]);

  const visibleSubjects = useMemo(() => {
    if (!classId) return [];
    const classIds = new Set(
      classSubjects
        .filter((row) => row.classId === classId)
        .map((row) => row.subjectId),
    );
    if (classIds.size === 0) return [];
    const activeStream = (streamId ?? "").trim() || null;
    if (activeStream) {
      const streamIds = new Set(
        streamSubjects
          .filter((row) => row.streamId === activeStream)
          .map((row) => row.subjectId),
      );
      const scoped = subjects.filter(
        (subject) => classIds.has(subject.id) && streamIds.has(subject.id),
      );
      if (
        unit?.subjectId &&
        !scoped.some((subject) => subject.id === unit.subjectId)
      ) {
        const current = subjects.find(
          (subject) => subject.id === unit.subjectId,
        );
        if (current) return [...scoped, current];
      }
      return scoped;
    }
    const scoped = subjects.filter((subject) => classIds.has(subject.id));
    if (
      unit?.subjectId &&
      !scoped.some((subject) => subject.id === unit.subjectId)
    ) {
      const current = subjects.find((subject) => subject.id === unit.subjectId);
      if (current) return [...scoped, current];
    }
    return scoped;
  }, [
    classId,
    classSubjects,
    streamId,
    streamSubjects,
    subjects,
    unit?.subjectId,
  ]);

  const openDialog = () => {
    reset({
      classId: unit?.classId ?? "",
      objectives: unit?.objectives ?? "",
      streamId: unit?.streamId ?? null,
      subjectId: unit?.subjectId ?? "",
      title: unit?.title ?? "",
      yearId: unit?.yearId ?? yearId ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (values: curriculumUnitType) => {
    const result =
      isEdit && unit ?
        await withMinimumLoad(updateCurriculumUnit({ ...values, id: unit.id }))
      : await withMinimumLoad(createCurriculumUnit(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof curriculumUnitType, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (unit?.isLocked) return null;

  return (
    <>
      <Button
        disabled={!canWrite}
        onClick={openDialog}
        size={isEdit ? "sm" : "default"}
        type="button"
        variant={isEdit ? "outline" : "default"}
        title={canWrite ? undefined : "Principal only"}>
        {isEdit ? "Edit" : "New unit"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit unit" : "New unit"}</DialogTitle>
            <DialogDescription>
              Nursery to Class 8 writes directly. Class 9 to 12 is locked and
              needs approval.
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
                    placeholder="Fractions introduction"
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
                        const currentStream = getValues("streamId");
                        const keepsStream =
                          typeof currentStream === "string" &&
                          currentStream !== "" &&
                          streams.some(
                            (row) =>
                              row.id === currentStream &&
                              row.classId === nextClass,
                          );
                        const effectiveStream =
                          keepsStream && typeof currentStream === "string" ?
                            currentStream
                          : null;
                        if (!keepsStream) {
                          setValue("streamId", null, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                        const classIds = new Set(
                          classSubjects
                            .filter((row) => row.classId === nextClass)
                            .map((row) => row.subjectId),
                        );
                        let allowed = classIds;
                        if (effectiveStream) {
                          const streamIds = new Set(
                            streamSubjects
                              .filter((row) => row.streamId === effectiveStream)
                              .map((row) => row.subjectId),
                          );
                          allowed = new Set(
                            [...classIds].filter((id) => streamIds.has(id)),
                          );
                        }
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
                        const next =
                          event.target.value === "" ? null : event.target.value;
                        field.onChange(next);
                        const activeClass = getValues("classId");
                        if (!activeClass || !next) return;
                        const classIds = new Set(
                          classSubjects
                            .filter((row) => row.classId === activeClass)
                            .map((row) => row.subjectId),
                        );
                        const streamIds = new Set(
                          streamSubjects
                            .filter((row) => row.streamId === next)
                            .map((row) => row.subjectId),
                        );
                        const currentSubject = getValues("subjectId");
                        if (
                          currentSubject &&
                          (!classIds.has(currentSubject) ||
                            !streamIds.has(currentSubject))
                        ) {
                          setValue("subjectId", "", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
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
                        No subjects mapped to this class yet.{" "}
                        <Link
                          className="text-primary font-medium underline-offset-4 hover:underline"
                          href={"/dashboard/academics/subjects" as Route}>
                          Add one in Subjects
                        </Link>
                        .
                      </p>
                    : null}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="objectives"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    Objectives, optional
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    autoComplete="off"
                    placeholder="What learners will know and do"
                    aria-invalid={fieldState.invalid}
                  />
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

const CurriculumMinimumDialog = ({
  canWrite,
  classes,
  classSubjects,
  subjects,
  years,
}: {
  canWrite: boolean;
  classes: Option[];
  classSubjects: ClassSubjectLink[];
  subjects: Option[];
  years: Option[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<curriculumMinimumType>({
    defaultValues: { classId: "", minUnits: 4, subjectId: "", yearId: "" },
    mode: "all",
    resolver: zodResolver(curriculumMinimumSchema),
  });

  const minimumClassId = watch("classId");

  const visibleMinimumSubjects = useMemo(() => {
    if (!minimumClassId) return [];
    const ids = new Set(
      classSubjects
        .filter((row) => row.classId === minimumClassId)
        .map((row) => row.subjectId),
    );
    if (ids.size === 0) return [];
    return subjects.filter((subject) => ids.has(subject.id));
  }, [classSubjects, minimumClassId, subjects]);

  const onSubmit = async (values: curriculumMinimumType) => {
    const result = await withMinimumLoad(setCurriculumMinimum(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof curriculumMinimumType, { message });
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
        onClick={() => {
          reset({ classId: "", minUnits: 4, subjectId: "", yearId: "" });
          setOpen(true);
        }}
        type="button"
        variant="outline"
        title={canWrite ? undefined : "Principal only"}>
        Set minimum
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set minimum</DialogTitle>
            <DialogDescription>
              Principal minimums for Nursery to Class 8 only,{" "}
              {MIN_CURRICULUM_MINIMUM} to {MAX_CURRICULUM_MINIMUM}. System floor
              is 4.
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
                      {visibleMinimumSubjects.map((subject) => (
                        <NativeSelectOption
                          key={subject.id}
                          value={subject.id}>
                          {subject.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {!minimumClassId ?
                      <p className="text-muted-foreground text-xs">
                        Pick a class to see its subjects.
                      </p>
                    : visibleMinimumSubjects.length === 0 ?
                      <p className="text-muted-foreground text-xs">
                        No subjects mapped to this class yet.{" "}
                        <Link
                          className="text-primary font-medium underline-offset-4 hover:underline"
                          href={"/dashboard/academics/subjects" as Route}>
                          Add one in Subjects
                        </Link>
                        .
                      </p>
                    : null}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="minUnits"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Minimum units</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={MIN_CURRICULUM_MINIMUM}
                      max={MAX_CURRICULUM_MINIMUM}
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
                : "Save minimum"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const LockedEditDialog = ({
  canRequest,
  principalCount,
  unit,
}: {
  canRequest: boolean;
  principalCount: number;
  unit: CurriculumRow;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [decideReason, setDecideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isOnlyPrincipal = unit.canWrite && principalCount < 2;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<curriculumLockedEditRequestType>({
    defaultValues: {
      objectives: unit.objectives ?? "",
      reason: "",
      title: unit.title,
      unitId: unit.id,
    },
    mode: "all",
    resolver: zodResolver(curriculumLockedEditRequestSchema),
  });

  const onRequest = async (values: curriculumLockedEditRequestType) => {
    const result = await withMinimumLoad(
      requestCurriculumLockedEdit({ ...values, unitId: unit.id }),
    );
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof curriculumLockedEditRequestType, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const onDecide = async () => {
    if (!unit.pendingApprovalId) return;
    if (decision === "REJECT" && decideReason.trim() === "") {
      setFeedback("A reason is required to reject.");
      return;
    }
    setBusy(true);
    try {
      const decided = await withMinimumLoad(
        decideCurriculumLockedEdit({
          decision,
          id: unit.pendingApprovalId,
          reason: decideReason,
        }),
      );
      if (!decided.ok) {
        setFeedback(decided.errors.root ?? "Could not decide.");
        return;
      }
      setDecideOpen(false);
      setFeedback(null);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ?
          error.message.slice(0, 200)
        : "Could not decide.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onApply = async () => {
    if (!unit.pendingApprovalId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const applied = await withMinimumLoad(
        applyCurriculumLockedEdit({ id: unit.pendingApprovalId }),
      );
      if (!applied.ok) {
        setFeedback(applied.errors.root ?? "Could not apply.");
        return;
      }
      setFeedback(null);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ?
          error.message.slice(0, 200)
        : "Could not apply.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {unit.pendingApprovalId ?
        <Badge variant="outline">
          {unit.approvalStatus === "APPROVED" ?
            "Approved, apply now"
          : "Pending approval"}
        </Badge>
      : <Button
          disabled={!canRequest}
          onClick={() => {
            reset({
              objectives: unit.objectives ?? "",
              reason: "",
              title: unit.title,
              unitId: unit.id,
            });
            setOpen(true);
          }}
          size="sm"
          type="button"
          variant="outline"
          title={
            canRequest ? undefined : "Assigned teachers or principal only"
          }>
          Request edit
        </Button>
      }
      {(
        unit.pendingApprovalId &&
        unit.approvalStatus === "PENDING" &&
        unit.canWrite
      ) ?
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            setDecision("APPROVE");
            setDecideReason("");
            setFeedback(null);
            setDecideOpen(true);
          }}>
          Review
        </Button>
      : null}
      {(
        unit.pendingApprovalId &&
        unit.approvalStatus === "APPROVED" &&
        unit.canWrite
      ) ?
        <Button
          disabled={busy}
          size="sm"
          type="button"
          onClick={onApply}>
          {busy ?
            <>
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
              />
              Working
            </>
          : "Apply"}
        </Button>
      : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request locked edit</DialogTitle>
            <DialogDescription>
              Teachers, vice principal, or principal may request. A different
              principal must approve. You cannot approve your own request.
            </DialogDescription>
          </DialogHeader>
          {isOnlyPrincipal ?
            <p
              role="note"
              className="bg-muted rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              You are the only principal. If you submit this request, no one can
              approve it. Ask a teacher or the vice principal to submit instead,
              so you can review and approve.
            </p>
          : null}
          <form
            onSubmit={handleSubmit(onRequest)}
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
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="objectives"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Objectives</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Why this locked change is needed"
                    aria-invalid={fieldState.invalid}
                  />
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
                    Sending
                  </>
                : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={decideOpen}
        onOpenChange={setDecideOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review locked edit</DialogTitle>
            <DialogDescription>
              Approve or reject. Rejection needs a reason. No self approval.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={decision === "APPROVE" ? "default" : "outline"}
                onClick={() => setDecision("APPROVE")}>
                Approve
              </Button>
              <Button
                type="button"
                variant={decision === "REJECT" ? "default" : "outline"}
                onClick={() => setDecision("REJECT")}>
                Reject
              </Button>
            </div>
            <Field>
              <FieldLabel htmlFor="locked-decide-reason">
                Reason for rejection
              </FieldLabel>
              <Input
                id="locked-decide-reason"
                value={decideReason}
                onChange={(event) => setDecideReason(event.target.value)}
                placeholder="Required when rejecting"
                autoComplete="off"
              />
            </Field>
            {feedback ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {feedback}
              </p>
            : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setDecideOpen(false)}
              type="button"
              variant="outline">
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={onDecide}
              type="button">
              {busy ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Working
                </>
              : "Decide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {feedback && !decideOpen ?
        <p
          role="alert"
          className="text-destructive text-sm">
          {feedback}
        </p>
      : null}
    </div>
  );
};

const MoveButtons = ({ unit }: { unit: CurriculumRow }) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = async (direction: "up" | "down") => {
    setBusy(true);
    setError(null);
    try {
      const result = await withMinimumLoad(
        moveCurriculumUnit({ direction, id: unit.id }),
      );
      if (!result.ok) {
        setError(result.errors.root ?? "Could not move.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (unit.isLocked) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Button
          disabled={!unit.canWrite || busy}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => move("up")}
          aria-label={`Move ${unit.title} up`}
          title={
            unit.canWrite ? "Move earlier in teaching order" : "Principal only"
          }>
          Up
        </Button>
        <Button
          disabled={!unit.canWrite || busy}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => move("down")}
          aria-label={`Move ${unit.title} down`}
          title={
            unit.canWrite ? "Move later in teaching order" : "Principal only"
          }>
          Down
        </Button>
      </div>
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

const getCurriculumColumns = (principalCount: number) =>
  columnHelper.columns([
    columnHelper.accessor("order", {
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      header: ({ column }) => (
        <DataTableSortButton
          column={column}
          label="Order"
        />
      ),
    }),
    columnHelper.accessor("title", {
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
          label="Title"
        />
      ),
    }),
    columnHelper.accessor("subjectName", {
      cell: ({ getValue }) => <span>{getValue()}</span>,
      header: "Subject",
    }),
    columnHelper.accessor("source", {
      cell: ({ getValue }) =>
        getValue() === "CBSE_LOCKED" ?
          <Badge>Locked</Badge>
        : <Badge variant="outline">School</Badge>,
      header: "Source",
    }),
    columnHelper.accessor("current", {
      cell: ({ getValue, row }) => (
        <span className="text-muted-foreground">
          {getValue()}/{row.original.required} units
        </span>
      ),
      header: "Coverage",
    }),
    columnHelper.display({
      cell: ({ row }) => <MoveButtons unit={row.original} />,
      header: "Order",
      id: "move",
    }),
    columnHelper.display({
      cell: ({ row }) =>
        row.original.isLocked ?
          <LockedEditDialog
            canRequest={row.original.canRequest}
            principalCount={principalCount}
            unit={row.original}
          />
        : <span className="text-muted-foreground text-xs">
            See cards below for edit.
          </span>,
      header: "Locked flow",
      id: "locked",
    }),
  ]);

const CurriculumList = ({
  canWrite,
  classes,
  classSubjects,
  dir,
  page,
  pageSize,
  principalCount,
  rows,
  sort,
  streams,
  streamSubjects,
  subjects,
  total,
  totalPages,
  years,
}: CurriculumListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const columns = useMemo(
    () => getCurriculumColumns(principalCount),
    [principalCount],
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
      if (first && (first.id !== "order" || first.desc)) {
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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Coverage shows current units against required floor plus principal
              minimum. Use Up and Down to reorder teaching sequence. Locked rows
              need approval.
            </p>
            <div className="flex flex-wrap gap-2">
              <CurriculumUnitDialog
                canWrite={canWrite}
                classes={classes}
                classSubjects={classSubjects}
                streams={streams}
                streamSubjects={streamSubjects}
                subjects={subjects}
                years={years}
              />
              <CurriculumMinimumDialog
                canWrite={canWrite}
                classes={classes}
                classSubjects={classSubjects}
                subjects={subjects.map((row) => ({
                  id: row.id,
                  name: `${row.name} (${row.code})`,
                }))}
                years={years}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No curriculum units match these filters."
          minWidthClass="min-w-[860px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} units. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
      <div className="flex flex-col gap-3">
        {rows
          .filter((row) => !row.isLocked)
          .slice(0, 10)
          .map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {row.order}. {row.title}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {row.yearName} plus {row.className} plus {row.subjectName}{" "}
                    plus {row.streamName} plus {row.current}/{row.required}
                  </span>
                  {row.objectives ?
                    <span className="text-sm">{row.objectives}</span>
                  : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <MoveButtons unit={row} />
                  <CurriculumUnitDialog
                    canWrite={canWrite}
                    classes={classes}
                    classSubjects={classSubjects}
                    streams={streams}
                    streamSubjects={streamSubjects}
                    subjects={subjects}
                    unit={row}
                    years={years}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        {rows
          .filter((row) => row.isLocked)
          .slice(0, 10)
          .map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {row.order}. {row.title}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {row.yearName} plus {row.className} plus {row.subjectName}{" "}
                    plus {row.streamName} plus {row.current}/{row.required} plus
                    Locked
                  </span>
                  {row.objectives ?
                    <span className="text-sm">{row.objectives}</span>
                  : null}
                </div>
                <LockedEditDialog
                  canRequest={row.canRequest}
                  principalCount={principalCount}
                  unit={row}
                />
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
};

export default CurriculumList;
