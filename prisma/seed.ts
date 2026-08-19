import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

function requiredEnvironmentValue(name: 'OWNER_EMAIL' | 'DATABASE_URL'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to seed settings.`);
  }
  return value;
}

const ownerEmail = requiredEnvironmentValue('OWNER_EMAIL');
const databaseUrl = requiredEnvironmentValue('DATABASE_URL');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      notificationEmail: ownerEmail,
      timezone: 'Africa/Casablanca',
      defaultAlertTime: '09:00',
    },
    update: {},
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
