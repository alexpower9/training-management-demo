import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const employees = [
  ['Maya Chen', 'Field Technician', 'Field Service', 'Labrador City'],
  ['Noah Bennett', 'Equipment Operator', 'Operations', 'Wabush'],
  ['Priya Singh', 'Safety Supervisor', 'HSE', 'Labrador City'],
  ['Logan Murphy', 'Maintenance Specialist', 'Maintenance', 'Happy Valley-Goose Bay'],
  ['Grace Okafor', 'Site Coordinator', 'Operations', 'Labrador City'],
  ['Ethan Ross', 'Heavy Equipment Mechanic', 'Maintenance', 'Wabush'],
  ['Sofia Martin', 'Customer Trainer', 'Training', 'Labrador City'],
  ['Caleb White', 'Apprentice Technician', 'Field Service', 'Labrador City'],
] as const;

const customerSites = [
  ['Aurora Mining', 'Megan Pierce', 'North Ridge Mine', 'Labrador West', 'AUR'],
  ['Boreal Ironworks', 'Thomas Doyle', 'Millwright Yard', 'Wabush', 'BOR'],
  ['Tundra Resources', 'Alicia Ward', 'East Pit', 'Schefferville Corridor', 'TUN'],
  ['Northern Aggregate', 'Graham Lee', 'Harbour Quarry', 'Happy Valley-Goose Bay', 'NOR'],
] as const;

const courseDefinitions = [
  ['100', 'Site Orientation', 'Site Access', 12],
  ['220', 'Lockout / Tagout', 'Safety', 24],
  ['310', 'Site Hazard Awareness', 'Safety', 12],
] as const;

async function main() {
  await prisma.auditEvent.deleteMany();
  await prisma.completion.deleteMany();
  await prisma.course.deleteMany();
  await prisma.site.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employee.deleteMany();

  const createdEmployees = [];

  for (const [name, position, crew, homeBase] of employees) {
    createdEmployees.push(
      await prisma.employee.create({
        data: { name, position, crew, homeBase },
      }),
    );
  }

  for (const [customerName, contact, siteName, region, prefix] of customerSites) {
    const customer = await prisma.customer.create({
      data: { name: customerName, contact },
    });
    const site = await prisma.site.create({
      data: { customerId: customer.id, name: siteName, region },
    });

    for (const [suffix, name, category, renewalMonths] of courseDefinitions) {
      const course = await prisma.course.create({
        data: {
          siteId: site.id,
          code: `${prefix}-${suffix}`,
          name: `${siteName} ${name}`,
          category,
          renewalMonths,
        },
      });

      for (const employee of createdEmployees) {
        await prisma.completion.create({
          data: {
            employeeId: employee.id,
            courseId: course.id,
            completedOn: new Date('2025-01-15T00:00:00.000Z'),
            expiresOn: new Date('2027-01-15T00:00:00.000Z'),
            recordedBySubject: 'system-seed',
          },
        });
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
