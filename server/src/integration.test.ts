import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

test(
  'PostgreSQL constraints and admin transactions work together',
  { skip: shouldRun ? false : 'Set TEST_DATABASE_URL and use npm run test:integration.' },
  async () => {
    const parsed = new URL(testDatabaseUrl!);
    assert.equal(
      parsed.pathname.replace(/^\//, ''),
      'nme_training_test',
      'Integration tests may only target nme_training_test.',
    );
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.AUTH_MODE = 'development';

    const [{ buildApp }, { getPrisma, disconnectDatabase }] = await Promise.all([
      import('./app.js'),
      import('./database.js'),
    ]);
    const prisma = await getPrisma();
    await prisma.auditEvent.deleteMany();
    await prisma.courseCompletion.deleteMany();
    await prisma.siteCourseRequirement.deleteMany();
    await prisma.site.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.course.deleteMany();
    await prisma.employee.deleteMany();

    const app = await buildApp();
    const headers = {
      'content-type': 'application/json',
      'x-demo-user-role': 'admin',
      'x-demo-user-subject': 'integration-admin',
    };
    const request = (
      method: 'GET' | 'POST' | 'PATCH',
      url: string,
      payload?: Record<string, unknown>,
    ) =>
      app.inject({
        method,
        url,
        headers,
        ...(payload ? { payload } : {}),
      });

    try {
      const employeeResponse = await request('POST', '/api/v1/admin/employees', {
        displayName: 'January Tester',
        jobTitle: 'Technician',
      });
      assert.equal(employeeResponse.statusCode, 201);
      const employee = employeeResponse.json();

      const customerResponse = await request('POST', '/api/v1/admin/customers', {
        name: 'Constraint Customer',
      });
      const customer = customerResponse.json();
      const siteResponse = await request('POST', '/api/v1/admin/sites', {
        customerId: customer.id,
        name: 'Constraint Site',
        region: 'Test',
        timeZone: 'America/St_Johns',
      });
      const site = siteResponse.json();
      const courseResponse = await request('POST', '/api/v1/admin/courses', {
        code: 'TEST-001',
        name: 'Calendar Month Safety',
        defaultValidityMonths: 1,
      });
      const course = courseResponse.json();

      const completionResponse = await request('POST', '/api/v1/admin/completions', {
        employeeId: employee.id,
        courseId: course.id,
        completedOn: '2024-01-31',
        expirySource: 'CALCULATED',
      });
      assert.equal(completionResponse.statusCode, 201);
      assert.equal(completionResponse.json().expiresOn, '2024-02-29');
      assert.equal(completionResponse.json().validityMonthsApplied, 1);

      const duplicateResponse = await request('POST', '/api/v1/admin/completions', {
        employeeId: employee.id,
        courseId: course.id,
        completedOn: '2024-01-31',
        expirySource: 'CALCULATED',
      });
      assert.equal(duplicateResponse.statusCode, 409);

      const requirementResponse = await request('POST', '/api/v1/admin/requirements', {
        siteId: site.id,
        courseId: course.id,
        effectiveFrom: '2026-01-01',
        warningDays: 45,
      });
      assert.equal(requirementResponse.statusCode, 201);

      const overlapResponse = await request('POST', '/api/v1/admin/requirements', {
        siteId: site.id,
        courseId: course.id,
        effectiveFrom: '2026-06-01',
        warningDays: 30,
      });
      assert.equal(overlapResponse.statusCode, 409);

      const expiringEmployee = await prisma.employee.create({
        data: { displayName: 'Expiring Employee', jobTitle: 'Technician' },
      });
      const compliantEmployee = await prisma.employee.create({
        data: { displayName: 'Compliant Employee', jobTitle: 'Technician' },
      });
      await prisma.employee.create({
        data: { displayName: 'Incomplete Employee', jobTitle: 'Technician' },
      });
      await prisma.employee.create({
        data: {
          displayName: 'Archived Employee',
          jobTitle: 'Technician',
          archivedAt: new Date(),
        },
      });
      await prisma.courseCompletion.createMany({
        data: [
          {
            employeeId: expiringEmployee.id,
            courseId: course.id,
            completedOn: new Date('2026-01-01T00:00:00.000Z'),
            expiresOn: new Date('2026-06-20T00:00:00.000Z'),
            expirySource: 'MANUAL',
            recordedBySubject: 'integration-setup',
          },
          {
            employeeId: compliantEmployee.id,
            courseId: course.id,
            completedOn: new Date('2026-01-01T00:00:00.000Z'),
            expiresOn: new Date('2027-01-01T00:00:00.000Z'),
            expirySource: 'MANUAL',
            recordedBySubject: 'integration-setup',
          },
        ],
      });

      const readinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      );
      assert.equal(readinessResponse.statusCode, 200);
      const readiness = readinessResponse.json();
      assert.deepEqual(
        readiness.map((row: { status: string }) => row.status).sort(),
        ['compliant', 'expiring', 'incomplete', 'overdue'].sort(),
      );
      assert.equal(
        readiness.some(
          (row: { employee: { name: string } }) =>
            row.employee.name === 'Archived Employee',
        ),
        false,
      );

      const sharedCustomer = await prisma.customer.create({
        data: { name: 'Shared Course Customer' },
      });
      const sharedSite = await prisma.site.create({
        data: {
          customerId: sharedCustomer.id,
          name: 'Shared Course Site',
          timeZone: 'America/St_Johns',
        },
      });
      const siteSpecificCourse = await prisma.course.create({
        data: {
          code: 'SITE-SPECIFIC-001',
          name: 'Site Specific Orientation',
          defaultValidityMonths: 12,
        },
      });
      await prisma.siteCourseRequirement.createMany({
        data: [
          {
            siteId: sharedSite.id,
            courseId: course.id,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            warningDays: 45,
            createdBySubject: 'integration-setup',
          },
          {
            siteId: sharedSite.id,
            courseId: siteSpecificCourse.id,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            warningDays: 45,
            createdBySubject: 'integration-setup',
          },
        ],
      });
      const sharedReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${sharedSite.id}/readiness?asOf=2026-06-05`,
      );
      const compliantSharedRow = sharedReadinessResponse
        .json()
        .find(
          (row: { employee: { id: string } }) =>
            row.employee.id === compliantEmployee.id,
        );
      assert.equal(compliantSharedRow.courses[0].status, 'compliant');
      assert.equal(compliantSharedRow.courses[1].status, 'incomplete');
      assert.equal(compliantSharedRow.status, 'incomplete');

      const emptySite = await prisma.site.create({
        data: {
          customerId: sharedCustomer.id,
          name: 'No Requirements Site',
          timeZone: 'America/St_Johns',
        },
      });
      const emptyReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${emptySite.id}/readiness?asOf=2026-06-05`,
      );
      assert.ok(
        emptyReadinessResponse
          .json()
          .every(
            (row: { status: string; eligible: boolean }) =>
              row.status === 'noRequirements' && row.eligible === false,
          ),
      );

      const archiveCourseResponse = await request(
        'POST',
        `/api/v1/admin/courses/${course.id}/archive`,
        { expectedVersion: course.version },
      );
      assert.equal(archiveCourseResponse.statusCode, 409);
      assert.equal(archiveCourseResponse.json().code, 'COURSE_HAS_OPEN_REQUIREMENTS');

      const archiveCustomerResponse = await request(
        'POST',
        `/api/v1/admin/customers/${customer.id}/archive`,
        { expectedVersion: customer.version },
      );
      assert.equal(archiveCustomerResponse.statusCode, 409);
      assert.equal(archiveCustomerResponse.json().code, 'CUSTOMER_HAS_ACTIVE_SITES');

      const firstUpdate = await request('PATCH', `/api/v1/admin/employees/${employee.id}`, {
        jobTitle: 'Senior Technician',
        expectedVersion: employee.version,
      });
      assert.equal(firstUpdate.statusCode, 200);
      const staleUpdate = await request('PATCH', `/api/v1/admin/employees/${employee.id}`, {
        jobTitle: 'Stale Title',
        expectedVersion: employee.version,
      });
      assert.equal(staleUpdate.statusCode, 409);
      assert.equal(staleUpdate.json().code, 'EDIT_CONFLICT');

      const voidResponse = await request(
        'POST',
        `/api/v1/admin/completions/${completionResponse.json().id}/void`,
        { reason: 'Incorrect certificate date' },
      );
      assert.equal(voidResponse.statusCode, 200);
      assert.equal(voidResponse.json().voidReason, 'Incorrect certificate date');

      const auditCount = await prisma.auditEvent.count({
        where: { actorSubject: 'integration-admin' },
      });
      assert.equal(auditCount, 8);
    } finally {
      await app.close();
      await disconnectDatabase();
    }
  },
);
