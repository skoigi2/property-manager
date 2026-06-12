import { PrismaClient } from "@prisma/client";
import { decimalToNumberResultExtension } from "@/lib/prisma-decimal-extension";
import { decimalsToNumbers } from "@/lib/money";

// Money columns are numeric(14,2) (exact) in Postgres, but the app works in
// plain `number` everywhere. Two extensions enforce that boundary:
//  1. the generated result extension remaps each money field's TYPE to number;
//  2. the query-level converter below handles everything the result extension
//     can't see at runtime (aggregate _sum/_avg, groupBy, nested payloads).
// Writes need no conversion — Prisma accepts plain numbers for Decimal columns.
function buildClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
    .$extends(decimalToNumberResultExtension)
    .$extends({
      query: {
        $allModels: {
          async $allOperations({ query, args }) {
            return decimalsToNumbers(await query(args));
          },
        },
      },
    });
}

type ExtendedPrismaClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
