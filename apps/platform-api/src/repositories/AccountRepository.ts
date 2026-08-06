import { prisma } from "../config/db.js";

export class AccountRepository {
  static create(data: any) {
    return prisma.account.create({ data });
  }
  static findAll() {
    return prisma.account.findMany({ orderBy: { createdAt: "asc" } });
  }
  static findById(id: string) {
    return prisma.account.findUnique({ where: { id } });
  }
  static update(id: string, data: any) {
    return prisma.account.update({ where: { id }, data });
  }
}
