"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Loader2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { schoolSettingsSchema, type schoolSettingsType } from "@/lib/zodSchema";
import {
  updateSchoolSettings,
  uploadSchoolLogo,
} from "@/server/admin/settingsActions";

type SchoolSettingsFormProps = {
  initialLogoPath: string | null;
  initialValues: schoolSettingsType;
};

const normalizePhoneDisplay = (value: string): string => {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed === "" || collapsed.startsWith("+")) {
    return collapsed;
  }
  const digits = collapsed.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91 ${digits}`;
  }
  if (/^91[6-9]\d{9}$/.test(digits)) {
    return `+91 ${digits.slice(2)}`;
  }
  return collapsed;
};

const SchoolSettingsForm = ({
  initialLogoPath,
  initialValues,
}: SchoolSettingsFormProps) => {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(initialLogoPath);
  const [prevInitialLogoPath, setPrevInitialLogoPath] = useState<string | null>(
    initialLogoPath,
  );
  if (prevInitialLogoPath !== initialLogoPath) {
    setPrevInitialLogoPath(initialLogoPath);
    setLogoPath(initialLogoPath);
  }
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<schoolSettingsType>({
    defaultValues: initialValues,
    mode: "all",
    resolver: zodResolver(schoolSettingsSchema),
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onSubmit = async (values: schoolSettingsType) => {
    const result = await withMinimumLoad(updateSchoolSettings(values));
    if (!result.ok) {
      if (result.errors.schoolName) {
        setError("schoolName", { message: result.errors.schoolName });
      }
      if (result.errors.motto) {
        setError("motto", { message: result.errors.motto });
      }
      if (result.errors.address) {
        setError("address", { message: result.errors.address });
      }
      if (result.errors.phone) {
        setError("phone", { message: result.errors.phone });
      }
      if (result.errors.email) {
        setError("email", { message: result.errors.email });
      }
      if (result.errors.academicYear) {
        setError("academicYear", { message: result.errors.academicYear });
      }
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      return;
    }
    reset(values);
    router.refresh();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      return;
    }
    setLogoError(null);
    setLogoSuccess(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("logo", selectedFile);
    const result = await withMinimumLoad(uploadSchoolLogo(formData));
    setUploading(false);
    if (!result.ok) {
      setLogoError(
        result.errors.logo ?? result.errors.root ?? "Upload failed.",
      );
      return;
    }
    setLogoPath(result.logoPath);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setLogoSuccess("Logo updated.");
    router.refresh();
  };

  const displayLogo = previewUrl ?? logoPath;
  const dropActive = dragOver && !uploading;

  const selectLogoFile = (next: File | null) => {
    setLogoError(null);
    setLogoSuccess(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(next);
    if (next) {
      setPreviewUrl(URL.createObjectURL(next));
    }
  };

  const openFilePicker = () => {
    if (uploading) {
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-7 rounded-xl border p-7 sm:grid-cols-[168px_1fr]">
        <div>
          <div className="bg-muted flex size-32 items-center justify-center overflow-hidden rounded-xl border sm:size-[168px]">
            {displayLogo ?
              <Image
                src={displayLogo}
                alt="School logo preview"
                width={336}
                height={336}
                unoptimized
                priority
                className="h-full w-full object-contain"
              />
            : <ImageIcon
                aria-hidden="true"
                className="text-muted-foreground size-8"
              />
            }
          </div>
          <span className="text-muted-foreground mt-2.5 block text-center text-[11px]">
            Live preview
          </span>
        </div>
        <div className="min-w-0">
          <div
            role="button"
            tabIndex={!uploading ? 0 : -1}
            aria-label="Drag the new mark here or pick a file from the device"
            aria-disabled={uploading}
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openFilePicker();
              }
            }}
            onDragOver={(event) => {
              if (uploading) {
                return;
              }
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              if (uploading) {
                return;
              }
              event.preventDefault();
              setDragOver(false);
              selectLogoFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={
              dropActive ?
                "border-primary bg-primary/10 cursor-pointer rounded-xl border-[1.5px] border-dashed px-5 py-7 text-center transition-colors"
              : "border-border cursor-pointer rounded-xl border-[1.5px] border-dashed px-5 py-7 text-center transition-colors"
            }>
            <strong className="block text-[15px]">
              Drag the new mark here
            </strong>
            <span className="text-muted-foreground mt-1.5 block text-[13px]">
              or pick a file from the device
            </span>
            <span className="bg-muted mt-3 inline-block rounded-lg border px-3.5 py-2 text-[13px] font-semibold">
              Browse files
            </span>
          </div>
          <input
            ref={fileInputRef}
            id="school-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={uploading}
            onChange={(event) => {
              selectLogoFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-3">
            <div className="text-muted-foreground min-w-0 flex-1 basis-36 truncate text-[13px]">
              {selectedFile ?
                <span>
                  Selected:{" "}
                  <b className="text-foreground font-semibold">
                    {selectedFile.name}
                  </b>
                </span>
              : "No file chosen yet."}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                JPG
              </span>
              <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                PNG
              </span>
              <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                WebP
              </span>
              <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                2MB max
              </span>
              <span className="text-muted-foreground rounded-full border px-2 py-1 text-xs">
                Resized to fit 512
              </span>
            </div>
            <Button
              type="button"
              disabled={!selectedFile || uploading}
              onClick={handleUpload}
              className="ml-auto">
              {uploading ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Uploading
                </>
              : "Upload logo"}
            </Button>
          </div>
          <FieldLabel
            htmlFor="school-logo"
            className="sr-only">
            School logo
          </FieldLabel>
          {logoError ?
            <p
              role="alert"
              className="bg-destructive/10 text-destructive mt-3 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {logoError}
            </p>
          : null}
          {logoSuccess ?
            <p
              role="status"
              className="bg-muted mt-3 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {logoSuccess}
            </p>
          : null}
        </div>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate>
        <FieldGroup>
          <Controller
            name="schoolName"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>School name</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="text"
                  autoComplete="off"
                  placeholder="Zenith Crown Academy"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="motto"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Motto</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="text"
                  autoComplete="off"
                  placeholder="Rise to the highest point"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="address"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Address</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="text"
                  autoComplete="off"
                  placeholder="12 Crown Road"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="phone"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Phone</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="tel"
                  autoComplete="off"
                  placeholder="+91 9876543210"
                  aria-invalid={fieldState.invalid}
                  onBlur={() => {
                    const normalized = normalizePhoneDisplay(field.value);
                    if (normalized !== field.value) {
                      field.onChange(normalized);
                    }
                    field.onBlur();
                  }}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  autoComplete="off"
                  placeholder="info@school.edu"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="academicYear"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Academic year</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="text"
                  autoComplete="off"
                  placeholder="2026/2027"
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
        <div className="mt-5 flex justify-end">
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
            : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SchoolSettingsForm;
