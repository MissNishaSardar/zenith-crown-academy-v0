import "dotenv/config";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { generateRandomString, hashPassword } from "better-auth/crypto";

import { PrismaClient } from "@generated/prisma/client";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

type SeedUser = {
  name: string;
  email: string;
  username: string;
  role: string;
};

const seedUsers: SeedUser[] = [
  {
    name: "Super Admin",
    email: "admin@gmail.com",
    username: "admin",
    role: "super_admin",
  },
  {
    name: "Principal",
    email: "principal@gmail.com",
    username: "principal",
    role: "principal",
  },
  {
    name: "Vice Principal",
    email: "viceprincipal@gmail.com",
    username: "viceprincipal",
    role: "vice_principal",
  },
  {
    name: "Teacher",
    email: "teacher@gmail.com",
    username: "teacher",
    role: "teacher",
  },
  {
    name: "Student One",
    email: "student1@gmail.com",
    username: "student1",
    role: "student",
  },
  {
    name: "Parent",
    email: "parent@gmail.com",
    username: "parent",
    role: "parent",
  },
  {
    name: "Accountant",
    email: "accountant@gmail.com",
    username: "accountant",
    role: "accountant",
  },
  {
    name: "Office Staff",
    email: "officestaff@gmail.com",
    username: "officestaff",
    role: "office_staff",
  },
  {
    name: "Librarian",
    email: "librarian@gmail.com",
    username: "librarian",
    role: "librarian",
  },
];

const main = async () => {
  // Seed credentials are dev only. Seeded passwords are predictable (password equals email), so refuse to run in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed in production: seed passwords are predictable dev passwords. Set up real accounts through the admin flow instead.",
    );
  }

  for (const seedUser of seedUsers) {
    const passwordHash = await hashPassword(seedUser.email);
    const existing = await prisma.user.findUnique({
      where: { email: seedUser.email },
    });

    if (existing) {
      await prisma.user.update({
        where: { email: seedUser.email },
        data: {
          name: seedUser.name,
          username: seedUser.username,
          role: seedUser.role,
          emailVerified: true,
        },
      });

      const account = await prisma.account.findFirst({
        where: { userId: existing.id, providerId: "credential" },
      });

      if (account) {
        await prisma.account.update({
          where: { id: account.id },
          data: { password: passwordHash, accountId: existing.id },
        });
      } else {
        await prisma.account.create({
          data: {
            id: generateRandomString(32),
            accountId: existing.id,
            providerId: "credential",
            userId: existing.id,
            password: passwordHash,
          },
        });
      }
    } else {
      const id = generateRandomString(32);
      await prisma.user.create({
        data: {
          id,
          name: seedUser.name,
          email: seedUser.email,
          emailVerified: true,
          role: seedUser.role,
          banned: false,
          username: seedUser.username,
          accounts: {
            create: {
              id: generateRandomString(32),
              accountId: id,
              providerId: "credential",
              password: passwordHash,
            },
          },
        },
      });
    }

    console.log(`Seeded ${seedUser.email} as ${seedUser.role}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
