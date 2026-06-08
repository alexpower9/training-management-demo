import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

test(
  'PostgreSQL constraints and simplified course workflows work together',
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
    await prisma.courseCompletion.deleteMany();
    await prisma.siteCourseRequirement.deleteMany();
    await prisma.site.deleteMany();
    await prisma.course.deleteMany();
    await prisma.employee.deleteMany();

    const app = await buildApp();
    const headers = {
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
        headers: {
          ...headers,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        ...(payload ? { payload } : {}),
      });

    try {
      const employeeResponse = await request('POST', '/api/v1/admin/employees', {
        displayName: 'Overdue Employee',
      });
      assert.equal(employeeResponse.statusCode, 201);
      const employee = employeeResponse.json();

      const siteResponse = await request('POST', '/api/v1/admin/sites', {
        name: 'Constraint Site',
        timeZone: 'America/St_Johns',
      });
      assert.equal(siteResponse.statusCode, 201);
      const site = siteResponse.json();

      const secondSiteResponse = await request('POST', '/api/v1/admin/sites', {
        name: 'Shared Course Site',
        timeZone: 'America/St_Johns',
      });
      assert.equal(secondSiteResponse.statusCode, 201);
      const secondSite = secondSiteResponse.json();

      const duplicateSiteResponse = await request('POST', '/api/v1/admin/sites', {
        name: 'constraint site',
        timeZone: 'America/Toronto',
      });
      assert.equal(duplicateSiteResponse.statusCode, 409);

      const siteOptionsResponse = await request('GET', '/api/v1/admin/site-options');
      assert.equal(siteOptionsResponse.statusCode, 200);
      assert.deepEqual(
        siteOptionsResponse.json().map((option: { id: string }) => option.id).sort(),
        [site.id, secondSite.id].sort(),
      );

      const emptySitesResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'No Site Course',
        validityMonths: 12,
        siteIds: [],
      });
      assert.equal(emptySitesResponse.statusCode, 400);

      const invalidValidityResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'Invalid Validity Course',
        validityMonths: 0,
        siteIds: [site.id],
      });
      assert.equal(invalidValidityResponse.statusCode, 400);

      const duplicateSitesResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'Duplicate Site Selection',
        validityMonths: 12,
        siteIds: [site.id, site.id],
      });
      assert.equal(duplicateSitesResponse.statusCode, 400);

      const courseResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'Calendar Month Safety',
        validityMonths: 1,
        siteIds: [site.id, secondSite.id],
      });
      assert.equal(courseResponse.statusCode, 201);
      const course = courseResponse.json();
      assert.equal(course.requirements.length, 2);

      const duplicateCourseResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'calendar month safety',
        validityMonths: 12,
        siteIds: [site.id],
      });
      assert.equal(duplicateCourseResponse.statusCode, 409);

      const futureSiteResponse = await request('POST', '/api/v1/admin/sites', {
        name: 'Future Site',
        timeZone: 'America/St_Johns',
      });
      assert.equal(futureSiteResponse.statusCode, 201);
      const futureSite = futureSiteResponse.json();
      const courseBeforeUpdate = await request(
        'GET',
        `/api/v1/admin/courses/${course.id}`,
      );
      assert.equal(
        courseBeforeUpdate
          .json()
          .requirements.some(
            (requirement: { siteId: string }) => requirement.siteId === futureSite.id,
          ),
        false,
      );

      const completionResponse = await request('POST', '/api/v1/admin/completions', {
        employeeId: employee.id,
        courseId: course.id,
        completedOn: '2024-01-31',
      });
      assert.equal(completionResponse.statusCode, 201);
      assert.equal(completionResponse.json().expiresOn, '2024-02-29');
      assert.equal(completionResponse.json().validityMonthsApplied, 1);

      const duplicateCompletionResponse = await request(
        'POST',
        '/api/v1/admin/completions',
        {
          employeeId: employee.id,
          courseId: course.id,
          completedOn: '2024-01-31',
        },
      );
      assert.equal(duplicateCompletionResponse.statusCode, 409);

      const updateResponse = await request(
        'PATCH',
        `/api/v1/admin/courses/${course.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 2,
          siteIds: [site.id],
        },
      );
      assert.equal(updateResponse.statusCode, 200);
      assert.equal(updateResponse.json().validityMonths, 2);
      assert.deepEqual(
        updateResponse
          .json()
          .requirements.map((requirement: { siteId: string }) => requirement.siteId),
        [site.id],
      );

      const storedCompletion = await prisma.courseCompletion.findUnique({
        where: { id: completionResponse.json().id },
      });
      assert.equal(storedCompletion?.expiresOn.toISOString().slice(0, 10), '2024-02-29');
      assert.equal(storedCompletion?.validityMonthsApplied, 1);

      const expiringEmployee = await prisma.employee.create({
        data: { displayName: 'Expiring Employee' },
      });
      const compliantEmployee = await prisma.employee.create({
        data: { displayName: 'Compliant Employee' },
      });
      await prisma.employee.create({
        data: { displayName: 'Incomplete Employee' },
      });
      await prisma.employee.create({
        data: { displayName: 'Archived Employee', archivedAt: new Date() },
      });
      await prisma.courseCompletion.createMany({
        data: [
          {
            employeeId: expiringEmployee.id,
            courseId: course.id,
            completedOn: new Date('2026-01-01T00:00:00.000Z'),
            expiresOn: new Date('2026-06-20T00:00:00.000Z'),
            validityMonthsApplied: null,
            recordedBySubject: 'integration-legacy-setup',
          },
          {
            employeeId: compliantEmployee.id,
            courseId: course.id,
            completedOn: new Date('2026-01-01T00:00:00.000Z'),
            expiresOn: new Date('2027-01-01T00:00:00.000Z'),
            validityMonthsApplied: null,
            recordedBySubject: 'integration-legacy-setup',
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

      await request('POST', `/api/v1/admin/sites/${site.id}/archive`);
      const retainArchivedAssignmentResponse = await request(
        'PATCH',
        `/api/v1/admin/courses/${course.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 2,
          siteIds: [site.id],
        },
      );
      assert.equal(retainArchivedAssignmentResponse.statusCode, 200);

      const archivedNewSelectionResponse = await request(
        'PATCH',
        `/api/v1/admin/courses/${course.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 2,
          siteIds: [site.id, secondSite.id],
        },
      );
      assert.equal(archivedNewSelectionResponse.statusCode, 200);
      await request('POST', `/api/v1/admin/sites/${secondSite.id}/archive`);
      const removeArchivedSelectionResponse = await request(
        'PATCH',
        `/api/v1/admin/courses/${course.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 2,
          siteIds: [site.id],
        },
      );
      assert.equal(removeArchivedSelectionResponse.statusCode, 200);

      const newlyArchivedCourseResponse = await request(
        'POST',
        '/api/v1/admin/courses',
        {
          name: 'Archived Site Rejection',
          validityMonths: 12,
          siteIds: [secondSite.id],
        },
      );
      assert.equal(newlyArchivedCourseResponse.statusCode, 400);

      await request('POST', `/api/v1/admin/sites/${site.id}/restore`);
      const archiveCourseResponse = await request(
        'POST',
        `/api/v1/admin/courses/${course.id}/archive`,
      );
      assert.equal(archiveCourseResponse.statusCode, 200);

      const archivedCourseDetail = await request(
        'GET',
        `/api/v1/admin/courses/${course.id}`,
      );
      assert.deepEqual(
        archivedCourseDetail
          .json()
          .requirements.map((requirement: { siteId: string }) => requirement.siteId),
        [site.id],
      );

      const suspendedReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      );
      assert.ok(
        suspendedReadinessResponse
          .json()
          .every(
            (row: { status: string; eligible: boolean }) =>
              row.status === 'noRequirements' && row.eligible === false,
          ),
      );

      await request('POST', `/api/v1/admin/courses/${course.id}/restore`);
      const restoredReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      );
      assert.equal(
        restoredReadinessResponse
          .json()
          .some((row: { status: string }) => row.status !== 'noRequirements'),
        true,
      );

      const employeeUpdateResponse = await request(
        'PATCH',
        `/api/v1/admin/employees/${employee.id}`,
        { displayName: 'Updated Employee' },
      );
      assert.equal(employeeUpdateResponse.statusCode, 200);
      assert.equal(employeeUpdateResponse.json().displayName, 'Updated Employee');

      const voidResponse = await request(
        'POST',
        `/api/v1/admin/completions/${completionResponse.json().id}/void`,
        { reason: 'Incorrect certificate date' },
      );
      assert.equal(voidResponse.statusCode, 200);
      assert.equal(voidResponse.json().voidReason, 'Incorrect certificate date');
    } finally {
      await app.close();
      await disconnectDatabase();
    }
  },
);
