"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/shadcnui/alert";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import DatePickerField from "@/components/Layout/DatePickerField";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  createTimetableSlot,
  proposeSubstitution,
  updateTimetableSlot,
} from "@/server/academics/timetableActions";

export type TimetableSlotRow = {
  dayOfWeek: number;
  endTime: string;
  id: string;
  periodNo: number;
  startTime: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
};

export type TimetableOption = {
  id: string;
  label: string;
};

type TimetableGridProps = {
  classId: string;
  sectionId: string;
  slots: TimetableSlotRow[];
  subjects: TimetableOption[];
  teachers: TimetableOption[];
  yearId: string;
};

type SlotForm = {
  dayOfWeek: number;
  endTime: string;
  periodNo: number;
  startTime: string;
  subjectId: string;
  teacherId: string;
};

const slotDialogSchema = z.object({
  dayOfWeek: z
    .number()
    .int({ error: "Day must be a whole number" })
    .min(1, { error: "Day must be Monday to Friday" })
    .max(5, { error: "Day must be Monday to Friday" }),
  endTime: z.string().trim().min(1, { error: "Enter an end time" }),
  periodNo: z
    .number()
    .int({ error: "Period must be a whole number" })
    .min(1, { error: "Period must be at least 1" })
    .max(8, { error: "Period is at most 8" }),
  startTime: z.string().trim().min(1, { error: "Enter a start time" }),
  subjectId: z.string().min(1, { error: "Pick a subject" }),
  teacherId: z.string().min(1, { error: "Pick a teacher" }),
});

type CoverForm = {
  coverTeacherId: string;
  date: string;
  reason: string;
};

const coverFormSchema = z.object({
  coverTeacherId: z.string().min(1, { error: "Pick a cover teacher" }),
  date: z.string().trim().min(1, { error: "Pick a date" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
});

const days = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
];

const periods = [1, 2, 3, 4, 5, 6, 7, 8];

type SlotChipProps = {
  dragDisabled: boolean;
  moving: boolean;
  onCover: () => void;
  onEdit: () => void;
  slot: TimetableSlotRow;
};

const SlotChip = ({
  dragDisabled,
  moving,
  onCover,
  onEdit,
  slot,
}: SlotChipProps) => {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useDraggable({
      data: { ...slot },
      disabled: dragDisabled || moving,
      id: slot.id,
    });
  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 10 : undefined,
      }}
      className="relative flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {!moving ?
          <button
            type="button"
            aria-label={`Move ${slot.subjectName} to another cell`}
            className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
            {...listeners}
            {...attributes}>
            <GripVerticalIcon
              aria-hidden="true"
              className="size-4"
            />
          </button>
        : null}
        <span className="text-sm font-medium">{slot.subjectName}</span>
      </div>
      <span className="text-muted-foreground text-xs">
        {`${slot.teacherName} ${slot.startTime}-${slot.endTime}`}
      </span>
      {moving ?
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Loader2Icon
            aria-hidden="true"
            className="size-3 animate-spin"
          />
          Moving
        </span>
      : <div className="flex gap-2">
          <Button
            onClick={onEdit}
            size="sm"
            type="button"
            variant="outline">
            Edit
          </Button>
          <Button
            onClick={onCover}
            size="sm"
            type="button"
            variant="ghost">
            Cover
          </Button>
        </div>
      }
    </div>
  );
};

type CellDropProps = {
  children: ReactNode;
  dayOfWeek: number;
  periodNo: number;
};

