import { PrismaClient } from "@prisma/client";

// Un seul client Prisma par processus (évite les connexions multiples en dev).
const g = globalThis as unknown as { __cmdproPrisma?: PrismaClient };
export const db: PrismaClient = g.__cmdproPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__cmdproPrisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
