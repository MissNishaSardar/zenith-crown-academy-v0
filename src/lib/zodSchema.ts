import { z } from "zod";

import {
  APPROVAL_ACTIONS,
  findIncompatibleRoleCombo,
  roleNames,
} from "./auth/permissions";

export const signinSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { error: "Enter your email or username" }),
  password: z.string().min(1, { error: "Enter your password" }),
  rememberMe: z.boolean(),
});

export type signinType = z.infer<typeof signinSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "Enter a valid email address" }),
});

export type forgotPasswordType = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, { error: "Password must be at least 8 characters" })
      .max(128, { error: "Password is too long" }),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type resetPasswordType = z.infer<typeof resetPasswordSchema>;

export const assignableRoleNames = [
  "administrator",
  "principal",
  "vice_principal",
  "teacher",
  "student",
  "parent",
  "accountant",
  "office_staff",
  "librarian",
] as const;

export const createUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .pipe(z.email({ error: "Enter a valid email address" })),
    name: z
      .string()
      .trim()
      .min(1, { error: "Enter a name" })
      .max(100, { error: "Name is too long" }),
    password: z
      .string()
      .min(12, { error: "Password must be at least 12 characters" })
      .max(128, { error: "Password is too long" })
      .regex(/[A-Z]/, { error: "Password must include an uppercase letter" })
      .regex(/[a-z]/, { error: "Password must include a lowercase letter" })
      .regex(/[0-9]/, { error: "Password must include a number" })
      .regex(/[^A-Za-z0-9]/, { error: "Password must include a symbol" }),
    role: z.union(
      [
        z.enum(assignableRoleNames, { error: "Pick a valid role" }),
        z
          .array(z.enum(assignableRoleNames, { error: "Pick valid roles" }))
          .min(1, { error: "Pick at least one role" })
          .max(9, { error: "Too many roles" })
          .refine((roles) => new Set(roles).size === roles.length, {
            error: "Duplicate roles are not allowed",
          }),
      ],
      { error: "Pick valid roles" },
    ),
    username: z
      .string()
      .trim()
      .min(3, { error: "Username must be at least 3 characters" })
      .max(30, { error: "Username is too long" })
      .regex(/^[A-Za-z0-9_.]+$/, {
        error: "Username can only use letters, numbers, dots and underscores",
      })
      .transform((value) => value.toLowerCase()),
  })
  .superRefine((data, ctx) => {
    const roles = Array.isArray(data.role) ? data.role : [data.role];
    const problem = findIncompatibleRoleCombo(roles);
    if (problem) {
      ctx.addIssue({ code: "custom", message: problem, path: ["role"] });
    }
  });

export type createUserType = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.email({ error: "Enter a valid email address" })),
  id: z.string().min(1, { error: "Missing user id" }),
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a name" })
    .max(100, { error: "Name is too long" }),
  username: z
    .string()
    .trim()
    .min(3, { error: "Username must be at least 3 characters" })
    .max(30, { error: "Username is too long" })
    .regex(/^[A-Za-z0-9_.]+$/, {
      error: "Username can only use letters, numbers, dots and underscores",
    })
    .transform((value) => value.toLowerCase()),
});

export type updateUserType = z.infer<typeof updateUserSchema>;

export const setRoleSchema = z
  .object({
    id: z.string().min(1, { error: "Missing user id" }),
    role: z.union(
      [
        z.enum(assignableRoleNames, { error: "Pick a valid role" }),
        z
          .array(z.enum(assignableRoleNames, { error: "Pick valid roles" }))
          .min(1, { error: "Pick at least one role" })
          .max(9, { error: "Too many roles" })
          .refine((roles) => new Set(roles).size === roles.length, {
            error: "Duplicate roles are not allowed",
          }),
      ],
      { error: "Pick valid roles" },
    ),
  })
  .superRefine((data, ctx) => {
    const roles = Array.isArray(data.role) ? data.role : [data.role];
    const problem = findIncompatibleRoleCombo(roles);
    if (problem) {
      ctx.addIssue({ code: "custom", message: problem, path: ["role"] });
    }
  });

export type setRoleType = z.infer<typeof setRoleSchema>;

