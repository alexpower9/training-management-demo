import { PrismaClient } from '@prisma/client';
import demoData from '../../src/data/trainingDemoData.json' with { type: 'json' };

const prisma = new PrismaClient();
const recordedAt = new Date('2026-06-05T12:00:00.000Z');
async function main() {
  await prisma.courseCompletion.deleteMany();
  await prisma.siteCourseRequirement.deleteMany();
  await prisma.course.deleteMany();
  await prisma.site.deleteMany();
  await prisma.employee.deleteMany();

  await prisma.employee.createMany({
    data: demoData.employees.map((employee, index) => ({
      id: employee.id,
      displayName: employee.name,
      email: employee.email,
      cognitoSubject: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    })),
  });

  await prisma.site.createMany({ data: demoData.sites });

  await prisma.course.createMany({
    data: demoData.courses.map((course) => ({
      id: course.id,
      name: course.name,
      validityMonths: course.validityMonths,
    })),
  });

  await prisma.siteCourseRequirement.createMany({
    data: demoData.siteCourseRequirements,
  });

  const completionRows = demoData.employees.flatMap((employee) =>
    demoData.courses.flatMap((course) => {
      const key = `${employee.id}:${course.id}`;
      const exception =
        demoData.completionExceptions[
          key as keyof typeof demoData.completionExceptions
        ];

      if (exception === null) return [];

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
