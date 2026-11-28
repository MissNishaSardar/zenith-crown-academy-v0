"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Loader2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import { Card, CardContent } from "@/components/shadcnui/card";
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
  isLockedClassOrder,
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
  reorderCurriculumUnits,
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
  id: string;
  isLocked: boolean;
  objectives: string | null;
  order: number;
  pendingApprovalId: string | null;
  required: number;
  source: string;
  streamId: string | null;
  streamName: string;
  subjectCode: string;
  subjectId: string;
  subjectName: string;
  subjectShort: string;
  title: string;
  yearId: string;
  yearName: string;
};

export type CurriculumGroup = {
  classId: string;
  className: string;
  classOrder: number;
  current: number;
  key: string;
  required: number;
  streamId: string | null;
  streamName: string;
  subjectCode: string;
  subjectId: string;
  subjectName: string;
  subjectShort: string;
  units: CurriculumRow[];
  yearId: string;
  yearName: string;
};

export type CurriculumStats = {
  below: number;
  locked: number;
  meeting: number;
  total: number;
  yearLabel: string;
};

export type CurriculumFilters = {
  classId: string;
  search: string;
  status: string;
  streamId: string;
  subjectId: string;
  yearId: string;
};

type Option = { id: string; name: string };

type ClassSubjectLink = { classId: string; subjectId: string };

type StreamSubjectLink = { streamId: string; subjectId: string };

type DialogData = {
  classes: Option[];
  classSubjects: ClassSubjectLink[];
  streams: { classId: string; id: string; name: string }[];
  streamSubjects: StreamSubjectLink[];
  subjects: { code: string; id: string; name: string }[];
  years: Option[];
};

type CurriculumListProps = DialogData & {
  canRequest: boolean;
  canWrite: boolean;
  groups: CurriculumGroup[];
  initialFilters: CurriculumFilters;
  principalCount: number;
  stats: CurriculumStats;
  totalCount: number;
  truncated: boolean;
};

type Preset = {
  classId: string;
  streamId: string | null;
  subjectId: string;
  yearId: string;
};

const statusOptions = [
  { label: "All", value: "all" },
  { label: "Below minimum", value: "below" },
  { label: "Meeting minimum", value: "meeting" },
  { label: "Locked", value: "locked" },
  { label: "School", value: "school" },
];