export const setPasswordSchema = z.object({
  id: z.string().min(1, { error: "Missing user id" }),
  password: z
    .string()
    .min(12, { error: "Password must be at least 12 characters" })
    .max(128, { error: "Password is too long" })
    .regex(/[A-Z]/, { error: "Password must include an uppercase letter" })
    .regex(/[a-z]/, { error: "Password must include a lowercase letter" })
    .regex(/[0-9]/, { error: "Password must include a number" })
    .regex(/[^A-Za-z0-9]/, { error: "Password must include a symbol" }),
});

export type setPasswordType = z.infer<typeof setPasswordSchema>;

const banDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isValidCalendarDate = (value: string): boolean => {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

const isTodayOrFutureDate = (value: string): boolean => {
  const day = new Date(`${value}T00:00:00`);
  if (Number.isNaN(day.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return day >= today;
};

export const banUserSchema = z
  .object({
    banExpires: z.string().trim().optional(),
    banReason: z
      .string()
      .trim()
      .min(1, { error: "Enter a reason" })
      .max(500, { error: "Reason is too long" }),
    id: z.string().min(1, { error: "Missing user id" }),
  })
  .superRefine((data, ctx) => {
    const raw = data.banExpires?.trim() ?? "";
    if (raw === "") {
      return;
    }
    if (!banDatePattern.test(raw) || !isValidCalendarDate(raw)) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a valid date",
        path: ["banExpires"],
      });
      return;
    }
    if (!isTodayOrFutureDate(raw)) {
      ctx.addIssue({
        code: "custom",
        message: "Pick today or a future date",
        path: ["banExpires"],
      });
    }
  });

export type banUserType = z.infer<typeof banUserSchema>;

export const unbanUserSchema = z.object({
  id: z.string().min(1, { error: "Missing user id" }),
});

export type unbanUserType = z.infer<typeof unbanUserSchema>;

export const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, { error: "Missing session" }),
});

export type revokeSessionType = z.infer<typeof revokeSessionSchema>;

export const revokeAllUserSessionsSchema = z.object({
  userId: z.string().min(1, { error: "Missing user" }),
});

export type revokeAllUserSessionsType = z.infer<
  typeof revokeAllUserSessionsSchema
>;

export const schoolSettingsSchema = z
  .object({
    academicYear: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, {
        error: "Use format YYYY/YYYY like 2026/2027",
      }),
    address: z.string().trim().max(200, { error: "Address is too long" }),
    email: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .pipe(z.email({ error: "Enter a valid email address" })),
    motto: z.string().trim().max(150, { error: "Motto is too long" }),
    phone: z
      .string()
      .trim()
      .transform((value) => {
        const collapsed = value.replace(/\s+/g, " ").trim();
        if (collapsed === "") {
          return collapsed;
        }
        if (collapsed.startsWith("+")) {
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
      })
      .pipe(
        z
          .string()
          .min(7, { error: "Enter a valid phone number" })
          .max(20, { error: "Phone number is too long" })
          .regex(/^\+\d[\d\s\-.()]*$/, {
            error: "Use international format like +91 9876543210",
          })
          .refine(
            (value) => {
              const digits = value.replace(/\D/g, "");
              return digits.length >= 7 && digits.length <= 15;
            },
            { error: "Enter a valid phone number" },
          ),
      ),
    schoolName: z
      .string()
      .trim()
      .min(1, { error: "Enter the school name" })
      .max(100, { error: "School name is too long" }),
  })
  .superRefine((data, ctx) => {
    const parts = data.academicYear.split("/");
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      end !== start + 1
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Second year must be first year plus one",
        path: ["academicYear"],
      });
    }
  });

export type schoolSettingsType = z.infer<typeof schoolSettingsSchema>;

export const roleSlugSchema = z.enum(roleNames, {
  error: "Pick a valid role",
});

export const grantRoleSchema = z.object({
  id: z.string().min(1, { error: "Missing user id" }),
  role: roleSlugSchema,
});

export type grantRoleType = z.infer<typeof grantRoleSchema>;

export const revokeRoleSchema = z.object({
  id: z.string().min(1, { error: "Missing user id" }),
  role: roleSlugSchema,
});

export type revokeRoleType = z.infer<typeof revokeRoleSchema>;

export const switchActiveRoleSchema = z.object({
  role: roleSlugSchema,
});

export type switchActiveRoleType = z.infer<typeof switchActiveRoleSchema>;

export const academicYearStatusNames = [
  "UPCOMING",
  "CURRENT",
  "CLOSED",
] as const;

