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
      'x-demo-user-role': 'owner',
      'x-demo-user-subject': 'integration-owner',
    };
    const request = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
        email: 'overdue.employee@example.com',
      });
      assert.equal(employeeResponse.statusCode, 201);
      const employee = employeeResponse.json();
      assert.equal(employee.email, 'overdue.employee@example.com');
      assert.equal('cognitoSubject' in employee, false);
      const storedEmployee = await prisma.employee.findUniqueOrThrow({
        where: { id: employee.id },
      });
      const employeeSubject = storedEmployee.cognitoSubject;

      const linkedListResponse = await request(
        'GET',
        '/api/v1/admin/employees?search=Overdue%20Employee',
      );
      assert.equal(linkedListResponse.statusCode, 200);
      assert.equal('cognitoSubject' in linkedListResponse.json().items[0], false);
      assert.equal(
        linkedListResponse.json().items[0].email,
        'overdue.employee@example.com',
      );
      const emailSearchResponse = await request(
        'GET',
        '/api/v1/admin/employees?search=overdue.employee%40example.com',
      );
      assert.equal(emailSearchResponse.json().items[0].id, employee.id);

      const adminListResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/employees?search=Overdue%20Employee',
        headers: {
          'x-demo-user-role': 'admin',
          'x-demo-user-subject': 'integration-admin',
        },
      });
      assert.equal(adminListResponse.statusCode, 200);
      assert.equal('cognitoSubject' in adminListResponse.json().items[0], false);
      const adminDetailResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/employees/${employee.id}`,
        headers: {
          'x-demo-user-role': 'admin',
          'x-demo-user-subject': 'integration-admin',
        },
      });
      assert.equal(adminDetailResponse.statusCode, 200);
      assert.equal('cognitoSubject' in adminDetailResponse.json(), false);

      const removedLinkResponse = await request(
        'PUT',
        `/api/v1/admin/employees/${employee.id}/account`,
        { subject: '20000000-0000-4000-8000-000000000101' },
      );
      assert.equal(removedLinkResponse.statusCode, 404);

      const duplicateEmailResponse = await request(
        'POST',
        '/api/v1/admin/employees',
        {
          displayName: 'Duplicate Email Employee',
          email: 'OVERDUE.EMPLOYEE@example.com',
        },
      );
      assert.equal(duplicateEmailResponse.statusCode, 409);
      assert.equal(duplicateEmailResponse.json().code, 'EMPLOYEE_EMAIL_EXISTS');

      const accountEmployeeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/employees',
        headers: {
          'content-type': 'application/json',
          'x-demo-user-role': 'admin',
          'x-demo-user-subject': 'integration-admin',
        },
        payload: {
          displayName: 'Account Workflow Employee',
          email: 'account.workflow@example.com',
        },
      });
      assert.equal(accountEmployeeResponse.statusCode, 201);
      const accountEmployee = accountEmployeeResponse.json();
      assert.equal('cognitoSubject' in accountEmployee, false);
      const accountEmployeeRecord = await prisma.employee.findUniqueOrThrow({
        where: { id: accountEmployee.id },
      });
      const accountEmployeeSubject = accountEmployeeRecord.cognitoSubject;
      const archiveEmployeeResponse = await request(
        'POST',
        `/api/v1/admin/employees/${accountEmployee.id}/archive`,
      );
      assert.equal('cognitoSubject' in archiveEmployeeResponse.json(), false);

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
        comment: 'Certificate uploaded to shared drive.',
      });
      assert.equal(completionResponse.statusCode, 201);
      assert.equal(completionResponse.json().expiresOn, '2024-02-29');
      assert.equal(completionResponse.json().validityMonthsApplied, 1);
      assert.equal(
        completionResponse.json().comment,
        'Certificate uploaded to shared drive.',
      );

      const adminCompletionList = await request(
        'GET',
        `/api/v1/admin/completions?employeeId=${employee.id}`,
      );
      assert.equal(adminCompletionList.statusCode, 200);
      assert.equal(
        adminCompletionList.json().items[0].comment,
        'Certificate uploaded to shared drive.',
      );
      assert.equal(
        JSON.stringify(adminCompletionList.json()).includes('cognitoSubject'),
        false,
      );
      const completionList = await request(
        'GET',
        `/api/v1/completions?employeeId=${employee.id}`,
      );
      assert.equal(completionList.statusCode, 200);
      assert.equal(
        completionList.json()[0].comment,
        'Certificate uploaded to shared drive.',
      );
      assert.equal(
        JSON.stringify(completionList.json()).includes('cognitoSubject'),
        false,
      );
      const courseDetailWithCompletion = await request(
        'GET',
        `/api/v1/admin/courses/${course.id}`,
      );
      assert.equal(
        courseDetailWithCompletion.json().completions[0].comment,
        'Certificate uploaded to shared drive.',
      );
      assert.equal(
        JSON.stringify(courseDetailWithCompletion.json()).includes('cognitoSubject'),
        false,
      );

      const blankCommentResponse = await request(
        'POST',
        '/api/v1/admin/completions',
        {
          employeeId: employee.id,
          courseId: course.id,
          completedOn: '2024-02-01',
          comment: '   ',
        },
      );
      assert.equal(blankCommentResponse.statusCode, 201);
      assert.equal(blankCommentResponse.json().comment, null);

      const longCommentResponse = await request(
        'POST',
        '/api/v1/admin/completions',
        {
          employeeId: employee.id,
          courseId: course.id,
          completedOn: '2024-02-02',
          comment: 'x'.repeat(501),
        },
      );
      assert.equal(longCommentResponse.statusCode, 400);
      assert.deepEqual(longCommentResponse.json().fieldErrors.comment, [
        'String must contain at most 500 character(s)',
      ]);

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
      assert.equal(
        storedCompletion?.comment,
        'Certificate uploaded to shared drive.',
      );

      const expiringEmployee = await prisma.employee.create({
        data: {
          displayName: 'Expiring Employee',
          email: 'expiring.employee@example.com',
          cognitoSubject: '20000000-0000-4000-8000-000000000201',
        },
      });
      const compliantEmployee = await prisma.employee.create({
        data: {
          displayName: 'Compliant Employee',
          email: 'compliant.employee@example.com',
          cognitoSubject: '20000000-0000-4000-8000-000000000202',
        },
      });
      await prisma.employee.create({
        data: {
          displayName: 'Incomplete Employee',
          email: 'incomplete.employee@example.com',
          cognitoSubject: '20000000-0000-4000-8000-000000000203',
        },
      });
      await prisma.employee.create({
        data: {
          displayName: 'Archived Employee',
          email: 'archived.employee@example.com',
          cognitoSubject: '20000000-0000-4000-8000-000000000204',
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
      assert.equal(JSON.stringify(readiness).includes('recordedBySubject'), false);
      assert.equal(JSON.stringify(readiness).includes('voidedBySubject'), false);
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

      const employeeHeaders = {
        'x-demo-user-role': 'employee',
        'x-demo-user-subject': employeeSubject,
      };
      const employeeMeResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: employeeHeaders,
      });
      assert.equal(employeeMeResponse.statusCode, 200);
      assert.equal(employeeMeResponse.json().role, 'employee');
      assert.equal(employeeMeResponse.json().employee.id, employee.id);

      const selfReadinessResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me/readiness?asOf=2026-06-05',
        headers: employeeHeaders,
      });
      assert.equal(selfReadinessResponse.statusCode, 200);
      const selfReadiness = selfReadinessResponse.json();
      assert.equal(selfReadiness.length, 3);
      assert.equal(
        selfReadiness.every(
          (summary: { employee: { id: string } }) => summary.employee.id === employee.id,
        ),
        true,
      );
      assert.equal(JSON.stringify(selfReadiness).includes('recordedBySubject'), false);
      assert.equal(JSON.stringify(selfReadiness).includes('voidedBySubject'), false);
      assert.equal(JSON.stringify(selfReadiness).includes('comment'), false);

      for (const url of [
        '/api/v1/employees',
        `/api/v1/sites/${site.id}/readiness`,
        '/api/v1/completions',
        '/api/v1/admin/employees',
      ]) {
        const response = await app.inject({
          method: 'GET',
          url,
          headers: employeeHeaders,
        });
        assert.equal(response.statusCode, 403);
      }

      const unlinkedResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': '20000000-0000-4000-8000-000000000103',
        },
      });
      assert.equal(unlinkedResponse.statusCode, 403);
      assert.equal(unlinkedResponse.json().code, 'EMPLOYEE_ACCOUNT_NOT_LINKED');

      const inactiveResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': accountEmployeeSubject,
        },
      });
      assert.equal(inactiveResponse.statusCode, 403);
      assert.equal(inactiveResponse.json().code, 'EMPLOYEE_ACCOUNT_INACTIVE');

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

      const siteListAfterCourseArchive = await request(
        'GET',
        '/api/v1/admin/sites?search=Constraint%20Site',
      );
      assert.equal(siteListAfterCourseArchive.statusCode, 200);
      assert.equal(
        siteListAfterCourseArchive.json().items[0]._count.requirements,
        0,
      );

      const siteDetailAfterCourseArchive = await request(
        'GET',
        `/api/v1/admin/sites/${site.id}`,
      );
      assert.equal(siteDetailAfterCourseArchive.statusCode, 200);
      assert.deepEqual(siteDetailAfterCourseArchive.json().requirements, []);

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
      const siteDetailAfterCourseRestore = await request(
        'GET',
        `/api/v1/admin/sites/${site.id}`,
      );
      assert.equal(siteDetailAfterCourseRestore.statusCode, 200);
      assert.deepEqual(
        siteDetailAfterCourseRestore
          .json()
          .requirements.map(
            (requirement: { courseId: string }) => requirement.courseId,
          ),
        [course.id],
      );

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

      await request(
        'POST',
        `/api/v1/admin/employees/${accountEmployee.id}/restore`,
      );
      const restoredEmployeeAccessResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': accountEmployeeSubject,
        },
      });
      assert.equal(restoredEmployeeAccessResponse.statusCode, 200);
      assert.equal(
        restoredEmployeeAccessResponse.json().employee.id,
        accountEmployee.id,
      );

      const employeeUpdateResponse = await request(
        'PATCH',
        `/api/v1/admin/employees/${employee.id}`,
        {
          displayName: 'Updated Employee',
          email: 'changed.email@example.com',
        },
      );
      assert.equal(employeeUpdateResponse.statusCode, 200);
      assert.equal(employeeUpdateResponse.json().displayName, 'Updated Employee');
      assert.equal(
        employeeUpdateResponse.json().email,
        'overdue.employee@example.com',
      );
      assert.equal('cognitoSubject' in employeeUpdateResponse.json(), false);

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
