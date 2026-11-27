"use server";

import { Prisma } from "@generated/prisma/client";
import { generateRandomString, hashPassword } from "better-auth/crypto";

import { can } from "@/lib/auth/permissions";
import { suggestUsernames } from "@/lib/admin/usernames";
import {
  admissionSubmitSchema,
  admissionSubmitType,
  isEligibleForStudentLogin,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit } from "@/server/audit";
import { createApprovalRequest } from "@/server/admin/roleActions";
import { upsertGuardianLink } from "@/server/academics/guardianActions";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

export type AdmissionInvite = {
  email: string;
  userId: string;
} | null;

export type AdmissionResult =
  | {
      admission: {
        admissionNo: string;
        approvalId: string;
        duplicateContact: boolean;
        guardianId: string;
        invite: AdmissionInvite;
        studentId: string;
        wardFlag: boolean;
        wardStaffId: string | null;
      };
      ok: true;
    }
  | {
      errors: {
        guardian?: Partial<
          Record<
            | "address"
            | "email"
            | "name"
            | "phone"
            | "relation"
            | "relationNote",
            string
          >
        >;
        root?: string;
        student?: Partial<
          Record<
            | "address"
            | "classId"
            | "dob"
            | "firstName"
            | "gender"
            | "lastName"
            | "photoPath"
            | "previousSchool"
            | "sectionId"
            | "yearId",
            string
          >
        >;
      };
      ok: false;
    };

type AdmissionErrors = Extract<AdmissionResult, { ok: false }>["errors"];

