import { z } from "zod";

import { findIncompatibleRoleCombo } from "./auth/permissions";

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

export const impersonateUserSchema = z.object({
  userId: z.string().min(1, { error: "Missing user id" }),
});

export type impersonateUserType = z.infer<typeof impersonateUserSchema>;
