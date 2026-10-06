import { PrismaClient } from "@prisma/client";

// PrismaClient 单例：避免 dev 热重载时反复创建实例耗尽连接
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
