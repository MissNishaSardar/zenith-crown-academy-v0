"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
import { Checkbox } from "@/components/shadcnui/checkbox";
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
import { streamSchema } from "@/lib/zodSchema";
import {
  addStreamSubject,
  createStream,
} from "@/server/academics/subjectActions";

export type StreamRow = {
  canWrite: boolean;
  classId: string;
  className: string;
  id: string;
  name: string;
  subjectCount: number;
  subjectIds: string[];
  subjectNames: string;
};

export type StreamClassOption = {
  id: string;
  name: string;
};

export type StreamSubjectOption = {
  code: string;
  id: string;
  name: string;
};

export type ClassSubjectLink = {
  classId: string;
  subjectId: string;
};

type StreamsListProps = {
  canWrite: boolean;
  classId: string;
  classes: StreamClassOption[];
  classSubjects: ClassSubjectLink[];
  dir: string;
  page: number;
  pageSize: number;
  rows: StreamRow[];
  search: string;
  sort: string;
  subjects: StreamSubjectOption[];
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<StreamRow>();

const streamsColumns = columnHelper.columns([
  columnHelper.accessor("className", {
    cell: ({ getValue }) => (
      <Badge
        variant="secondary"
        className="w-fit whitespace-nowrap">
        {getValue()}
      </Badge>
    ),
    header: "Class",
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Stream"
      />
    ),
  }),
  columnHelper.accessor("subjectCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Subjects",
  }),
  columnHelper.accessor("subjectNames", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground line-clamp-2">{getValue()}</span>
    ),
    header: "Mapped codes",
  }),
]);

const StreamDialog = ({
  canWrite,
  classes,
}: {
  canWrite: boolean;
  classes: StreamClassOption[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<{ classId: string; name: string }>({
    defaultValues: { classId: "", name: "" },
    mode: "all",
    resolver: zodResolver(streamSchema.omit({ id: true })),
  });

  const onSubmit = async (values: { classId: string; name: string }) => {
    const result = await withMinimumLoad(createStream(values));
    if (!result.ok) {
      for (const [field, message] of Object.entries(result.errors)) {
        if (!message) continue;
        if (field === "root") setError("root", { message });
        else if (field === "classId" || field === "name") {
          setError(field, { message });
        } else setError("root", { message });
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
          reset({ classId: "", name: "" });
          setOpen(true);
        }}
        type="button"
        title={canWrite ? undefined : "Principal only"}>
        New stream
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New stream</DialogTitle>
            <DialogDescription>
              Tracks exist for Class 11 and 12 only. Map subjects after
              creating.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Stream name</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Science"
                    aria-invalid={fieldState.invalid}
                  />
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
                    onChange={field.onChange}
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
                : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const mapSubjectsSchema = z.object({
  subjectIds: z
    .array(z.string().min(1))
    .min(1, { error: "Pick at least one subject" })
    .max(100, { error: "Too many subjects" }),
});

type MapSubjectsType = z.infer<typeof mapSubjectsSchema>;

const MapSubjectsDialog = ({
  canWrite,
  classSubjects,
  stream,
  subjects,
}: {
  canWrite: boolean;
  classSubjects: ClassSubjectLink[];
  stream: StreamRow;
  subjects: StreamSubjectOption[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const mapped = useMemo(() => new Set(stream.subjectIds), [stream.subjectIds]);

  const candidates = useMemo(() => {
    const classIds = new Set(
      classSubjects
        .filter((row) => row.classId === stream.classId)
        .map((row) => row.subjectId),
    );
    return subjects.filter(
      (subject) => classIds.has(subject.id) && !mapped.has(subject.id),
    );
  }, [classSubjects, mapped, stream.classId, subjects]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<MapSubjectsType>({
    defaultValues: { subjectIds: [] },
    mode: "all",
    resolver: zodResolver(mapSubjectsSchema),
  });

  const onSubmit = async (values: MapSubjectsType) => {
    for (const subjectId of values.subjectIds) {
      const result = await withMinimumLoad(
        addStreamSubject({ streamId: stream.id, subjectId }),
      );
      if (!result.ok) {
        const first = Object.values(result.errors).find(Boolean);
        setError("root", {
          message: first ?? "Could not map this subject.",
        });
        return;
      }
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite}
        onClick={() => {
          reset({ subjectIds: [] });
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
        title={canWrite ? undefined : "Principal only"}>
        Map subjects
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map subjects</DialogTitle>
            <DialogDescription>
              {mapped.size === 0 ?
                `${stream.name} (${stream.className}) maps nothing yet. Only subjects mapped to the class can be added.`
              : `${stream.name} (${stream.className}) already maps ${mapped.size === 1 ? "1 subject" : `${mapped.size} subjects`}. Only subjects mapped to the class can be added.`
              }
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <Controller
              name="subjectIds"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Subjects</FieldLabel>
                  {candidates.length > 0 ?
                    <div className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
                      {candidates.map((subject) => {
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
                  : <p className="text-muted-foreground text-sm">
                      No unmapped class subjects left. Map one in Subjects
                      first.
                    </p>
                  }
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
                : "Map"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const StreamsList = ({
  canWrite,
  classId: initialClassId,
  classes,
  classSubjects,
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  subjects,
  total,
  totalPages,
}: StreamsListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = (searchParams.get("search") ?? initialSearch)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }
  const classId = searchParams.get("classId") ?? initialClassId;

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (classId !== "all") params.set("classId", classId);
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, classId, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: useMemo(
      () => [
        ...streamsColumns,
        columnHelper.display({
          cell: ({ row }) => (
            <MapSubjectsDialog
              canWrite={canWrite}
              classSubjects={classSubjects}
              stream={row.original}
              subjects={subjects}
            />
          ),
          header: "Map",
          id: "map",
        }),
      ],
      [canWrite, classSubjects, subjects],
    ),
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (classId !== "all") params.set("classId", classId);
      if (first && (first.id !== "name" || first.desc)) {
        params.set("sort", first.id);
        params.set("dir", first.desc ? "desc" : "asc");
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
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (classId !== "all") params.set("classId", classId);
    if (sort !== "name" || dir !== "asc") {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="sm:flex-row sm:items-end sm:gap-4">
          <Field className="flex-1">
            <FieldLabel htmlFor="streams-search">Search streams</FieldLabel>
            <Input
              autoComplete="off"
              id="streams-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Stream name like Science"
              type="search"
              value={search}
            />
          </Field>
          <Field className="sm:w-auto">
            <FieldLabel htmlFor="streams-class">Class</FieldLabel>
            <NativeSelect
              className="w-full sm:w-44"
              id="streams-class"
              onChange={(event) => {
                const params = new URLSearchParams();
                if (search.trim()) params.set("search", search.trim());
                if (event.target.value !== "all")
                  params.set("classId", event.target.value);
                params.set("page", "1");
                router.replace(`${pathname}?${params.toString()}` as Route);
              }}
              value={classId}>
              <NativeSelectOption value="all">All classes</NativeSelectOption>
              {classes.map((option) => (
                <NativeSelectOption
                  key={option.id}
                  value={option.id}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button
            disabled={search.trim() === "" && classId === "all"}
            onClick={() => {
              setSearch("");
              router.replace(`${pathname}?page=1` as Route);
            }}
            type="button"
            variant="outline">
            Clear
          </Button>
          <StreamDialog
            canWrite={canWrite}
            classes={classes}
          />
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No streams match these filters."
          minWidthClass="min-w-[680px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} streams. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default StreamsList;
