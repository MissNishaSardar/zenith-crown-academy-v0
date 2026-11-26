"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { revalidatePath } from "next/cache";

import prisma from "@/lib/dbClient/prisma";
import { ensureSchoolSettings } from "@/lib/school-branding";
import { schoolSettingsSchema, type schoolSettingsType } from "@/lib/zodSchema";
import { logAudit, toSchoolSettingsAuditSnapshot } from "@/server/audit";
import { assertPermission } from "@/server/guards";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type UpdateSchoolSettingsResult =
  | { ok: true }
  | {
      errors: Partial<
        Record<
          | "academicYear"
          | "address"
          | "email"
          | "motto"
          | "phone"
          | "root"
          | "schoolName",
          string
        >
      >;
      ok: false;
    };

export const updateSchoolSettings = async (
  input: schoolSettingsType,
): Promise<UpdateSchoolSettingsResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const parsed = schoolSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<
      Record<
        "academicYear" | "address" | "email" | "motto" | "phone" | "schoolName",
        string
      >
    > = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "schoolName" ||
          field === "motto" ||
          field === "address" ||
          field === "phone" ||
          field === "email" ||
          field === "academicYear") &&
        !(errors as Record<string, string>)[field as string]
      ) {
        (errors as Record<string, string>)[field as string] = issue.message;
      }
    }
    if (Object.keys(errors).length > 0) {
      return { errors, ok: false };
    }
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }

  const current = await ensureSchoolSettings();
  const before = toSchoolSettingsAuditSnapshot(current);

  const row = await prisma.schoolSettings.update({
    data: { ...parsed.data },
    where: { id: current.id },
  });

  await logAudit({
    action: "update",
    actor,
    after: toSchoolSettingsAuditSnapshot(row),
    before,
    entity: "school_settings",
    entityId: row.id,
  });

  revalidatePath("/dashboard/administrator/settings");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/forgot-password");
  revalidatePath("/reset-password");
  return { ok: true };
};

export type UploadSchoolLogoResult =
  | { logoPath: string; ok: true }
  | { errors: Partial<Record<"logo" | "root", string>>; ok: false };

export const uploadSchoolLogo = async (
  formData: FormData,
): Promise<UploadSchoolLogoResult> => {
  const session = await assertPermission("system:manage");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { errors: { logo: "Choose an image file." }, ok: false };
  }
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return { errors: { logo: "Use JPG, PNG or WebP." }, ok: false };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { errors: { logo: "Logo must be 2MB or less." }, ok: false };
  }

  const current = await ensureSchoolSettings();
  const before = toSchoolSettingsAuditSnapshot(current);

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = await sharp(Buffer.from(arrayBuffer))
      .resize({
        fit: "inside",
        height: 512,
        width: 512,
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { errors: { logo: "Could not read this image." }, ok: false };
  }

  const fileName = `school-logo-${Date.now()}.webp`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const absolutePath = path.join(uploadsDir, fileName);
  await writeFile(absolutePath, buffer);

  const logoPath = `/uploads/${fileName}`;
  const row = await prisma.schoolSettings.update({
    data: { logoPath },
    where: { id: current.id },
  });

  const oldPath = current.logoPath;
  if (oldPath && oldPath.startsWith("/uploads/") && oldPath !== logoPath) {
    const oldAbsolute = path.join(
      process.cwd(),
      "public",
      oldPath.replace(/^\//, ""),
    );
    try {
      await unlink(oldAbsolute);
    } catch {
      // Old file already gone, keep new logo saved.
    }
  }

  await logAudit({
    action: "upload-logo",
    actor,
    after: toSchoolSettingsAuditSnapshot(row),
    before,
    entity: "school_settings",
    entityId: row.id,
  });

  revalidatePath("/dashboard/administrator/settings");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/");
  revalidatePath("/login");
  revalidatePath("/forgot-password");
  revalidatePath("/reset-password");
  return { logoPath, ok: true };
};
