import { PrismaClient } from "@prisma/client";

// Un seul client Prisma par processus (évite les connexions multiples en dev).
const g = globalThis as unknown as { __cmdproPrisma?: PrismaClient };
// Adresse de la base : forcée par les scripts (CMDPRO_DATABASE_URL), sinon celle de la base connectée
// depuis Vercel (POSTGRES_PRISMA_URL), sinon DATABASE_URL.
const url = process.env.CMDPRO_DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
export const db: PrismaClient = g.__cmdproPrisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);
if (process.env.NODE_ENV !== "production") g.__cmdproPrisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