export const academicYearSchema = z.object({
  endDate: z.string().trim().min(1, { error: "Pick an end date" }),
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a year name" })
    .max(40, { error: "Year name is too long" })
    .refine((value) => !value.includes("/"), {
      error: "Year name cannot contain slashes",
    }),
  startDate: z.string().trim().min(1, { error: "Pick a start date" }),
  status: z.enum(academicYearStatusNames, { error: "Pick a valid status" }),
});

export type academicYearType = z.infer<typeof academicYearSchema>;

export const workingDayTypeNames = [
  "HOLIDAY",
  "EXAM_BREAK",
  "WORKING_SATURDAY",
] as const;

export const workingDaySchema = z.object({
  date: z.string().trim().min(1, { error: "Pick a date" }),
  note: z.string().trim().max(200, { error: "Note is too long" }).optional(),
  type: z.enum(workingDayTypeNames, { error: "Pick a valid day type" }),
  yearId: z.string().min(1, { error: "Missing academic year" }),
});

export type workingDayType = z.infer<typeof workingDaySchema>;

export const approvalActionNames = APPROVAL_ACTIONS;

export const approvalStatusNames = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "FAILED",
  "EXPIRED",
] as const;

export const approvalDecisionSchema = z.object({
  id: z.string().min(1, { error: "Missing approval id" }),
  decision: z.enum(["APPROVE", "REJECT"], { error: "Pick a decision" }),
  reason: z
    .string()
    .trim()
    .max(500, { error: "Reason is too long" })
    .optional(),
});

export type approvalDecisionType = z.infer<typeof approvalDecisionSchema>;

export const classBandNames = [
  "PRE_PRIMARY",
  "PRIMARY",
  "MIDDLE",
  "SECONDARY",
  "SENIOR_SECONDARY",
] as const;

const bandForOrder = (order: number): string | null => {
  if (order >= 1 && order <= 3) return "PRE_PRIMARY";
  if (order >= 4 && order <= 8) return "PRIMARY";
  if (order >= 9 && order <= 11) return "MIDDLE";
  if (order >= 12 && order <= 13) return "SECONDARY";
  if (order >= 14 && order <= 15) return "SENIOR_SECONDARY";
  return null;
};

export const schoolClassSchema = z
  .object({
    band: z.enum(classBandNames, { error: "Pick a valid band" }),
    id: z.string().min(1, { error: "Missing class id" }).optional(),
    isActive: z.boolean(),
    name: z
      .string()
      .trim()
      .min(1, { error: "Enter a class name" })
      .max(40, { error: "Class name is too long" }),
    order: z
      .number()
      .int({ error: "Order must be a whole number" })
      .min(1)
      .max(15),
  })
  .superRefine((data, ctx) => {
    const expected = bandForOrder(data.order);
    if (!expected) {
      ctx.addIssue({
        code: "custom",
        message: "Order must be 1 to 15",
        path: ["order"],
      });
      return;
    }
    if (data.band !== expected) {
      ctx.addIssue({
        code: "custom",
        message: `Order ${data.order} must use band ${expected}`,
        path: ["band"],
      });
    }
  });

export type schoolClassType = z.infer<typeof schoolClassSchema>;

export const sectionSchema = z.object({
  capacity: z
    .number()
    .int({ error: "Capacity must be a whole number" })
    .min(1, { error: "Capacity must be at least 1" })
    .max(200, { error: "Capacity is too large" }),
  classId: z.string().min(1, { error: "Pick a class" }),
  classTeacherId: z.string().min(1, { error: "Pick a class teacher" }),
  id: z.string().min(1, { error: "Missing section id" }).optional(),
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a section name" })
    .max(20, { error: "Section name is too long" }),
  yearId: z.string().min(1, { error: "Pick an academic year" }),
});

export type sectionType = z.infer<typeof sectionSchema>;

export const subjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { error: "Enter a subject code" })
    .max(20, { error: "Code is too long" })
    .regex(/^[A-Za-z0-9-]+$/, {
      error: "Code can use letters, numbers and dashes",
    })
    .transform((value) => value.toUpperCase()),
  id: z.string().min(1, { error: "Missing subject id" }).optional(),
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a subject name" })
    .max(80, { error: "Name is too long" }),
});

export type subjectType = z.infer<typeof subjectSchema>;

export const classSubjectSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  isOptional: z.boolean(),
  subjectId: z.string().min(1, { error: "Pick a subject" }),
});

