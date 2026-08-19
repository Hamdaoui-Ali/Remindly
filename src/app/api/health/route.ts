import { prisma } from '@/server/db/client';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1 AS ready`;
    return Response.json({ status: 'ok', database: 'ok' });
  } catch {
    return Response.json(
      { status: 'degraded', database: 'error' },
      { status: 503 },
    );
  }
}