const requirePersonWrite = async () => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  // office_staff holds academic:view for read and is explicitly granted
  // person write for front-office data entry. Keep this grant next to the
  // manage-curriculum and system:manage checks so the bypass stays visible.
  const allowed =
    active !== null &&
    (can(active, "academic:manage-curriculum") ||
      active === "office_staff" ||
      can(active, "system:manage"));
  if (!allowed) {
    await logAudit({
      action: "permission-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: {
        active: active ?? null,
        blocked: true,
        permission: "academic:manage-curriculum",
        reason: "office-grant-denied",
      },
      before: null,
      entity: "admission",
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  return {
    actor: {
      email: session.user.email,
      id: session.user.id,
      role: session.user.role,
    },
  };
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toLowerCase();
};

const normalizeText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === "" ? null : trimmed;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const toAdmissionErrors = (
  issues: { message: string; path: (string | number)[] }[],
): AdmissionErrors => {
  const errors: AdmissionErrors = {};
  for (const issue of issues) {
    const segments = issue.path.map(String);
    if (segments[0] === "student" && segments[1]) {
      errors.student = {
        ...errors.student,
        [segments[1]]: issue.message,
      };
    } else if (segments[0] === "guardian" && segments[1]) {
      errors.guardian = {
        ...errors.guardian,
        [segments[1]]: issue.message,
      };
    } else if (!errors.root) {
      errors.root = issue.message;
    }
  }
  return errors;
};

const generateAdmissionNo = async (
  yearId: string,
  yearName: string,
): Promise<string> => {
  const prefix = yearName.trim().replace(/\//g, "-");
  const count = await prisma.studentProfile.count({ where: { yearId } });
  let seq = count + 1;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${prefix}/${String(seq).padStart(3, "0")}`;
    const existing = await prisma.studentProfile.findUnique({
      where: { admissionNo: candidate },
    });
    if (!existing) return candidate;
    seq += 1;
  }
  throw new Error("Could not generate a unique admission number.");
};

const surnameOf = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? "").toLowerCase();
};

const findGuardianMatch = async (phone: string, email: string | null) => {
  const byPhone = await prisma.guardian.findFirst({ where: { phone } });
  if (byPhone) return { guardian: byPhone, matchedBy: "phone" as const };
  if (email) {
    const byEmail = await prisma.guardian.findFirst({ where: { email } });
    if (byEmail) return { guardian: byEmail, matchedBy: "email" as const };
  }
  return null;
};

const findWardStaff = async (args: {
  guardianAddress: string;
  guardianPhone: string;
  guardianSurname: string;
  studentAddress: string;
  studentLastName: string;
}) => {
  const candidates = await prisma.staffProfile.findMany({
    where: { phone: args.guardianPhone },
  });
  const guardianAddress = args.guardianAddress.trim().toLowerCase();
  const studentAddress = args.studentAddress.trim().toLowerCase();
  for (const staff of candidates) {
    const staffAddress = staff.address.trim().toLowerCase();
    const addressMatch =
      staffAddress === guardianAddress || staffAddress === studentAddress;
    if (!addressMatch) continue;
    const staffSurname = staff.lastName.trim().toLowerCase();
    if (
      staffSurname !== "" &&
      (staffSurname === args.guardianSurname ||
        staffSurname === args.studentLastName.trim().toLowerCase())
    ) {
      return staff;
    }
  }
  return null;
};

export const provisionParentInvite = async (
  guardianId: string,
  actorId: string,
): Promise<{ created: boolean; userId: string | null }> => {
  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
  });
  if (!guardian || guardian.userId || !guardian.email) {
    return { created: false, userId: guardian?.userId ?? null };
  }
  const email = guardian.email.trim().toLowerCase();
  const existingUser = await prisma.user.findFirst({ where: { email } });
  if (existingUser) {
    const held = await prisma.userRole.findMany({
      include: { role: true },
      where: { userId: existingUser.id },
    });
    const slugs = held.map((row) => row.role.slug);
    const fallback = existingUser.role
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const combined = [...new Set([...slugs, ...fallback])];
    if (!combined.includes("parent")) {
      await logAudit({
        action: "invite-blocked",
        actor: { id: actorId },
        after: {
          email,
          guardianId,
          reason: "email-held-without-parent-role",
        },
        before: null,
        entity: "guardian",
        entityId: guardian.id,
      });
      return { created: false, userId: null };
    }
    await prisma.guardian.update({
      data: { userId: existingUser.id },
      where: { id: guardian.id },
    });
    await logAudit({
      action: "invite-link",
      actor: { id: actorId },
      after: { email, guardianId, userId: existingUser.id },
      before: { guardianId, userId: null },
      entity: "guardian",
      entityId: guardian.id,
    });
    return { created: false, userId: existingUser.id };
  }
  const suggestions = await suggestUsernames(guardian.name, prisma);
  const fallbackBase = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 30);
  const username =
    suggestions[0] ??
    (fallbackBase && fallbackBase.length >= 3 ? fallbackBase : null) ??
    `parent${Date.now().toString().slice(-6)}`;
  const createdUserId = generateRandomString(32);
  const parentPasswordHash = await hashPassword(generateRandomString(32));
  await prisma.user.create({
    data: {
      activeRole: "parent",
      email,
      emailVerified: true,
      id: createdUserId,
      name: guardian.name.slice(0, 100),
      role: "parent",
      username,
    },
  });
  await prisma.account.create({
    data: {
      accountId: createdUserId,
      id: generateRandomString(32),
      password: parentPasswordHash,
      providerId: "credential",
      userId: createdUserId,
    },
  });
  await prisma.role.upsert({
    create: { label: "Parent", slug: "parent" },
    update: { label: "Parent" },
    where: { slug: "parent" },
  });
  const roleRow = await prisma.role.findUniqueOrThrow({
    where: { slug: "parent" },
  });
  await prisma.userRole.upsert({
    create: {
      assignedBy: actorId,
      isPrimary: true,
      roleId: roleRow.id,
      userId: createdUserId,
    },
    update: {},
    where: {
      userId_roleId: { roleId: roleRow.id, userId: createdUserId },
    },
  });
  await prisma.guardian.update({
    data: { userId: createdUserId },
    where: { id: guardian.id },
  });
  await logAudit({
    action: "invite-create",
    actor: { id: actorId },
    after: { email, guardianId, role: "parent", userId: createdUserId },
    before: { guardianId, userId: null },
    entity: "guardian",
    entityId: guardian.id,
  });
  return { created: true, userId: createdUserId };
};

const buildStudentEmail = (admissionNo: string): string => {
  const slug = admissionNo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const base = slug === "" ? "student" : slug;
  return `${base}@students.local`;
};

export type StudentLoginResult = {
  created: boolean;
  email: string | null;
  userId: string | null;
  username: string | null;
};

export const provisionStudentLogin = async (
  studentId: string,
  actorId: string,
): Promise<StudentLoginResult> => {
  const student = await prisma.studentProfile.findUnique({
    include: { class: { select: { order: true } } },
    where: { id: studentId },
  });
  if (!student) {
    return { created: false, email: null, userId: null, username: null };
  }
  if (student.userId) {
    const linked = await prisma.user.findUnique({
      where: { id: student.userId },
    });
    return {
      created: false,
      email: linked?.email ?? null,
      userId: student.userId,
      username: linked?.username ?? null,
    };
  }
  if (!isEligibleForStudentLogin(student.class.order)) {
    return { created: false, email: null, userId: null, username: null };
  }
  const baseEmail = buildStudentEmail(student.admissionNo).toLowerCase();
  let email = baseEmail;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (!existing) break;
    const held = await prisma.userRole.findMany({
      include: { role: true },
      where: { userId: existing.id },
    });
    const slugs = held.map((row) => row.role.slug);
    if (slugs.includes("student")) {
      await prisma.studentProfile.update({
        data: { userId: existing.id },
        where: { id: student.id },
      });
      await logAudit({
        action: "invite-link",
        actor: { id: actorId },
        after: { email, studentId: student.id, userId: existing.id },
        before: { studentId: student.id, userId: null },
        entity: "student-profile",
        entityId: student.id,
      });
      return {
        created: false,
        email,
        userId: existing.id,
        username: existing.username,
      };
    }
    const at = baseEmail.lastIndexOf("@");
    const local = baseEmail.slice(0, at);
    const domain = baseEmail.slice(at);
    email = `${local}-${attempt + 2}${domain}`;
  }
  const taken = await prisma.user.findFirst({ where: { email } });
  if (taken) {
    await logAudit({
      action: "invite-blocked",
      actor: { id: actorId },
      after: { email, reason: "email-held-without-student-role", studentId },
      before: null,
      entity: "student-profile",
      entityId: student.id,
    });
    return { created: false, email: null, userId: null, username: null };
  }
  const suggestions = await suggestUsernames(
    `${student.firstName} ${student.lastName}`,
    prisma,
  );
  const fallbackBase = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 30);
  const username =
    suggestions[0] ??
    (fallbackBase && fallbackBase.length >= 3 ? fallbackBase : null) ??
    `student${Date.now().toString().slice(-6)}`;
  const createdStudentId = generateRandomString(32);
  const studentPasswordHash = await hashPassword(generateRandomString(32));
  const studentName = `${student.firstName} ${student.lastName}`
    .trim()
    .slice(0, 100);
  await prisma.user.create({
    data: {
      activeRole: "student",
      email,
      emailVerified: true,
      id: createdStudentId,
      name: studentName,
      role: "student",
      username,
    },
  });
  await prisma.account.create({
    data: {
      accountId: createdStudentId,
      id: generateRandomString(32),
      password: studentPasswordHash,
      providerId: "credential",
      userId: createdStudentId,
    },
  });
  await prisma.role.upsert({
    create: { label: "Student", slug: "student" },
    update: { label: "Student" },
    where: { slug: "student" },
  });
  const roleRow = await prisma.role.findUniqueOrThrow({
    where: { slug: "student" },
  });
  await prisma.userRole.upsert({
    create: {
      assignedBy: actorId,
      isPrimary: true,
      roleId: roleRow.id,
      userId: createdStudentId,
    },
    update: {},
    where: {
      userId_roleId: { roleId: roleRow.id, userId: createdStudentId },
    },
  });
  await prisma.studentProfile.update({
    data: { userId: createdStudentId },
    where: { id: student.id },
  });
  await logAudit({
    action: "invite-create",
    actor: { id: actorId },
    after: {
      classOrder: student.class.order,
      email,
      role: "student",
      studentId: student.id,
      userId: createdStudentId,
    },
    before: { studentId: student.id, userId: null },
    entity: "student-profile",
    entityId: student.id,
  });
  return { created: true, email, userId: createdStudentId, username };
};

export const submitAdmission = async (
  input: admissionSubmitType,
): Promise<AdmissionResult> => {
  const { actor } = await requirePersonWrite();
  const parsed = admissionSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toAdmissionErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const studentInput = parsed.data.student;
  const guardianInput = parsed.data.guardian;
  const year = await prisma.academicYear.findUnique({
    where: { id: studentInput.yearId },
  });
  if (!year) {
    return {
      errors: { student: { yearId: "Pick a valid academic year." } },
      ok: false,
    };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: studentInput.classId },
  });
  if (!schoolClass) {
    return {
      errors: { student: { classId: "Pick a valid class." } },
      ok: false,
    };
  }
  const sectionId = normalizeId(studentInput.sectionId);
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return {
        errors: { student: { sectionId: "Pick a valid section." } },
        ok: false,
      };
    }
    if (
      section.yearId !== studentInput.yearId ||
      section.classId !== studentInput.classId
    ) {
      return {
        errors: {
          student: {
            sectionId: "Section does not belong to this year and class.",
          },
        },
        ok: false,
      };
    }
  }
  const previousSchool = normalizeText(studentInput.previousSchool, 120);
  if (schoolClass.order >= 4 && !previousSchool) {
    return {
      errors: { student: { previousSchool: "Enter the previous school." } },
      ok: false,
    };
  }
  const guardianPhone = guardianInput.phone.trim();
  const guardianEmail = normalizeEmail(guardianInput.email);
  const guardianAddress = guardianInput.address.trim();
  const studentAddress = studentInput.address.trim();
  const match = await findGuardianMatch(guardianPhone, guardianEmail);
  let guardianId: string;
  let duplicateContact = false;
  if (match) {
    guardianId = match.guardian.id;
    duplicateContact = true;
    if (!match.guardian.userId && guardianEmail) {
      const userByEmail = await prisma.user.findFirst({
        where: { email: guardianEmail },
      });
      if (userByEmail) {
        const held = await prisma.userRole.findMany({
          include: { role: true },
          where: { userId: userByEmail.id },
        });
        const slugs = held.map((row) => row.role.slug);
        const fallback = userByEmail.role
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if ([...new Set([...slugs, ...fallback])].includes("parent")) {
          await prisma.guardian.update({
            data: { userId: userByEmail.id },
            where: { id: match.guardian.id },
          });
          await logAudit({
            action: "invite-link",
            actor,
            after: {
              email: guardianEmail,
              guardianId: match.guardian.id,
              userId: userByEmail.id,
            },
            before: { guardianId: match.guardian.id, userId: null },
            entity: "guardian",
            entityId: match.guardian.id,
          });
        } else {
          duplicateContact = true;
        }
      }
    }
    await logAudit({
      action: "admission-duplicate",
      actor,
      after: {
        guardianId: match.guardian.id,
        matchedBy: match.matchedBy,
      },
      before: null,
      entity: "guardian",
      entityId: match.guardian.id,
    });
  } else {
    if (guardianEmail) {
      const userByEmail = await prisma.user.findFirst({
        where: { email: guardianEmail },
      });
      if (userByEmail) {
        const held = await prisma.userRole.findMany({
          include: { role: true },
          where: { userId: userByEmail.id },
        });
        const slugs = held.map((row) => row.role.slug);
        const fallback = userByEmail.role
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (![...new Set([...slugs, ...fallback])].includes("parent")) {
          return {
            errors: {
              guardian: {
                email:
                  "This email belongs to another account. Staff confirm needed.",
              },
            },
            ok: false,
          };
        }
      }
    }
    try {
      const created = await prisma.guardian.create({
        data: {
          address: guardianAddress,
          email: guardianEmail,
          name: guardianInput.name.trim(),
          phone: guardianPhone,
          relation: guardianInput.relation,
          relationNote:
            guardianInput.relation === "OTHER" ?
              (normalizeText(guardianInput.relationNote, 100) ?? null)
            : null,
          userId: null,
        },
      });
      guardianId = created.id;
      await logAudit({
        action: "create",
        actor,
        after: {
          address: created.address,
          email: created.email,
          guardianId: created.id,
          name: created.name,
          phone: created.phone,
          relation: created.relation,
        },
        before: null,
        entity: "guardian",
        entityId: created.id,
      });
      const userByEmail =
        guardianEmail ?
          await prisma.user.findFirst({ where: { email: guardianEmail } })
        : null;
      if (userByEmail) {
        await prisma.guardian.update({
          data: { userId: userByEmail.id },
          where: { id: created.id },
        });
        await logAudit({
          action: "invite-link",
          actor,
          after: {
            email: guardianEmail,
            guardianId: created.id,
            userId: userByEmail.id,
          },
          before: { guardianId: created.id, userId: null },
          entity: "guardian",
          entityId: created.id,
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return {
          errors: { guardian: { email: "This login is already linked." } },
          ok: false,
        };
      }
      return { errors: { root: "Could not save this guardian." }, ok: false };
    }
  }
  const wardStaff = await findWardStaff({
    guardianAddress,
    guardianPhone,
    guardianSurname: surnameOf(guardianInput.name),
    studentAddress,
    studentLastName: studentInput.lastName,
  });
  const wardFlag = wardStaff !== null;
  const dob = new Date(`${studentInput.dob}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return {
      errors: { student: { dob: "Pick a valid date of birth." } },
      ok: false,
    };
  }
  let admissionNo: string;
  try {
    admissionNo = await generateAdmissionNo(year.id, year.name);
  } catch {
    return {
      errors: { root: "Could not generate an admission number. Try again." },
      ok: false,
    };
  }
  const photoPath = normalizeText(studentInput.photoPath, 255);
  let studentId: string;
  try {
    let row = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate =
        attempt === 0 ? admissionNo : (
          await generateAdmissionNo(year.id, year.name)
        );
      try {
        row = await prisma.studentProfile.create({
          data: {
            address: studentAddress,
            admissionNo: candidate,
            admissionStatus: "PENDING",
            classId: studentInput.classId,
            dob,
            firstName: studentInput.firstName.trim(),
            gender: studentInput.gender,
            lastName: studentInput.lastName.trim(),
            photoPath,
            previousSchool,
            sectionId,
            userId: null,
            yearId: studentInput.yearId,
          },
        });
        admissionNo = candidate;
        break;
      } catch (error) {
        const isClash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          String(error.meta?.target ?? "").includes("admissionNo");
        if (!isClash || attempt === 2) throw error;
      }
    }
    if (!row) throw new Error("Admission number clash.");
    studentId = row.id;
    await logAudit({
      action: "create",
      actor,
      after: {
        admissionNo: row.admissionNo,
        classId: row.classId,
        firstName: row.firstName,
        lastName: row.lastName,
        status: row.admissionStatus,
        studentId: row.id,
        yearId: row.yearId,
      },
      before: null,
      entity: "student-profile",
      entityId: row.id,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "Admission number clash. Try again." },
        ok: false,
      };
    }
    return { errors: { root: "Could not save this student." }, ok: false };
  }
  const linkResult = await upsertGuardianLink({
    canViewFees: true,
    guardianId,
    isPrimary: true,
    studentId,
  });
  if (!linkResult.ok) {
    return { errors: { root: "Could not link this guardian." }, ok: false };
  }
  const fixedDocs = [
    "BIRTH_CERTIFICATE",
    "MEDICAL",
    "PHOTO",
    "TRANSFER_CERTIFICATE",
  ] as const;
  try {
    await prisma.documentChecklist.createMany({
      data: fixedDocs.map((docType) => ({
        docType,
        label: "",
        status: "PENDING" as const,
        studentId,
      })),
    });
    await logAudit({
      action: "initialize",
      actor,
      after: { count: fixedDocs.length, studentId },
      before: null,
      entity: "document-checklist",
      entityId: studentId,
    });
  } catch {
    return { errors: { root: "Could not start the checklist." }, ok: false };
  }
  const inviteResult = await provisionParentInvite(guardianId, actor.id);
  const invite: AdmissionInvite =
    inviteResult.userId ?
      {
        email: guardianEmail ?? "",
        userId: inviteResult.userId,
      }
    : null;
  let approvalId: string;
  try {
    approvalId = await createApprovalRequest({
      action: "admission",
      payload: {
        admissionNo,
        classId: studentInput.classId,
        duplicateContact,
        guardianId,
        studentId,
        wardFlag,
        wardStaffId: wardStaff?.id ?? null,
        yearId: studentInput.yearId,
      },
      requestedBy: actor.id,
    });
  } catch {
    return {
      errors: { root: "Could not queue this admission for approval." },
      ok: false,
    };
  }
  await logAudit({
    action: "admission-submit",
    actor,
    after: {
      admissionNo,
      approvalId,
      duplicateContact,
      guardianId,
      studentId,
      wardFlag,
    },
    before: null,
    entity: "admission",
    entityId: studentId,
  });
  return {
    admission: {
      admissionNo,
      approvalId,
      duplicateContact,
      guardianId,
      invite,
      studentId,
      wardFlag,
      wardStaffId: wardStaff?.id ?? null,
    },
    ok: true,
  };
};
