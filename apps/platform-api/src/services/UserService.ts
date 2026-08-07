import bcrypt from "bcrypt";
import { ulid } from "ulid";
import { prisma } from "../config/db.js";

const SALT_ROUNDS = 10;

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

export async function createUser(username: string, password: string) {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("username is required");
  if (!password || password.length < 4) throw new Error("password must be at least 4 characters");

  const existing = await prisma.user.findUnique({ where: { username: trimmed } });
  if (existing) throw new Error("username already exists");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return prisma.user.create({
    data: {
      id: ulid(),
      username: trimmed,
      passwordHash,
    },
  });
}

export async function verifyUser(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
