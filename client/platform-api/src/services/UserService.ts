import { ulid } from "ulid";
import { prisma } from "../config/db.js";

export async function findOrCreateGoogleUser(email: string, googleId: string) {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || "fiberai.akesh@gmail.com";
  let user = await prisma.user.findUnique({ where: { username: email } });
  
  const role = email === adminEmail ? "SUPER_ADMIN" : "AGENT";

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: ulid(),
        username: email,
        googleId,
        role: role as any
      },
    });
  } else if (!user.googleId) {
    // Link google ID if email existed
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId }
    });
  }
  
  // Upgrade role if they are the admin email and not already SUPER_ADMIN
  if (email === adminEmail && user.role !== "SUPER_ADMIN") {
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
