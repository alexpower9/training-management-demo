import type { PrismaClient } from '@prisma/client';
import { ensureDatabaseUrl } from './config.js';

let prisma: PrismaClient | undefined;

export async function getPrisma() {
  if (prisma) {
    return prisma;
  }

  await ensureDatabaseUrl();
  const { PrismaClient: PrismaClientConstructor } = await import('@prisma/client');
  prisma = new PrismaClientConstructor();

  return prisma;
}

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
  }
}
