import { CompletionExpirySource, PrismaClient } from '@prisma/client';
import demoData from '../../src/data/trainingDemoData.json' with { type: 'json' };

const prisma = new PrismaClient();
const requirementEffectiveFrom = new Date('2025-01-01T00:00:00.000Z');
const recordedAt = new Date('2026-06-05T12:00:00.000Z');

async function main() {
  await prisma.auditEvent.deleteMany();
  await prisma.courseCompletion.deleteMany();
  await prisma.siteCourseRequirement.deleteMany();
  await prisma.course.deleteMany();
  await prisma.site.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employee.deleteMany();

  await prisma.employee.createMany({
    data: demoData.employees.map((employee) => ({
      id: employee.id,
      displayName: employee.name,
      jobTitle: employee.position,
      crew: employee.crew,
      homeBase: employee.homeBase,
    })),
  });

  await prisma.customer.createMany({
    data: demoData.customers,
  });

  await prisma.site.createMany({
    data: demoData.sites.map((site) => ({
      id: site.id,
      customerId: site.customerId,
      name: site.name,
      region: site.region,
      timeZone: site.timeZone,
    })),
  });

  await prisma.course.createMany({
    data: demoData.courses.map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      category: course.category,
      defaultValidityMonths: course.defaultValidityMonths,
    })),
  });

  await prisma.siteCourseRequirement.createMany({
    data: demoData.courses.map((course) => ({
      siteId: course.siteId,
      courseId: course.id,
      effectiveFrom: requirementEffectiveFrom,
      warningDays: 45,
      createdBySubject: 'system-seed',
    })),
  });

  const completionRows = demoData.employees.flatMap((employee) =>
    demoData.courses.flatMap((course) => {
      const key = `${employee.id}:${course.id}`;
      const exception =
        demoData.completionExceptions[
          key as keyof typeof demoData.completionExceptions
        ];

      if (exception === null) {
        return [];
      }

      return [
        {
          employeeId: employee.id,
          courseId: course.id,
          completedOn: new Date(
            `${exception?.completedOn || demoData.defaultCompletion.completedOn}T00:00:00.000Z`,
          ),
          expiresOn: new Date(
            `${exception?.expiresOn || demoData.defaultCompletion.expiresOn}T00:00:00.000Z`,
          ),
          expirySource: CompletionExpirySource.MANUAL,
          validityMonthsApplied: null,
          recordedBySubject: 'system-seed',
          recordedAt,
        },
      ];
    }),
  );

  await prisma.courseCompletion.createMany({ data: completionRows });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