const buildQuery = (values: CurriculumFilters): string => {
  const params = new URLSearchParams();
  if (values.search.trim()) params.set("search", values.search.trim());
  if (values.yearId !== "all") params.set("yearId", values.yearId);
  if (values.classId !== "all") params.set("classId", values.classId);
  if (values.subjectId !== "all") params.set("subjectId", values.subjectId);
  if (values.streamId !== "all") params.set("streamId", values.streamId);
  if (values.status !== "all") params.set("status", values.status);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const CurriculumUnitDialog = ({
  buttonLabel,
  canWrite,
  preset,
  unit,
  dialogData,
}: {
  buttonLabel?: string;
  canWrite: boolean;
  preset?: Preset | null;
  unit?: CurriculumRow | null;
  dialogData: DialogData;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(unit);
  const { classes, classSubjects, streams, streamSubjects, subjects, years } =
    dialogData;

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
      classId: unit?.classId ?? preset?.classId ?? "",
      objectives: unit?.objectives ?? "",
      streamId: unit?.streamId ?? preset?.streamId ?? null,
      subjectId: unit?.subjectId ?? preset?.subjectId ?? "",
      title: unit?.title ?? "",
      yearId: unit?.yearId ?? preset?.yearId ?? "",
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
  }, [classId, classSubjects, streamId, streamSubjects, subjects, unit]);

  const openDialog = () => {
    reset({
      classId: unit?.classId ?? preset?.classId ?? "",
      objectives: unit?.objectives ?? "",
      streamId: unit?.streamId ?? preset?.streamId ?? null,
      subjectId: unit?.subjectId ?? preset?.subjectId ?? "",
      title: unit?.title ?? "",
      yearId: unit?.yearId ?? preset?.yearId ?? yearId ?? "",
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
        size={isEdit || buttonLabel ? "sm" : "default"}
        type="button"
        variant={isEdit || buttonLabel ? "outline" : "default"}
        title={canWrite ? undefined : "Principal only"}>
        {isEdit ? "Edit" : (buttonLabel ?? "New unit")}
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
        Coverage rules
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coverage rules</DialogTitle>
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
    <div className="flex items-center gap-1">
      <Button
        disabled={!unit.canWrite || busy}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => move("up")}
        aria-label={`Move ${unit.title} earlier`}
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
        aria-label={`Move ${unit.title} later`}
        title={
          unit.canWrite ? "Move later in teaching order" : "Principal only"
        }>
        Down
      </Button>
      {error ?
        <span
          role="alert"
          className="text-destructive text-xs">
          {error}
        </span>
      : null}
    </div>
  );
};

const SortableUnitRow = ({
  canReorder,
  dialogData,
  index,
  principalCount,
  unit,
}: {
  canReorder: boolean;
  dialogData: DialogData;
  index: number;
  principalCount: number;
  unit: CurriculumRow;
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ disabled: !canReorder || unit.isLocked, id: unit.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <div className="flex items-center gap-2">
        {canReorder && !unit.isLocked ?
          <button
            type="button"
            aria-label={`Drag ${unit.title} to reorder`}
            className="text-muted-foreground hover:text-foreground flex size-7 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
            {...listeners}
            {...attributes}>
            <GripVerticalIcon
              aria-hidden="true"
              className="size-4"
            />
          </button>
        : null}
        <span className="bg-muted flex size-6 items-center justify-center rounded-full text-xs font-medium">
          {index + 1}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{unit.title}</span>
        <span className="text-muted-foreground text-xs">
          {unit.isLocked ? "Locked by principal" : "School unit"}
        </span>
      </div>
      {unit.isLocked ?
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">Locked</Badge>
          <LockedEditDialog
            canRequest={unit.canRequest}
            principalCount={principalCount}
            unit={unit}
          />
        </div>
      : <div className="flex shrink-0 items-center gap-1">
          <MoveButtons unit={unit} />
          <CurriculumUnitDialog
            canWrite={unit.canWrite}
            dialogData={dialogData}
            unit={unit}
          />
        </div>
      }
    </div>
  );
};

const GroupCard = ({
  canRequest,
  canWrite,
  dialogData,
  group,
  principalCount,
}: {
  canRequest: boolean;
  canWrite: boolean;
  dialogData: DialogData;
  group: CurriculumGroup;
  principalCount: number;
}) => {
  const router = useRouter();
  // Reset via parent key (group.key + unit order signature), so no
  // render-phase or effect sync is needed here.
  const [items, setItems] = useState<CurriculumRow[]>(group.units);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const lockedClass = isLockedClassOrder(group.classOrder);
  const canReorder =
    canWrite && !lockedClass && group.units.every((unit) => !unit.isLocked);

  const below = group.current < group.required;
  const percent = Math.min(
    100,
    Math.round((group.current / Math.max(1, group.required)) * 100),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((row) => row.id === active.id);
    const newIndex = items.findIndex((row) => row.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setError(null);
    setSaving(true);
    try {
      const result = await withMinimumLoad(
        reorderCurriculumUnits({
          classId: group.classId,
          streamId: group.streamId,
          subjectId: group.subjectId,
          unitIds: next.map((row) => row.id),
          yearId: group.yearId,
        }),
      );
      if (!result.ok) {
        setItems(group.units);
        setError(result.errors.root ?? "Could not save new order.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="font-medium">
              {`${group.className} - ${group.subjectShort} (${group.subjectCode})`}
            </span>
            <span className="text-muted-foreground text-xs">
              {group.streamName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-muted h-2 w-28 overflow-hidden rounded-full">
              <div
                className={below ? "h-2 bg-amber-500" : "h-2 bg-emerald-500"}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {`${group.current} of ${group.required} units`}
            </span>
            {below ?
              <Badge variant="outline">Below minimum</Badge>
            : <Badge>Meeting minimum</Badge>}
          </div>
        </div>
        {canReorder ?
          <p className="text-muted-foreground text-xs">
            Drag by the grip to reorder teaching sequence. Up and Down remain
            for keyboard control.
            {saving ? " Saving new order." : ""}
          </p>
        : lockedClass ?
          <p className="text-muted-foreground text-xs">
            Locked sequence. Edits need approval.
          </p>
        : null}
        {error ?
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            {error}
          </p>
        : null}
        <DndContext
          id={`curriculum-${group.key}`}
          sensors={sensors}
          onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((row) => row.id)}
            strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {items.map((unit, index) => (
                <SortableUnitRow
                  key={unit.id}
                  canReorder={canReorder}
                  dialogData={dialogData}
                  index={index}
                  principalCount={principalCount}
                  unit={{
                    ...unit,
                    canRequest,
                    canWrite,
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="flex flex-wrap items-center gap-2">
          {!lockedClass ?
            <CurriculumUnitDialog
              buttonLabel={`Add unit to ${group.className} - ${group.subjectShort}`}
              canWrite={canWrite}
              dialogData={dialogData}
              preset={{
                classId: group.classId,
                streamId: group.streamId,
                subjectId: group.subjectId,
                yearId: group.yearId,
              }}
            />
          : null}
          {group.units.some((unit) => unit.isLocked) ?
            <span className="text-muted-foreground text-xs">
              Edits to locked units go to Approvals.{" "}
              <Link
                className="text-primary font-medium underline-offset-4 hover:underline"
                href={"/dashboard/academics/approvals" as Route}>
                View approvals
              </Link>
            </span>
          : null}
        </div>
      </CardContent>
    </Card>
  );
};

const CurriculumList = ({
  canRequest,
  canWrite,
  classes,
  classSubjects,
  groups,
  initialFilters,
  principalCount,
  stats,
  streamSubjects,
  streams,
  subjects,
  totalCount,
  truncated,
  years,
}: CurriculumListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialogData: DialogData = useMemo(
    () => ({
      classes,
      classSubjects,
      streams,
      streamSubjects,
      subjects,
      years,
    }),
    [classes, classSubjects, streams, streamSubjects, subjects, years],
  );

  const urlSearch = (searchParams.get("search") ?? initialFilters.search)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialFilters.search);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  // Render-time guard (not useEffect) so external URL changes sync the
  // input without tripping react-hooks/set-state-in-effect.
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  const yearId = searchParams.get("yearId") ?? initialFilters.yearId;
  const classId = searchParams.get("classId") ?? initialFilters.classId;
  const subjectId = searchParams.get("subjectId") ?? initialFilters.subjectId;
  const streamId = searchParams.get("streamId") ?? initialFilters.streamId;
  const status = searchParams.get("status") ?? initialFilters.status;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      router.replace(
        `${pathname}${buildQuery({ classId, search: search.trim(), status, streamId, subjectId, yearId })}` as Route,
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [
    search,
    urlSearch,
    classId,
    status,
    streamId,
    subjectId,
    yearId,
    pathname,
    router,
  ]);

  const updateFilters = (next: Partial<CurriculumFilters>) => {
    router.replace(
      `${pathname}${buildQuery({
        classId,
        search: search.trim(),
        status,
        streamId,
        subjectId,
        yearId,
        ...next,
      })}` as Route,
    );
  };

  const hasFilter =
    search.trim() !== "" ||
    yearId !== "all" ||
    classId !== "all" ||
    subjectId !== "all" ||
    streamId !== "all" ||
    status !== "all";

  return (
    <div className="flex flex-col gap-4">
      {truncated ?
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {`Showing first ${groups.reduce((sum, group) => sum + group.units.length, 0)} of ${totalCount} units. Narrow filters to see the rest.`}
        </p>
      : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
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
        <CurriculumUnitDialog
          canWrite={canWrite}
          dialogData={dialogData}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-2xl font-semibold">{stats.total}</span>
            <span className="text-muted-foreground text-xs">
              {`Units in ${stats.yearLabel}`}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-2xl font-semibold text-amber-600">
              {stats.below}
            </span>
            <span className="text-muted-foreground text-xs">
              Subjects below minimum
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-2xl font-semibold text-emerald-600">
              {stats.meeting}
            </span>
            <span className="text-muted-foreground text-xs">
              Subjects meeting minimum
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col">
            <span className="text-2xl font-semibold">{stats.locked}</span>
            <span className="text-muted-foreground text-xs">Locked units</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field className="lg:col-span-1">
          <FieldLabel htmlFor="curriculum-search">Search</FieldLabel>
          <Input
            id="curriculum-search"
            type="search"
            autoComplete="off"
            placeholder="Unit title"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="curriculum-year">Year</FieldLabel>
          <NativeSelect
            id="curriculum-year"
            value={yearId}
            onChange={(event) => updateFilters({ yearId: event.target.value })}>
            <NativeSelectOption value="all">All years</NativeSelectOption>
            {years.map((year) => (
              <NativeSelectOption
                key={year.id}
                value={year.id}>
                {year.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="curriculum-class">Class</FieldLabel>
          <NativeSelect
            id="curriculum-class"
            value={classId}
            onChange={(event) =>
              updateFilters({ classId: event.target.value })
            }>
            <NativeSelectOption value="all">All classes</NativeSelectOption>
            {classes.map((schoolClass) => (
              <NativeSelectOption
                key={schoolClass.id}
                value={schoolClass.id}>
                {schoolClass.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="curriculum-subject">Subject</FieldLabel>
          <NativeSelect
            id="curriculum-subject"
            value={subjectId}
            onChange={(event) =>
              updateFilters({ subjectId: event.target.value })
            }>
            <NativeSelectOption value="all">All subjects</NativeSelectOption>
            {subjects.map((subject) => (
              <NativeSelectOption
                key={subject.id}
                value={subject.id}>
                {`${subject.name} (${subject.code})`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="curriculum-stream">Stream</FieldLabel>
          <NativeSelect
            id="curriculum-stream"
            value={streamId}
            onChange={(event) =>
              updateFilters({ streamId: event.target.value })
            }>
            <NativeSelectOption value="all">All streams</NativeSelectOption>
            <NativeSelectOption value="none">No stream</NativeSelectOption>
            {streams.map((stream) => (
              <NativeSelectOption
                key={stream.id}
                value={stream.id}>
                {stream.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="curriculum-status">Status</FieldLabel>
          <NativeSelect
            id="curriculum-status"
            value={status}
            onChange={(event) => updateFilters({ status: event.target.value })}>
            {statusOptions.map((option) => (
              <NativeSelectOption
                key={option.value}
                value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {groups.length === 0 ?
            "No curriculum groups match these filters."
          : `Showing ${groups.length} groups with ${groups.reduce((sum, group) => sum + group.units.length, 0)} units.`
          }
        </p>
        {hasFilter ?
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.replace(pathname as Route)}>
            Clear filters
          </Button>
        : null}
      </div>

      {groups.length === 0 ?
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No curriculum units match these filters. Try clearing filters or
              adding a unit.
            </p>
          </CardContent>
        </Card>
      : <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <GroupCard
              key={`${group.key}:${group.units
                .map((row) => `${row.id}:${row.order}`)
                .join(",")}`}
              canRequest={canRequest}
              canWrite={canWrite}
              dialogData={dialogData}
              group={group}
              principalCount={principalCount}
            />
          ))}
        </div>
      }
    </div>
  );
};

export default CurriculumList;