export type classSubjectType = z.infer<typeof classSubjectSchema>;

export const streamSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  id: z.string().min(1, { error: "Missing stream id" }).optional(),
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a stream name" })
    .max(40, { error: "Stream name is too long" }),
});

export type streamType = z.infer<typeof streamSchema>;

export const streamSubjectSchema = z.object({
  streamId: z.string().min(1, { error: "Pick a stream" }),
  subjectId: z.string().min(1, { error: "Pick a subject" }),
});

export type streamSubjectType = z.infer<typeof streamSubjectSchema>;

export const phoneSchema = z
  .string()
  .trim()
  .min(7, { error: "Enter a valid phone number" })
  .max(20, { error: "Phone number is too long" })
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, "");
      return (
        digits.length >= 10 &&
        digits.length <= 15 &&
        /^\+?[0-9\s\-.()]+$/.test(value)
      );
    },
    { error: "Enter 10 to 15 digits with optional + prefix" },
  );

export type phoneType = z.infer<typeof phoneSchema>;

export const genderNames = ["MALE", "FEMALE", "OTHER"] as const;

export const guardianRelationNames = [
  "FATHER",
  "MOTHER",
  "GUARDIAN",
  "SIBLING",
  "GRANDPARENT",
  "OTHER",
] as const;

export const studentAdmissionStatusNames = [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
] as const;

const optionalEmail = z
  .string()
  .trim()
  .max(100, { error: "Email is too long" })
  .nullable()
  .optional();

const optionalId = z.string().trim().max(100).nullable().optional();

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const staffSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, { error: "Enter an address" })
      .max(200, { error: "Address is too long" }),
    designation: z
      .string()
      .trim()
      .min(1, { error: "Enter a designation" })
      .max(80, { error: "Designation is too long" }),
    email: optionalEmail,
    employeeId: z
      .string()
      .trim()
      .min(1, { error: "Enter an employee ID" })
      .max(20, { error: "Employee ID is too long" })
      .regex(/^[A-Za-z0-9-]+$/, {
        error: "Employee ID can use letters, numbers and dashes",
      }),
    firstName: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name" })
      .max(50, { error: "First name is too long" }),
    id: z.string().min(1, { error: "Missing staff id" }).optional(),
    isActive: z.boolean(),
    joiningDate: z.string().trim().min(1, { error: "Pick a joining date" }),
    lastName: z
      .string()
      .trim()
      .min(1, { error: "Enter a last name" })
      .max(50, { error: "Last name is too long" }),
    phone: phoneSchema,
    userId: optionalId,
    wardNote: optionalText(500),
    wardStudentId: optionalId,
  })
  .superRefine((data, ctx) => {
    if (
      data.email !== undefined &&
      data.email !== null &&
      data.email.trim() !== "" &&
      !emailFormat.test(data.email.trim().toLowerCase())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid email address",
        path: ["email"],
      });
    }
    if (
      !datePattern.test(data.joiningDate) ||
      !isValidCalendarDate(data.joiningDate)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a valid date",
        path: ["joiningDate"],
      });
      return;
    }
    const joining = new Date(`${data.joiningDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (joining > today) {
      ctx.addIssue({
        code: "custom",
        message: "Joining date cannot be in the future",
        path: ["joiningDate"],
      });
    }
  });

export type staffType = z.infer<typeof staffSchema>;

export const guardianSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, { error: "Enter an address" })
      .max(200, { error: "Address is too long" }),
    email: optionalEmail,
    id: z.string().min(1, { error: "Missing guardian id" }).optional(),
    name: z
      .string()
      .trim()
      .min(1, { error: "Enter a name" })
      .max(100, { error: "Name is too long" }),
    phone: phoneSchema,
    relation: z.enum(guardianRelationNames, {
      error: "Pick a valid relation",
    }),
    relationNote: optionalText(100),
    userId: optionalId,
  })
  .superRefine((data, ctx) => {
    if (
      data.email !== undefined &&
      data.email !== null &&
      data.email.trim() !== "" &&
      !emailFormat.test(data.email.trim().toLowerCase())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid email address",
        path: ["email"],
      });
    }
    const note = (data.relationNote ?? "").trim();
    if (data.relation === "OTHER" && note === "") {
      ctx.addIssue({
        code: "custom",
        message: "Add a note for relation other",
        path: ["relationNote"],
      });
    }
  });

export type guardianType = z.infer<typeof guardianSchema>;

export const studentSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, { error: "Enter an address" })
      .max(200, { error: "Address is too long" }),
    admissionStatus: z
      .enum(studentAdmissionStatusNames, {
        error: "Pick a valid status",
      })
      .optional(),
    classId: z.string().min(1, { error: "Pick a class" }),
    dob: z.string().trim().min(1, { error: "Pick a date of birth" }),
    firstName: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name" })
      .max(50, { error: "First name is too long" }),
    gender: z.enum(genderNames, { error: "Pick a valid gender" }),
    id: z.string().min(1, { error: "Missing student id" }).optional(),
    lastName: z
      .string()
      .trim()
      .min(1, { error: "Enter a last name" })
      .max(50, { error: "Last name is too long" }),
    photoPath: optionalText(255),
    previousSchool: optionalText(120),
    sectionId: optionalId,
    userId: optionalId,
    yearId: z.string().min(1, { error: "Pick an academic year" }),
  })
  .superRefine((data, ctx) => {
    if (!datePattern.test(data.dob) || !isValidCalendarDate(data.dob)) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a valid date of birth",
        path: ["dob"],
      });
      return;
    }
    const dob = new Date(`${data.dob}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dob >= today) {
      ctx.addIssue({
        code: "custom",
        message: "Date of birth must be in the past",
        path: ["dob"],
      });
      return;
    }
    const age =
      (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 2 || age > 30) {
      ctx.addIssue({
        code: "custom",
        message: "Age must be between 2 and 30 years",
        path: ["dob"],
      });
    }
    const photo = (data.photoPath ?? "").trim();
    if (photo !== "") {
      if (
        photo.includes("..") ||
        photo.startsWith("/") ||
        photo.length > 255 ||
        !/^[A-Za-z0-9._\-/]+$/.test(photo)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Photo path is not valid",
          path: ["photoPath"],
        });
      } else {
        const lower = photo.toLowerCase();
        const allowed = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];
        if (!allowed.some((ext) => lower.endsWith(ext))) {
          ctx.addIssue({
            code: "custom",
            message: "Photo must be an image or PDF",
            path: ["photoPath"],
          });
        }
      }
    }
  });