const CellDrop = ({ children, dayOfWeek, periodNo }: CellDropProps) => {
  const { isOver, setNodeRef } = useDroppable({
    data: { dayOfWeek, periodNo },
    id: `${dayOfWeek}-${periodNo}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={
        isOver ?
          "ring-primary min-h-16 rounded-md ring-2"
        : "min-h-16 rounded-md"
      }>
      {children}
    </div>
  );
};

const TimetableGrid = ({
  classId,
  sectionId,
  slots,
  subjects,
  teachers,
  yearId,
}: TimetableGridProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preset, setPreset] = useState({ dayOfWeek: 1, periodNo: 1 });
  const [rootError, setRootError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [coverSlot, setCoverSlot] = useState<TimetableSlotRow | null>(null);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const {
    control: coverControl,
    handleSubmit: handleCoverSubmit,
    reset: resetCover,
    formState: {
      errors: coverErrors,
      isDirty: coverDirty,
      isSubmitting: coverSubmitting,
    },
  } = useForm<CoverForm>({
    defaultValues: {
      coverTeacherId: teachers[0]?.id ?? "",
      date: "",
      reason: "",
    },
    mode: "all",
    resolver: zodResolver(coverFormSchema),
  });

  const byCell = useMemo(() => {
    const map = new Map<string, TimetableSlotRow>();
    for (const slot of slots) {
      map.set(`${slot.dayOfWeek}-${slot.periodNo}`, slot);
    }
    return map;
  }, [slots]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SlotForm>({
    defaultValues: {
      dayOfWeek: 1,
      endTime: "09:45",
      periodNo: 1,
      startTime: "09:00",
      subjectId: subjects[0]?.id ?? "",
      teacherId: teachers[0]?.id ?? "",
    },
    mode: "all",
    resolver: zodResolver(slotDialogSchema),
  });

  const openCreate = (dayOfWeek: number, periodNo: number) => {
    const existing = byCell.get(`${dayOfWeek}-${periodNo}`);
    setMoveError(null);
    setRootError(null);
    setEditingId(existing?.id ?? null);
    setPreset({ dayOfWeek, periodNo });
    reset({
      dayOfWeek,
      endTime: existing?.endTime ?? "09:45",
      periodNo,
      startTime: existing?.startTime ?? "09:00",
      subjectId: existing?.subjectId ?? subjects[0]?.id ?? "",
      teacherId: existing?.teacherId ?? teachers[0]?.id ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (values: SlotForm) => {
    setRootError(null);
    const payload = {
      classId,
      dayOfWeek: Number(values.dayOfWeek),
      endTime: values.endTime.trim(),
      periodNo: Number(values.periodNo),
      sectionId,
      startTime: values.startTime.trim(),
      subjectId: values.subjectId,
      teacherId: values.teacherId,
      yearId,
    };
    const result =
      editingId ?
        await withMinimumLoad(
          updateTimetableSlot({ ...payload, id: editingId }),
        )
      : await withMinimumLoad(createTimetableSlot(payload));
    if (!result.ok) {
      setRootError(
        result.errors.teacherId ??
          result.errors.periodNo ??
          result.errors.root ??
          "Could not save this slot.",
      );
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const moveSlot = async (
    slot: TimetableSlotRow,
    dayOfWeek: number,
    periodNo: number,
  ) => {
    setMoveError(null);
    setMovingId(slot.id);
    const result = await withMinimumLoad(
      updateTimetableSlot({
        classId,
        dayOfWeek,
        endTime: slot.endTime,
        id: slot.id,
        periodNo,
        sectionId,
        startTime: slot.startTime,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
        yearId,
      }),
    );
    setMovingId(null);
    if (!result.ok) {
      const firstError = Object.values(result.errors)[0];
      setMoveError(
        result.errors.teacherId ??
          result.errors.periodNo ??
          result.errors.subjectId ??
          result.errors.root ??
          (typeof firstError === "string" ? firstError : undefined) ??
          "Could not move this slot.",
      );
      return;
    }
    router.refresh();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const slot = event.active.data.current as TimetableSlotRow | undefined;
    const target = event.over?.data.current as
      { dayOfWeek: number; periodNo: number } | undefined;
    if (!slot || !target) return;
    if (
      slot.dayOfWeek === target.dayOfWeek &&
      slot.periodNo === target.periodNo
    )
      return;
    if (byCell.has(`${target.dayOfWeek}-${target.periodNo}`)) {
      setMoveError("That cell is already taken. Edit the slot to swap times.");
      return;
    }
    void moveSlot(slot, target.dayOfWeek, target.periodNo);
  };

  const onProposeCover = async (values: CoverForm) => {
    setCoverMessage(null);
    if (!coverSlot) {
      setCoverMessage("Pick a slot first.");
      return;
    }
    const result = await withMinimumLoad(
      proposeSubstitution({
        coverTeacherId: values.coverTeacherId,
        date: values.date,
        reason: values.reason.trim(),
        slotId: coverSlot.id,
      }),
    );
    if (!result.ok) {
      setCoverMessage(
        result.errors.coverTeacherId ??
          result.errors.date ??
          result.errors.root ??
          "Cover request failed.",
      );
      return;
    }
    setCoverMessage("Cover proposed. Vice Principal or Principal approves.");
    resetCover({
      coverTeacherId: teachers[0]?.id ?? "",
      date: "",
      reason: "",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          Drag a slot by its grip to another cell to move it. Teacher double
          booking is hard blocked with audit. Cover needs approval.
        </AlertDescription>
      </Alert>
      {moveError ?
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {moveError}
        </p>
      : null}
      <DndContext
        id="timetable-grid"
        sensors={sensors}
        onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                {days.map((day) => (
                  <TableHead key={day.value}>{day.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow key={period}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {`P${period}`}
                  </TableCell>
                  {days.map((day) => {
                    const slot = byCell.get(`${day.value}-${period}`);
                    return (
                      <TableCell key={day.value}>
                        <CellDrop
                          dayOfWeek={day.value}
                          periodNo={period}>
                          {slot ?
                            <SlotChip
                              dragDisabled={movingId !== null}
                              moving={movingId === slot.id}
                              onCover={() => {
                                setCoverSlot(slot);
                                setCoverMessage(null);
                              }}
                              onEdit={() => openCreate(day.value, period)}
                              slot={slot}
                            />
                          : <Button
                              onClick={() => openCreate(day.value, period)}
                              size="sm"
                              type="button"
                              variant="ghost">
                              {`Add P${period}`}
                            </Button>
                          }
                        </CellDrop>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DndContext>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit slot" : "Add slot"}</DialogTitle>
            <DialogDescription>
              {`Day ${preset.dayOfWeek} period ${preset.periodNo}. Clash is blocked.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
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
                      {subjects.map((subject) => (
                        <NativeSelectOption
                          key={subject.id}
                          value={subject.id}>
                          {subject.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="teacherId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Teacher</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      {teachers.map((teacher) => (
                        <NativeSelectOption
                          key={teacher.id}
                          value={teacher.id}>
                          {teacher.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="startTime"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Start</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="time"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="endTime"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>End</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="time"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            {rootError ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {rootError}
              </p>
            : null}
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
                : "Save slot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={coverSlot !== null}
        onOpenChange={(next) => {
          if (!next) setCoverSlot(null);
        }}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Propose cover</DialogTitle>
            <DialogDescription>
              {coverSlot ?
                `${coverSlot.subjectName} period ${coverSlot.periodNo}. Office proposes, Vice Principal or Principal approves.`
              : "Pick a slot first."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleCoverSubmit(onProposeCover)}
            noValidate
            className="flex flex-col gap-3">
            <Controller
              name="date"
              control={coverControl}
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
            <Controller
              name="coverTeacherId"
              control={coverControl}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Cover teacher</FieldLabel>
                  <NativeSelect
                    id={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}>
                    {teachers.map((teacher) => (
                      <NativeSelectOption
                        key={teacher.id}
                        value={teacher.id}>
                        {teacher.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="reason"
              control={coverControl}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Leave or duty cause"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {coverErrors.root ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {coverErrors.root.message}
              </p>
            : null}
            {coverMessage ?
              <p className="text-muted-foreground text-sm">{coverMessage}</p>
            : null}
          </form>
          <DialogFooter>
            <Button
              onClick={() => {
                setCoverSlot(null);
                setCoverMessage(null);
              }}
              type="button"
              variant="outline">
              Close
            </Button>
            <Button
              onClick={handleCoverSubmit(onProposeCover)}
              type="button"
              disabled={!coverDirty || coverSubmitting || !coverSlot}>
              {coverSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Sending
                </>
              : "Send for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {`${slots.length} slots in this section. Timetable skips holidays.`}
            <Badge
              variant="secondary"
              className="ml-2 w-fit whitespace-nowrap">
              Mon to Fri, 8 periods
            </Badge>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetableGrid;
