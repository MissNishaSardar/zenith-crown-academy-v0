import { z } from "zod";

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

// Every assignable role except super_admin, which code level only can grant.
export const assignableRoles = [
  "principal",
  "vice_principal",
  "teacher",
  "student",
  "parent",
  "accountant",
  "office_staff",
  "librarian",
] as const;

// Mirrors the username plugin rules (min 3, max 30, [a-zA-Z0-9_.]) so bad
// values are caught inline instead of failing at account creation.
const usernameSchema = z
  .string()
  .trim()
  .min(3, { error: "Username must be at least 3 characters" })
  .max(30, { error: "Username must be 30 characters or fewer" })
  .regex(/^[a-zA-Z0-9_.]+$/, {
    error: "Use only letters, numbers, dots and underscores",
  });

const rolesSchema = z
  .array(z.enum(assignableRoles))
  .min(1, { error: "Select at least one role" })
  .max(2, { error: "Select at most two roles" })
  .refine((roles) => new Set(roles).size === roles.length, {
    error: "Roles must be unique",
  })
  .refine(
    (roles) =>
      roles.length !== 2 ||
      (roles.includes("parent") && roles.includes("teacher")),
    { error: "Only a parent and teacher pair is allowed" },
  );

export const createUserSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter a name" }),
  email: z.email({ error: "Enter a valid email address" }),
  username: usernameSchema,
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters" })
    .max(128, { error: "Password is too long" }),
  roles: rolesSchema,
});

export type createUserType = z.infer<typeof createUserSchema>;

export const editUserSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter a name" }),
  email: z.email({ error: "Enter a valid email address" }),
  username: usernameSchema,
  roles: rolesSchema,
  newPassword: z
    .string()
    .trim()
    .max(128, { error: "Password is too long" })
    .refine((value) => value.length === 0 || value.length >= 8, {
      error: "Password must be at least 8 characters",
    }),
});

export type editUserType = z.infer<typeof editUserSchema>;

export const banUserSchema = z.object({
  reason: z.string().trim().min(1, { error: "Enter a reason for the ban" }),
  expiresIn: z
    .object({
      amount: z.coerce
        .number()
        .int({ error: "Enter a whole number" })
        .positive({ error: "Enter a positive amount" }),
      unit: z.enum(["minutes", "hours", "days", "weeks", "months"]),
    })
    .optional(),
});

export type banUserType = z.infer<typeof banUserSchema>;