export type studentType = z.infer<typeof studentSchema>;

export const documentTypeNames = [
  "BIRTH_CERTIFICATE",
  "MEDICAL",
  "PHOTO",
  "TRANSFER_CERTIFICATE",
  "CLASS_ITEM",
] as const;

export const documentStatusNames = [
  "PENDING",
  "COLLECTED",
  "VERIFIED",
] as const;

export const guardianLinkSchema = z.object({
  canViewFees: z.boolean().optional(),
  guardianId: z.string().min(1, { error: "Pick a guardian" }),
  id: z.string().min(1, { error: "Missing link id" }).optional(),
  isPrimary: z.boolean(),
  studentId: z.string().min(1, { error: "Pick a student" }),
});

export type guardianLinkType = z.infer<typeof guardianLinkSchema>;

export const documentChecklistSchema = z
  .object({
    docType: z.enum(documentTypeNames, { error: "Pick a valid document" }),
    id: z.string().min(1, { error: "Missing checklist id" }).optional(),
    label: z.string().trim().max(80).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    status: z.enum(documentStatusNames, { error: "Pick a valid status" }),
    studentId: z.string().min(1, { error: "Pick a student" }),
  })
  .superRefine((data, ctx) => {
    const label = (data.label ?? "").trim();
    if (data.docType === "CLASS_ITEM" && label === "") {
      ctx.addIssue({
        code: "custom",
        message: "Add a label for this class item",
        path: ["label"],
      });
    }
  });

export type documentChecklistType = z.infer<typeof documentChecklistSchema>;

