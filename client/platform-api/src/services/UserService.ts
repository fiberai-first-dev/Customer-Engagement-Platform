import { ulid } from "ulid";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";

export async function findOrCreateGoogleUser(email: string, googleId: string) {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || "fiberai.akesh@gmail.com";
  let user = await prisma.user.findUnique({ where: { username: email } });
  
  const role = email === adminEmail ? "SUPER_ADMIN" : "AGENT";

  if (!user) {
    if (email === adminEmail || env.MOCK) {
      user = await prisma.user.create({
        data: {
          id: ulid(),
          username: email,
          googleId,
          role: "SUPER_ADMIN" as any
        },
      });
    } else {
      throw new Error("User not found or not invited to this workspace.");
    }
  } else if (!user.googleId) {
    // Link google ID if email existed
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId }
    });
  }
  
  // Upgrade role if they are the admin email or in mock mode and not already SUPER_ADMIN
  if ((email === adminEmail || env.MOCK) && user.role !== "SUPER_ADMIN") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "SUPER_ADMIN" as any }
    });
  }
  
  return user;
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
