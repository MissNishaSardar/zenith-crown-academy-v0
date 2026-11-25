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