export const admissionStudentSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, { error: "Enter an address" })
      .max(200, { error: "Address is too long" }),
    classId: z.string().min(1, { error: "Pick a class" }),
    dob: z.string().trim().min(1, { error: "Pick a date of birth" }),
    firstName: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name" })
      .max(50, { error: "First name is too long" }),
    gender: z.enum(genderNames, { error: "Pick a valid gender" }),
    lastName: z
      .string()
      .trim()
      .min(1, { error: "Enter a last name" })
      .max(50, { error: "Last name is too long" }),
    photoPath: optionalText(255),
    previousSchool: optionalText(120),
    sectionId: optionalId,
    yearId: z.string().min(1, { error: "Pick an academic year" }),
  })
  .superRefine((data, ctx) => {
    if (!datePattern.test(data.dob) || !isValidCalendarDate(data.dob)) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a valid date of birth",
        path: ["dob"],
      });
      return;
    }
    const dob = new Date(`${data.dob}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dob >= today) {
      ctx.addIssue({
        code: "custom",
        message: "Date of birth must be in the past",
        path: ["dob"],
      });
      return;
    }
    const age =
      (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 2 || age > 30) {
      ctx.addIssue({
        code: "custom",
        message: "Age must be between 2 and 30 years",
        path: ["dob"],
      });
    }
    const photo = (data.photoPath ?? "").trim();
    if (photo !== "") {
      if (
        photo.includes("..") ||
        photo.startsWith("/") ||
        photo.length > 255 ||
        !/^[A-Za-z0-9._\-/]+$/.test(photo)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Photo path is not valid",
          path: ["photoPath"],
        });
      } else {
        const lower = photo.toLowerCase();
        const allowed = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];
        if (!allowed.some((ext) => lower.endsWith(ext))) {
          ctx.addIssue({
            code: "custom",
            message: "Photo must be an image or PDF",
            path: ["photoPath"],
          });
        }
      }
    }
  });

export const admissionGuardianSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, { error: "Enter an address" })
      .max(200, { error: "Address is too long" }),
    email: optionalEmail,
    name: z
      .string()
      .trim()
      .min(1, { error: "Enter a name" })
      .max(100, { error: "Name is too long" }),
    phone: phoneSchema,
    relation: z.enum(guardianRelationNames, {
      error: "Pick a valid relation",
    }),
    relationNote: optionalText(100),
  })
  .superRefine((data, ctx) => {
    if (
      data.email !== undefined &&
      data.email !== null &&
      data.email.trim() !== "" &&
      !emailFormat.test(data.email.trim().toLowerCase())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid email address",
        path: ["email"],
      });
    }
    const note = (data.relationNote ?? "").trim();
    if (data.relation === "OTHER" && note === "") {
      ctx.addIssue({
        code: "custom",
        message: "Add a note for relation other",
        path: ["relationNote"],
      });
    }
  });

export const admissionSubmitSchema = z.object({
  guardian: admissionGuardianSchema,
  student: admissionStudentSchema,
});

export type admissionSubmitType = z.infer<typeof admissionSubmitSchema>;

export type ChecklistProgress = {
  collected: number;
  pending: number;
  percentReady: number;
  percentVerified: number;
  total: number;
  verified: number;
};

export const getChecklistProgress = (
  items: readonly { status: string }[],
): ChecklistProgress => {
  const total = items.length;
  let pending = 0;
  let collected = 0;
  let verified = 0;
  for (const item of items) {
    if (item.status === "VERIFIED") verified += 1;
    else if (item.status === "COLLECTED") collected += 1;
    else pending += 1;
  }
  return {
    collected,
    pending,
    percentReady:
      total > 0 ? Math.round(((collected + verified) * 100) / total) : 0,
    percentVerified: total > 0 ? Math.round((verified * 100) / total) : 0,
    total,
    verified,
  };
};

export const CLASS_LOGIN_MIN_ORDER = 9;

export const isEligibleForStudentLogin = (order: number): boolean =>
  order >= CLASS_LOGIN_MIN_ORDER;

export const enrollmentStatusNames = [
  "ENROLLED",
  "PROMOTED",
  "REPEATED",
  "TRANSFERRED",
  "WITHDRAWN",
  "GRADUATED",
] as const;

export const SENIOR_SECONDARY_MIN_ORDER = 14;

export const isSeniorSecondaryOrder = (order: number): boolean =>
  order >= SENIOR_SECONDARY_MIN_ORDER;

export const enrollmentSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  id: z.string().min(1, { error: "Missing enrollment id" }).optional(),
  rollNo: z
    .string()
    .trim()
    .min(1, { error: "Enter a roll number" })
    .max(20, { error: "Roll number is too long" })
    .regex(/^[A-Za-z0-9-]+$/, {
      error: "Roll number can use letters, numbers and dashes",
    }),
  sectionId: z.string().min(1, { error: "Pick a section" }),
  status: z.enum(enrollmentStatusNames, { error: "Pick a valid status" }),
  streamId: z.string().trim().max(100).nullable().optional(),
  studentId: z.string().min(1, { error: "Pick a student" }),
  subjectPickIds: z
    .array(z.string().min(1, { error: "Pick valid subjects" }))
    .max(12, { error: "Too many subject picks" })
    .optional(),
  yearId: z.string().min(1, { error: "Pick an academic year" }),
});

export type enrollmentType = z.infer<typeof enrollmentSchema>;

export const transferRequestSchema = z.object({
  enrollmentId: z.string().min(1, { error: "Missing enrollment" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
  targetSectionId: z.string().min(1, { error: "Pick a target section" }),
});

export type transferRequestType = z.infer<typeof transferRequestSchema>;

export const withdrawalRequestSchema = z.object({
  enrollmentId: z.string().min(1, { error: "Missing enrollment" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
});

export type withdrawalRequestType = z.infer<typeof withdrawalRequestSchema>;

export const teacherAssignmentSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  id: z.string().min(1, { error: "Missing assignment id" }).optional(),
  isActive: z.boolean(),
  sectionId: z.string().trim().max(100).nullable().optional(),
  subjectId: z.string().min(1, { error: "Pick a subject" }),
  teacherId: z.string().min(1, { error: "Pick a teacher" }),
  yearId: z.string().min(1, { error: "Pick an academic year" }),
});

export type teacherAssignmentType = z.infer<typeof teacherAssignmentSchema>;

export const attendanceStatusNames = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
] as const;

export const attendanceExceptionStatusNames = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export const attendanceRowSchema = z
  .object({
    note: z.string().trim().max(500).nullable().optional(),
    status: z.enum(attendanceStatusNames, { error: "Pick a valid status" }),
    studentId: z.string().min(1, { error: "Pick a student" }),
  })
  .superRefine((data, ctx) => {
    if (data.status === "EXCUSED" && (data.note ?? "").trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "Add a note for excused absence",
        path: ["note"],
      });
    }
  });

export type attendanceRowType = z.infer<typeof attendanceRowSchema>;

export const attendanceMarkSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  date: z.string().trim().min(1, { error: "Pick a date" }),
  rows: z
    .array(attendanceRowSchema)
    .min(1, { error: "Add at least one student" })
    .max(300, { error: "Too many rows" }),
  sectionId: z.string().min(1, { error: "Pick a section" }),
  yearId: z.string().min(1, { error: "Pick an academic year" }),
});

export type attendanceMarkType = z.infer<typeof attendanceMarkSchema>;

export const attendanceExceptionSchema = z.object({
  classId: z.string().min(1, { error: "Pick a class" }),
  denominator: z
    .number()
    .int({ error: "Denominator must be a whole number" })
    .min(1, { error: "Denominator must be at least 1" })
    .max(366, { error: "Denominator is too large" }),
  examTerm: z
    .string()
    .trim()
    .min(1, { error: "Enter an exam term" })
    .max(80, { error: "Exam term is too long" }),
  rateHundredths: z
    .number()
    .int({ error: "Rate must be a whole number" })
    .min(0, { error: "Rate cannot be negative" })
    .max(10000, { error: "Rate is too large" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
  studentId: z.string().min(1, { error: "Pick a student" }),
  yearId: z.string().min(1, { error: "Pick an academic year" }),
});

export type attendanceExceptionType = z.infer<typeof attendanceExceptionSchema>;

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timetableSlotSchema = z
  .object({
    classId: z.string().min(1, { error: "Pick a class" }),
    dayOfWeek: z
      .number()
      .int({ error: "Day must be a whole number" })
      .min(1, { error: "Day must be Monday to Friday" })
      .max(5, { error: "Day must be Monday to Friday" }),
    endTime: z.string().trim().min(1, { error: "Enter an end time" }),
    id: z.string().min(1, { error: "Missing slot id" }).optional(),
    periodNo: z
      .number()
      .int({ error: "Period must be a whole number" })
      .min(1, { error: "Period must be at least 1" })
      .max(8, { error: "Period is at most 8" }),
    sectionId: z.string().min(1, { error: "Pick a section" }),
    startTime: z.string().trim().min(1, { error: "Enter a start time" }),
    subjectId: z.string().min(1, { error: "Pick a subject" }),
    teacherId: z.string().min(1, { error: "Pick a teacher" }),
    yearId: z.string().min(1, { error: "Pick an academic year" }),
  })
  .superRefine((data, ctx) => {
    if (!timePattern.test(data.startTime)) {
      ctx.addIssue({
        code: "custom",
        message: "Start time uses HH MM like 09:00",
        path: ["startTime"],
      });
    }
    if (!timePattern.test(data.endTime)) {
      ctx.addIssue({
        code: "custom",
        message: "End time uses HH MM like 09:45",
        path: ["endTime"],
      });
    }
    if (timePattern.test(data.startTime) && timePattern.test(data.endTime)) {
      if (data.endTime <= data.startTime) {
        ctx.addIssue({
          code: "custom",
          message: "End time must be after start time",
          path: ["endTime"],
        });
      }
    }
  });

export type timetableSlotType = z.infer<typeof timetableSlotSchema>;

export const substitutionSchema = z.object({
  coverTeacherId: z.string().min(1, { error: "Pick a cover teacher" }),
  date: z.string().trim().min(1, { error: "Pick a date" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
  slotId: z.string().min(1, { error: "Pick a slot" }),
});

export type substitutionType = z.infer<typeof substitutionSchema>;

export const disciplineCategoryNames = [
  "LATE",
  "MISCONDUCT",
  "BULLYING",
  "CHEATING",
  "VANDALISM",
  "ABSENTEEISM",
  "OTHER",
] as const;

export const disciplineStatusNames = ["OPEN", "CLOSED"] as const;

export const disciplineSchema = z
  .object({
    actionTaken: z.string().trim().max(500).nullable().optional(),
    category: z.enum(disciplineCategoryNames, {
      error: "Pick a valid category",
    }),
    categoryNote: z.string().trim().max(100).nullable().optional(),
    date: z.string().trim().min(1, { error: "Pick a date" }),
    description: z
      .string()
      .trim()
      .min(1, { error: "Enter a description" })
      .max(1000, { error: "Description is too long" }),
    id: z.string().min(1, { error: "Missing incident id" }).optional(),
    status: z.enum(disciplineStatusNames, { error: "Pick a valid status" }),
    studentId: z.string().min(1, { error: "Pick a student" }),
    yearId: z.string().min(1, { error: "Pick an academic year" }),
  })
  .superRefine((data, ctx) => {
    const note = (data.categoryNote ?? "").trim();
    if (data.category === "OTHER" && note === "") {
      ctx.addIssue({
        code: "custom",
        message: "Add a note for category other",
        path: ["categoryNote"],
      });
    }
    if (data.status === "CLOSED" && (data.actionTaken ?? "").trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "Action taken is required to close",
        path: ["actionTaken"],
      });
    }
  });

export type disciplineType = z.infer<typeof disciplineSchema>;

export const staffAttendanceStatusNames = [
  "PRESENT",
  "LEAVE",
  "ON_DUTY",
] as const;

export const staffAttendanceSchema = z.object({
  date: z.string().trim().min(1, { error: "Pick a date" }),
  leaveRequestId: z.string().trim().max(100).nullable().optional(),
  staffId: z.string().min(1, { error: "Pick a staff member" }),
  status: z.enum(staffAttendanceStatusNames, { error: "Pick a valid status" }),
});

export type staffAttendanceType = z.infer<typeof staffAttendanceSchema>;

export const leaveTargetNames = ["STAFF", "STUDENT"] as const;

export const leaveStatusNames = ["PENDING", "APPROVED", "REJECTED"] as const;

export const leaveRequestSchema = z
  .object({
    endDate: z.string().trim().min(1, { error: "Pick an end date" }),
    reason: z
      .string()
      .trim()
      .min(1, { error: "Enter a reason" })
      .max(500, { error: "Reason is too long" }),
    staffId: z.string().trim().max(100).nullable().optional(),
    startDate: z.string().trim().min(1, { error: "Pick a start date" }),
    studentId: z.string().trim().max(100).nullable().optional(),
    target: z.enum(leaveTargetNames, { error: "Pick a valid target" }),
  })
  .superRefine((data, ctx) => {
    if (data.target === "STAFF" && !(data.staffId ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a staff member",
        path: ["staffId"],
      });
    }
    if (data.target === "STUDENT" && !(data.studentId ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a student",
        path: ["studentId"],
      });
    }
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: "custom",
        message: "End date is before start date",
        path: ["endDate"],
      });
    }
  });

export type leaveRequestType = z.infer<typeof leaveRequestSchema>;
