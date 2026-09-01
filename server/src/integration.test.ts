import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

test(
  'PostgreSQL constraints and compliance workflows work together',
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
    await prisma.medicalPendingCompletion.deleteMany();
    await prisma.coursePendingCompletion.deleteMany();
    await prisma.medicalCompletion.deleteMany();
    await prisma.courseCompletion.deleteMany();
    await prisma.siteMedicalRequirement.deleteMany();
    await prisma.siteCourseRequirement.deleteMany();
    await prisma.medical.deleteMany();
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
      assert.deepEqual(linkedListResponse.json().items[0].account, {
        status: 'invitationPending',
        canResendInvitation: true,
      });
      assert.equal('subject' in linkedListResponse.json().items[0].account, false);
      assert.equal('username' in linkedListResponse.json().items[0].account, false);
      assert.equal('email' in linkedListResponse.json().items[0].account, false);
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
      assert.deepEqual(adminDetailResponse.json().account, {
        status: 'invitationPending',
        canResendInvitation: true,
      });

      const resendInvitationResponse = await request(
        'POST',
        `/api/v1/admin/employees/${employee.id}/resend-invitation`,
      );
      assert.equal(resendInvitationResponse.statusCode, 200);
      assert.equal('cognitoSubject' in resendInvitationResponse.json(), false);
      assert.deepEqual(resendInvitationResponse.json().account, {
        status: 'invitationPending',
        canResendInvitation: false,
      });

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
      const archivedResendResponse = await request(
        'POST',
        `/api/v1/admin/employees/${accountEmployee.id}/resend-invitation`,
      );
      assert.equal(archivedResendResponse.statusCode, 409);
      assert.equal(
        archivedResendResponse.json().code,
        'EMPLOYEE_INVITATION_ARCHIVED',
      );

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

      const noSiteCourseResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'No Site Course',
        validityMonths: 12,
        siteIds: [],
      });
      assert.equal(noSiteCourseResponse.statusCode, 201);
      const noSiteCourse = noSiteCourseResponse.json();
      assert.deepEqual(noSiteCourse.requirements, []);

      const siteCoursesAfterNoSiteCourse = await request(
        'GET',
        `/api/v1/sites/${site.id}/courses`,
      );
      assert.equal(siteCoursesAfterNoSiteCourse.statusCode, 200);
      assert.equal(
        siteCoursesAfterNoSiteCourse
          .json()
          .some((siteCourse: { id: string }) => siteCourse.id === noSiteCourse.id),
        false,
      );

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

      const siteAssignedCourseResponse = await request(
        'POST',
        '/api/v1/admin/courses',
        {
          name: 'Site Assigned Then General',
          validityMonths: 12,
          siteIds: [site.id],
        },
      );
      assert.equal(siteAssignedCourseResponse.statusCode, 201);
      const noSiteUpdateResponse = await request(
        'PATCH',
        `/api/v1/admin/courses/${siteAssignedCourseResponse.json().id}`,
        {
          name: 'Site Assigned Then General',
          validityMonths: 12,
          siteIds: [],
        },
      );
      assert.equal(noSiteUpdateResponse.statusCode, 200);
      assert.deepEqual(noSiteUpdateResponse.json().requirements, []);

      const duplicateCourseResponse = await request('POST', '/api/v1/admin/courses', {
        name: 'calendar month safety',
        validityMonths: 12,
        siteIds: [site.id],
      });
      assert.equal(duplicateCourseResponse.statusCode, 409);

      const noSiteMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          name: 'No Site Medical',
          validityMonths: 12,
          siteIds: [],
        },
      );
      assert.equal(noSiteMedicalResponse.statusCode, 201);
      const noSiteMedical = noSiteMedicalResponse.json();
      assert.deepEqual(noSiteMedical.requirements, []);

      const invalidMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          name: 'Invalid Medical',
          validityMonths: 0,
          siteIds: [site.id],
        },
      );
      assert.equal(invalidMedicalResponse.statusCode, 400);

      const duplicateMedicalSitesResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          name: 'Duplicate Medical Sites',
          validityMonths: 12,
          siteIds: [site.id, site.id],
        },
      );
      assert.equal(duplicateMedicalSitesResponse.statusCode, 400);

      const medicalResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          // Course and Medical namespaces are intentionally independent.
          name: 'Calendar Month Safety',
          validityMonths: 1,
          siteIds: [site.id, secondSite.id],
        },
      );
      assert.equal(medicalResponse.statusCode, 201);
      const medical = medicalResponse.json();
      assert.equal(medical.requirements.length, 2);

      const duplicateMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          name: 'calendar month safety',
          validityMonths: 12,
          siteIds: [site.id],
        },
      );
      assert.equal(duplicateMedicalResponse.statusCode, 409);
      assert.equal(duplicateMedicalResponse.json().code, 'MEDICAL_NAME_EXISTS');

      const siteMedicalsResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/medicals`,
      );
      assert.equal(siteMedicalsResponse.statusCode, 200);
      assert.deepEqual(
        siteMedicalsResponse
          .json()
          .map((item: { id: string }) => item.id),
        [medical.id],
      );
      assert.equal(
        siteMedicalsResponse
          .json()
          .some((item: { id: string }) => item.id === noSiteMedical.id),
        false,
      );

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
      const completionDetailResponse = await request(
        'GET',
        `/api/v1/admin/completions/${completionResponse.json().id}`,
      );
      assert.equal(completionDetailResponse.statusCode, 200);
      assert.equal(completionDetailResponse.json().course.id, course.id);
      assert.equal(completionDetailResponse.json().completedOn, '2024-01-31');
      assert.equal(
        JSON.stringify(completionDetailResponse.json()).includes('cognitoSubject'),
        false,
      );

      const pendingCourseResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        {
          employeeId: employee.id,
          courseId: course.id,
          comment: 'Waiting for the technician to confirm the date.',
        },
      );
      assert.equal(pendingCourseResponse.statusCode, 201);
      const pendingCourse = pendingCourseResponse.json();
      assert.equal(pendingCourse.status, 'pending');
      assert.equal(pendingCourse.validityMonthsSnapshot, 1);
      assert.equal(pendingCourse.completion, null);
      assert.equal('resolution' in pendingCourse, false);
      assert.equal(
        JSON.stringify(pendingCourse).includes('cognitoSubject'),
        false,
      );

      const duplicatePendingCourseResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        {
          employeeId: employee.id,
          courseId: course.id,
        },
      );
      assert.equal(duplicatePendingCourseResponse.statusCode, 409);
      assert.equal(
        duplicatePendingCourseResponse.json().code,
        'PENDING_COMPLETION_EXISTS',
      );

      const pendingCourseList = await request(
        'GET',
        `/api/v1/admin/pending-completions?employeeId=${employee.id}&courseId=${course.id}&search=Calendar`,
      );
      assert.equal(pendingCourseList.statusCode, 200);
      assert.equal(pendingCourseList.json().total, 1);
      assert.equal(pendingCourseList.json().items[0].id, pendingCourse.id);

      const pendingCourseDetail = await request(
        'GET',
        `/api/v1/admin/pending-completions/${pendingCourse.id}`,
      );
      assert.equal(pendingCourseDetail.statusCode, 200);
      assert.equal(pendingCourseDetail.json().status, 'pending');

      const employeeWithPendingCourse = await request(
        'GET',
        `/api/v1/admin/employees/${employee.id}`,
      );
      assert.deepEqual(
        employeeWithPendingCourse
          .json()
          .pendingCompletions.map((pending: { id: string }) => pending.id),
        [pendingCourse.id],
      );
      assert.deepEqual(
        employeeWithPendingCourse.json().pendingMedicalCompletions,
        [],
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

      await assert.rejects(
        prisma.courseCompletion.update({
          where: { id: blankCommentResponse.json().id },
          data: {
            comment: 'Rewritten while voiding',
            voidedAt: new Date(),
            voidedBySubject: 'integration-owner',
            voidReason: 'Combined rewrite attempt',
          },
        }),
        /Completion facts are immutable/,
      );

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

      assert.equal(
        (
          await request(
            'POST',
            `/api/v1/admin/employees/${employee.id}/archive`,
          )
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await request('POST', `/api/v1/admin/courses/${course.id}/archive`)
        ).statusCode,
        200,
      );
      const archivedEmployeePendingResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        { employeeId: employee.id, courseId: noSiteCourse.id },
      );
      assert.equal(archivedEmployeePendingResponse.statusCode, 404);
      assert.equal(
        archivedEmployeePendingResponse.json().code,
        'EMPLOYEE_NOT_FOUND',
      );

      const correctedCourseCompletionResponse = await request(
        'POST',
        `/api/v1/admin/completions/${blankCommentResponse.json().id}/correct-dates`,
        {
          completedOn: '2024-02-29',
          expiresOn: '2024-12-31',
          reason: '  Corrected from the technician certificate.  ',
        },
      );
      assert.equal(correctedCourseCompletionResponse.statusCode, 200);
      const correctedCourseCompletion = correctedCourseCompletionResponse.json();
      assert.equal(
        correctedCourseCompletion.correctsCompletionId,
        blankCommentResponse.json().id,
      );
      assert.equal(correctedCourseCompletion.expiryManuallySet, true);
      assert.equal(correctedCourseCompletion.completedOn, '2024-02-29');
      assert.equal(correctedCourseCompletion.expiresOn, '2024-12-31');
      assert.equal(correctedCourseCompletion.validityMonthsApplied, 1);
      assert.equal(correctedCourseCompletion.comment, null);
      assert.equal(correctedCourseCompletion.recordedBySubject, 'integration-owner');
      assert.equal(correctedCourseCompletion.employee.id, employee.id);
      assert.equal(correctedCourseCompletion.course.id, course.id);

      const correctedCourseSource = await request(
        'GET',
        `/api/v1/admin/completions/${blankCommentResponse.json().id}`,
      );
      assert.equal(correctedCourseSource.statusCode, 200);
      assert.ok(correctedCourseSource.json().voidedAt);
      assert.equal(
        correctedCourseSource.json().voidReason,
        'Corrected from the technician certificate.',
      );
      assert.equal(
        correctedCourseSource.json().voidedBySubject,
        'integration-owner',
      );

      const correctVoidedCourseResponse = await request(
        'POST',
        `/api/v1/admin/completions/${blankCommentResponse.json().id}/correct-dates`,
        {
          completedOn: '2024-03-01',
          expiresOn: '2025-03-01',
          reason: 'Second correction attempt.',
        },
      );
      assert.equal(correctVoidedCourseResponse.statusCode, 409);
      assert.equal(
        correctVoidedCourseResponse.json().code,
        'COMPLETION_ALREADY_VOIDED',
      );

      const duplicateCourseCorrectionResponse = await request(
        'POST',
        `/api/v1/admin/completions/${completionResponse.json().id}/correct-dates`,
        {
          completedOn: '2024-02-29',
          expiresOn: '2025-02-28',
          reason: 'Duplicate corrected date rollback test.',
        },
      );
      assert.equal(duplicateCourseCorrectionResponse.statusCode, 409);
      assert.equal(duplicateCourseCorrectionResponse.json().code, 'COMPLETION_EXISTS');
      const courseSourceAfterCorrectionRollback = await request(
        'GET',
        `/api/v1/admin/completions/${completionResponse.json().id}`,
      );
      assert.equal(courseSourceAfterCorrectionRollback.json().voidedAt, null);

      const noOpCourseCorrectionResponse = await request(
        'POST',
        `/api/v1/admin/completions/${completionResponse.json().id}/correct-dates`,
        {
          completedOn: '2024-01-31',
          expiresOn: '2024-02-29',
          reason: 'No-op correction test.',
        },
      );
      assert.equal(noOpCourseCorrectionResponse.statusCode, 400);
      assert.equal(
        noOpCourseCorrectionResponse.json().code,
        'COMPLETION_DATES_UNCHANGED',
      );

      await assert.rejects(
        prisma.courseCompletion.update({
          where: { id: correctedCourseCompletion.id },
          data: { expiresOn: new Date('2025-12-31T00:00:00.000Z') },
        }),
        /Completion facts are immutable/,
      );
      const finalizedPendingCourseResponse = await request(
        'POST',
        `/api/v1/admin/pending-completions/${pendingCourse.id}/finalize`,
        { completedOn: '2024-03-31' },
      );
      assert.equal(finalizedPendingCourseResponse.statusCode, 200);
      const finalizedPendingCourse = finalizedPendingCourseResponse.json();
      assert.equal(finalizedPendingCourse.status, 'finalized');
      assert.equal(finalizedPendingCourse.validityMonthsSnapshot, 1);
      assert.equal(finalizedPendingCourse.completion.completedOn, '2024-03-31');
      assert.equal(finalizedPendingCourse.completion.expiresOn, '2024-04-30');
      assert.equal(finalizedPendingCourse.completion.validityMonthsApplied, 1);
      assert.equal(
        finalizedPendingCourse.completion.comment,
        'Waiting for the technician to confirm the date.',
      );
      assert.equal(
        finalizedPendingCourse.completion.recordedBySubject,
        'integration-owner',
      );

      const finalizedCompletionDetail = await request(
        'GET',
        `/api/v1/admin/completions/${finalizedPendingCourse.completionId}`,
      );
      assert.equal(finalizedCompletionDetail.statusCode, 200);
      assert.equal(finalizedCompletionDetail.json().expiresOn, '2024-04-30');

      const finalizeCourseAgainResponse = await request(
        'POST',
        `/api/v1/admin/pending-completions/${pendingCourse.id}/finalize`,
        { completedOn: '2024-04-01' },
      );
      assert.equal(finalizeCourseAgainResponse.statusCode, 409);
      assert.equal(
        finalizeCourseAgainResponse.json().code,
        'PENDING_COMPLETION_ALREADY_RESOLVED',
      );

      await request('POST', `/api/v1/admin/employees/${employee.id}/restore`);
      const archivedCoursePendingResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        { employeeId: employee.id, courseId: course.id },
      );
      assert.equal(archivedCoursePendingResponse.statusCode, 404);
      assert.equal(archivedCoursePendingResponse.json().code, 'COURSE_NOT_FOUND');
      await request('POST', `/api/v1/admin/courses/${course.id}/restore`);

      const duplicateDatePendingResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        { employeeId: employee.id, courseId: course.id },
      );
      assert.equal(duplicateDatePendingResponse.statusCode, 201);
      const duplicateDatePending = duplicateDatePendingResponse.json();
      assert.equal(duplicateDatePending.validityMonthsSnapshot, 2);

      const duplicateDateFinalizeResponse = await request(
        'POST',
        `/api/v1/admin/pending-completions/${duplicateDatePending.id}/finalize`,
        { completedOn: '2024-01-31' },
      );
      assert.equal(duplicateDateFinalizeResponse.statusCode, 409);
      assert.equal(duplicateDateFinalizeResponse.json().code, 'COMPLETION_EXISTS');
      const stillOpenPending = await request(
        'GET',
        `/api/v1/admin/pending-completions/${duplicateDatePending.id}`,
      );
      assert.equal(stillOpenPending.json().status, 'pending');
      assert.equal(stillOpenPending.json().completionId, null);

      const cancelledPendingCourseResponse = await request(
        'POST',
        `/api/v1/admin/pending-completions/${duplicateDatePending.id}/cancel`,
        { reason: '  Technician confirmed this was entered in error.  ' },
      );
      assert.equal(cancelledPendingCourseResponse.statusCode, 200);
      assert.equal(cancelledPendingCourseResponse.json().status, 'cancelled');
      assert.equal(
        cancelledPendingCourseResponse.json().cancellationReason,
        'Technician confirmed this was entered in error.',
      );

      const resolvedPendingCourseList = await request(
        'GET',
        `/api/v1/admin/pending-completions?employeeId=${employee.id}&includeResolved=true`,
      );
      assert.equal(resolvedPendingCourseList.statusCode, 200);
      assert.equal(resolvedPendingCourseList.json().total, 2);
      assert.deepEqual(
        resolvedPendingCourseList
          .json()
          .items.map((pending: { status: string }) => pending.status)
          .sort(),
        ['cancelled', 'finalized'],
      );

      const concurrentPendingResponse = await request(
        'POST',
        '/api/v1/admin/pending-completions',
        { employeeId: employee.id, courseId: course.id },
      );
      assert.equal(concurrentPendingResponse.statusCode, 201);
      const concurrentPendingId = concurrentPendingResponse.json().id;
      const concurrentResolutionResponses = await Promise.all([
        request(
          'POST',
          `/api/v1/admin/pending-completions/${concurrentPendingId}/finalize`,
          { completedOn: '2025-01-31' },
        ),
        request(
          'POST',
          `/api/v1/admin/pending-completions/${concurrentPendingId}/cancel`,
          { reason: 'Concurrent cancellation test.' },
        ),
      ]);
      assert.deepEqual(
        concurrentResolutionResponses
          .map((response) => response.statusCode)
          .sort((left, right) => left - right),
        [200, 409],
      );
      const concurrentlyResolvedPending = await request(
        'GET',
        `/api/v1/admin/pending-completions/${concurrentPendingId}`,
      );
      assert.ok(
        ['finalized', 'cancelled'].includes(
          concurrentlyResolvedPending.json().status,
        ),
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

      const medicalCompletionResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: compliantEmployee.id,
          medicalId: medical.id,
          completedOn: '2026-05-31',
          comment: 'Medical certificate verified.',
        },
      );
      assert.equal(medicalCompletionResponse.statusCode, 201);
      assert.equal(medicalCompletionResponse.json().expiresOn, '2026-06-30');
      assert.equal(medicalCompletionResponse.json().validityMonthsApplied, 1);
      assert.equal(
        medicalCompletionResponse.json().comment,
        'Medical certificate verified.',
      );

      const noSiteMedicalCompletionResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: employee.id,
          medicalId: noSiteMedical.id,
          completedOn: '2026-05-01',
          comment: 'Original no-site medical certificate.',
        },
      );
      assert.equal(noSiteMedicalCompletionResponse.statusCode, 201);

      const duplicateMedicalCompletionResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: compliantEmployee.id,
          medicalId: medical.id,
          completedOn: '2026-05-31',
        },
      );
      assert.equal(duplicateMedicalCompletionResponse.statusCode, 409);
      assert.equal(
        duplicateMedicalCompletionResponse.json().code,
        'MEDICAL_COMPLETION_EXISTS',
      );

      const medicalCompletionListResponse = await request(
        'GET',
        `/api/v1/admin/medical-completions?employeeId=${compliantEmployee.id}`,
      );
      assert.equal(medicalCompletionListResponse.statusCode, 200);
      assert.equal(
        medicalCompletionListResponse.json().items[0].comment,
        'Medical certificate verified.',
      );
      assert.equal(
        JSON.stringify(medicalCompletionListResponse.json()).includes(
          'cognitoSubject',
        ),
        false,
      );

      const medicalCompletionDetailResponse = await request(
        'GET',
        `/api/v1/admin/medical-completions/${medicalCompletionResponse.json().id}`,
      );
      assert.equal(medicalCompletionDetailResponse.statusCode, 200);
      assert.equal(medicalCompletionDetailResponse.json().medical.id, medical.id);
      assert.equal(
        medicalCompletionDetailResponse.json().completedOn,
        '2026-05-31',
      );

      const pendingMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medical-pending-completions',
        {
          employeeId: employee.id,
          medicalId: medical.id,
          comment: 'Awaiting the medical certificate date.',
        },
      );
      assert.equal(pendingMedicalResponse.statusCode, 201);
      const pendingMedical = pendingMedicalResponse.json();
      assert.equal(pendingMedical.status, 'pending');
      assert.equal(pendingMedical.validityMonthsSnapshot, 1);
      assert.equal(pendingMedical.completion, null);

      const duplicatePendingMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medical-pending-completions',
        { employeeId: employee.id, medicalId: medical.id },
      );
      assert.equal(duplicatePendingMedicalResponse.statusCode, 409);
      assert.equal(
        duplicatePendingMedicalResponse.json().code,
        'MEDICAL_PENDING_COMPLETION_EXISTS',
      );

      const duplicateMedicalDatePendingResponse = await request(
        'POST',
        '/api/v1/admin/medical-pending-completions',
        { employeeId: compliantEmployee.id, medicalId: medical.id },
      );
      assert.equal(duplicateMedicalDatePendingResponse.statusCode, 201);
      const duplicateMedicalDateFinalizeResponse = await request(
        'POST',
        `/api/v1/admin/medical-pending-completions/${duplicateMedicalDatePendingResponse.json().id}/finalize`,
        { completedOn: '2026-05-31' },
      );
      assert.equal(duplicateMedicalDateFinalizeResponse.statusCode, 409);
      assert.equal(
        duplicateMedicalDateFinalizeResponse.json().code,
        'MEDICAL_COMPLETION_EXISTS',
      );
      const stillOpenMedicalPending = await request(
        'GET',
        `/api/v1/admin/medical-pending-completions/${duplicateMedicalDatePendingResponse.json().id}`,
      );
      assert.equal(stillOpenMedicalPending.json().status, 'pending');
      await request(
        'POST',
        `/api/v1/admin/medical-pending-completions/${duplicateMedicalDatePendingResponse.json().id}/cancel`,
        { reason: 'Duplicate medical date test cleanup.' },
      );

      const futureMedicalPendingResponse = await request(
        'POST',
        '/api/v1/admin/medical-pending-completions',
        {
          employeeId: expiringEmployee.id,
          medicalId: noSiteMedical.id,
          comment: 'Future-dated medical confirmation.',
        },
      );
      assert.equal(futureMedicalPendingResponse.statusCode, 201);
      assert.equal(futureMedicalPendingResponse.json().validityMonthsSnapshot, 12);
      await request(
        'POST',
        `/api/v1/admin/medicals/${noSiteMedical.id}/archive`,
      );
      const finalizedMedicalPendingResponse = await request(
        'POST',
        `/api/v1/admin/medical-pending-completions/${futureMedicalPendingResponse.json().id}/finalize`,
        { completedOn: '2030-02-28' },
      );
      assert.equal(finalizedMedicalPendingResponse.statusCode, 200);
      assert.equal(finalizedMedicalPendingResponse.json().status, 'finalized');
      assert.equal(
        finalizedMedicalPendingResponse.json().completion.expiresOn,
        '2031-02-28',
      );
      assert.equal(
        finalizedMedicalPendingResponse.json().completion.comment,
        'Future-dated medical confirmation.',
      );

      const correctedMedicalCompletionResponse = await request(
        'POST',
        `/api/v1/admin/medical-completions/${noSiteMedicalCompletionResponse.json().id}/correct-dates`,
        {
          completedOn: '2026-05-15',
          expiresOn: '2028-01-31',
          reason: '  Corrected from the medical certificate.  ',
        },
      );
      assert.equal(correctedMedicalCompletionResponse.statusCode, 200);
      const correctedMedicalCompletion = correctedMedicalCompletionResponse.json();
      assert.equal(
        correctedMedicalCompletion.correctsCompletionId,
        noSiteMedicalCompletionResponse.json().id,
      );
      assert.equal(correctedMedicalCompletion.expiryManuallySet, true);
      assert.equal(correctedMedicalCompletion.completedOn, '2026-05-15');
      assert.equal(correctedMedicalCompletion.expiresOn, '2028-01-31');
      assert.equal(correctedMedicalCompletion.validityMonthsApplied, 12);
      assert.equal(
        correctedMedicalCompletion.comment,
        'Original no-site medical certificate.',
      );
      assert.equal(correctedMedicalCompletion.employee.id, employee.id);
      assert.equal(correctedMedicalCompletion.medical.id, noSiteMedical.id);

      const correctedMedicalSource = await request(
        'GET',
        `/api/v1/admin/medical-completions/${noSiteMedicalCompletionResponse.json().id}`,
      );
      assert.ok(correctedMedicalSource.json().voidedAt);
      assert.equal(
        correctedMedicalSource.json().voidReason,
        'Corrected from the medical certificate.',
      );
      await assert.rejects(
        prisma.medicalCompletion.update({
          where: { id: correctedMedicalCompletion.id },
          data: { completedOn: new Date('2026-05-16T00:00:00.000Z') },
        }),
        /Completion facts are immutable/,
      );
      await request(
        'POST',
        `/api/v1/admin/medicals/${noSiteMedical.id}/restore`,
      );

      const finalizedMedicalCompletionDetail = await request(
        'GET',
        `/api/v1/admin/medical-completions/${finalizedMedicalPendingResponse.json().completionId}`,
      );
      assert.equal(finalizedMedicalCompletionDetail.statusCode, 200);
      assert.equal(
        finalizedMedicalCompletionDetail.json().validityMonthsApplied,
        12,
      );

      const pendingMedicalList = await request(
        'GET',
        `/api/v1/admin/medical-pending-completions?employeeId=${employee.id}&medicalId=${medical.id}&search=Calendar`,
      );
      assert.equal(pendingMedicalList.statusCode, 200);
      assert.equal(pendingMedicalList.json().total, 1);
      assert.equal(pendingMedicalList.json().items[0].id, pendingMedical.id);

      const readinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      );
      assert.equal(readinessResponse.statusCode, 200);
      const readiness = readinessResponse.json();
      assert.equal(JSON.stringify(readiness).includes('recordedBySubject'), false);
      assert.equal(JSON.stringify(readiness).includes('voidedBySubject'), false);
      assert.equal(JSON.stringify(readiness).includes(noSiteCourse.id), false);
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
      const compliantTrainingSummary = readiness.find(
        (row: { employee: { id: string } }) =>
          row.employee.id === compliantEmployee.id,
      );
      assert.equal(compliantTrainingSummary.combinedAccess.status, 'expiring');
      assert.equal(compliantTrainingSummary.combinedAccess.eligible, true);
      assert.equal(compliantTrainingSummary.eligible, true);
      assert.equal(compliantTrainingSummary.domainEligible, true);
      assert.deepEqual(
        compliantTrainingSummary.combinedAccess.blockingDomains,
        [],
      );
      const expiringTrainingSummary = readiness.find(
        (row: { employee: { id: string } }) =>
          row.employee.id === expiringEmployee.id,
      );
      assert.equal(expiringTrainingSummary.status, 'expiring');
      assert.equal(expiringTrainingSummary.combinedAccess.status, 'incomplete');
      assert.equal(expiringTrainingSummary.combinedAccess.eligible, false);
      assert.equal(expiringTrainingSummary.eligible, false);
      assert.equal(expiringTrainingSummary.domainEligible, true);
      assert.deepEqual(
        expiringTrainingSummary.combinedAccess.blockingDomains,
        ['medical'],
      );

      const medicalReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/medical-readiness?asOf=2026-06-05`,
      );
      assert.equal(medicalReadinessResponse.statusCode, 200);
      const medicalReadiness = medicalReadinessResponse.json();
      assert.equal(JSON.stringify(medicalReadiness).includes('comment'), false);
      const pendingEmployeeMedicalSummary = medicalReadiness.find(
        (row: { employee: { id: string } }) => row.employee.id === employee.id,
      );
      assert.equal(pendingEmployeeMedicalSummary.status, 'incomplete');
      const compliantMedicalSummary = medicalReadiness.find(
        (row: { employee: { id: string } }) =>
          row.employee.id === compliantEmployee.id,
      );
      assert.equal(compliantMedicalSummary.status, 'expiring');
      assert.equal(compliantMedicalSummary.domainEligible, true);
      assert.equal(compliantMedicalSummary.eligible, true);
      assert.equal(
        compliantMedicalSummary.eligible,
        compliantMedicalSummary.combinedAccess.eligible,
      );
      assert.equal(
        JSON.stringify(medicalReadiness).includes(noSiteMedical.id),
        false,
      );

      const compliantEmployeeDetail = await request(
        'GET',
        `/api/v1/admin/employees/${compliantEmployee.id}`,
      );
      assert.equal(compliantEmployeeDetail.statusCode, 200);
      assert.equal(
        compliantEmployeeDetail.json().medicalCompletions[0].medical.id,
        medical.id,
      );
      assert.equal(
        compliantEmployeeDetail.json().medicalCompletions[0].comment,
        'Medical certificate verified.',
      );

      const employeeWithPendingMedical = await request(
        'GET',
        `/api/v1/admin/employees/${employee.id}`,
      );
      assert.deepEqual(employeeWithPendingMedical.json().pendingCompletions, []);
      assert.deepEqual(
        employeeWithPendingMedical
          .json()
          .pendingMedicalCompletions.map((pending: { id: string }) => pending.id),
        [pendingMedical.id],
      );

      const siteDetailWithMedical = await request(
        'GET',
        `/api/v1/admin/sites/${site.id}`,
      );
      assert.equal(siteDetailWithMedical.statusCode, 200);
      assert.deepEqual(
        siteDetailWithMedical
          .json()
          .medicalRequirements.map(
            (requirement: { medicalId: string }) => requirement.medicalId,
          ),
        [medical.id],
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

      const selfMedicalReadinessResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me/medical-readiness?asOf=2026-06-05',
        headers: employeeHeaders,
      });
      assert.equal(selfMedicalReadinessResponse.statusCode, 200);
      const selfMedicalReadiness = selfMedicalReadinessResponse.json();
      assert.equal(
        selfMedicalReadiness.every(
          (summary: { employee: { id: string } }) =>
            summary.employee.id === employee.id,
        ),
        true,
      );
      assert.equal(
        JSON.stringify(selfMedicalReadiness).includes('comment'),
        false,
      );
      assert.equal(
        JSON.stringify(selfMedicalReadiness).includes('pendingCompletion'),
        false,
      );
      const employeeSiteMedicalsResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/sites/${site.id}/medicals`,
        headers: employeeHeaders,
      });
      assert.equal(employeeSiteMedicalsResponse.statusCode, 200);
      assert.equal(
        JSON.stringify(employeeSiteMedicalsResponse.json()).includes('comment'),
        false,
      );

      for (const url of [
        '/api/v1/employees',
        `/api/v1/sites/${site.id}/readiness`,
        `/api/v1/sites/${site.id}/medical-readiness`,
        '/api/v1/completions',
        '/api/v1/admin/employees',
        '/api/v1/admin/medicals',
        '/api/v1/admin/medical-completions',
        '/api/v1/admin/pending-completions',
        '/api/v1/admin/medical-pending-completions',
      ]) {
        const response = await app.inject({
          method: 'GET',
          url,
          headers: employeeHeaders,
        });
        assert.equal(response.statusCode, 403);
      }

      const cancelledPendingMedicalResponse = await request(
        'POST',
        `/api/v1/admin/medical-pending-completions/${pendingMedical.id}/cancel`,
        { reason: 'The medical was assigned to the wrong employee.' },
      );
      assert.equal(cancelledPendingMedicalResponse.statusCode, 200);
      assert.equal(cancelledPendingMedicalResponse.json().status, 'cancelled');
      assert.equal(cancelledPendingMedicalResponse.json().completionId, null);
      const resolvedMedicalPendingList = await request(
        'GET',
        `/api/v1/admin/medical-pending-completions?employeeId=${employee.id}&includeResolved=true`,
      );
      assert.equal(resolvedMedicalPendingList.statusCode, 200);
      assert.equal(resolvedMedicalPendingList.json().total, 1);
      assert.equal(resolvedMedicalPendingList.json().items[0].status, 'cancelled');

      const correctionSiteResponse = await request('POST', '/api/v1/admin/sites', {
        name: 'Manual Expiry Readiness Site',
        timeZone: 'America/St_Johns',
      });
      assert.equal(correctionSiteResponse.statusCode, 201);
      const correctionSite = correctionSiteResponse.json();
      const correctionCourseResponse = await request(
        'POST',
        '/api/v1/admin/courses',
        {
          name: 'Manual Expiry Readiness Course',
          validityMonths: 1,
          siteIds: [correctionSite.id],
        },
      );
      assert.equal(correctionCourseResponse.statusCode, 201);
      const correctionCourse = correctionCourseResponse.json();
      const correctionEmployee = await prisma.employee.create({
        data: {
          displayName: 'Manual Expiry Employee',
          email: 'manual.expiry.employee@example.com',
          cognitoSubject: '20000000-0000-4000-8000-000000000205',
        },
      });
      const automaticExpiryCompletionResponse = await request(
        'POST',
        '/api/v1/admin/completions',
        {
          employeeId: correctionEmployee.id,
          courseId: correctionCourse.id,
          completedOn: '2026-01-01',
          comment: 'Manual expiry readiness proof.',
        },
      );
      assert.equal(automaticExpiryCompletionResponse.statusCode, 201);
      assert.equal(automaticExpiryCompletionResponse.json().expiresOn, '2026-02-01');

      const manualExpiryCompletionResponse = await request(
        'POST',
        `/api/v1/admin/completions/${automaticExpiryCompletionResponse.json().id}/correct-dates`,
        {
          completedOn: '2026-01-01',
          expiresOn: '2026-12-31',
          reason: 'Certificate specifies a later expiry date.',
        },
      );
      assert.equal(manualExpiryCompletionResponse.statusCode, 200);
      const manualExpiryCompletion = manualExpiryCompletionResponse.json();
      assert.equal(manualExpiryCompletion.expiryManuallySet, true);

      const correctionSiteReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${correctionSite.id}/readiness?asOf=2026-06-05`,
      );
      assert.equal(correctionSiteReadinessResponse.statusCode, 200);
      const correctionSiteEmployeeReadiness = correctionSiteReadinessResponse
        .json()
        .find(
          (summary: { employee: { id: string } }) =>
            summary.employee.id === correctionEmployee.id,
        );
      assert.equal(correctionSiteEmployeeReadiness.status, 'compliant');
      assert.equal(
        correctionSiteEmployeeReadiness.courses[0].completion.id,
        manualExpiryCompletion.id,
      );
      assert.equal(
        correctionSiteEmployeeReadiness.courses[0].completion.expiresOn,
        '2026-12-31',
      );

      const correctionEmployeeReadinessResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/me/readiness?asOf=2026-06-05',
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': correctionEmployee.cognitoSubject,
        },
      });
      assert.equal(correctionEmployeeReadinessResponse.statusCode, 200);
      const selfCorrectionSiteReadiness = correctionEmployeeReadinessResponse
        .json()
        .find(
          (summary: { site: { id: string } }) =>
            summary.site.id === correctionSite.id,
        );
      assert.equal(selfCorrectionSiteReadiness.status, 'compliant');
      assert.equal(
        selfCorrectionSiteReadiness.courses[0].completion.id,
        manualExpiryCompletion.id,
      );
      assert.equal(
        selfCorrectionSiteReadiness.courses.some(
          (requirement: { completion: { id: string } | null }) =>
            requirement.completion?.id === automaticExpiryCompletionResponse.json().id,
        ),
        false,
      );
      await request(
        'POST',
        `/api/v1/admin/employees/${correctionEmployee.id}/archive`,
      );

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
      const unlinkedMedicalCatalogueResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/sites/${site.id}/medicals`,
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': '20000000-0000-4000-8000-000000000103',
        },
      });
      assert.equal(unlinkedMedicalCatalogueResponse.statusCode, 403);
      assert.equal(
        unlinkedMedicalCatalogueResponse.json().code,
        'EMPLOYEE_ACCOUNT_NOT_LINKED',
      );

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
      const inactiveMedicalCatalogueResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/sites/${site.id}/medicals`,
        headers: {
          'x-demo-user-role': 'employee',
          'x-demo-user-subject': accountEmployeeSubject,
        },
      });
      assert.equal(inactiveMedicalCatalogueResponse.statusCode, 403);
      assert.equal(
        inactiveMedicalCatalogueResponse.json().code,
        'EMPLOYEE_ACCOUNT_INACTIVE',
      );

      await request('POST', `/api/v1/admin/sites/${site.id}/archive`);
      const retainArchivedMedicalAssignmentResponse = await request(
        'PATCH',
        `/api/v1/admin/medicals/${medical.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 1,
          siteIds: [site.id, secondSite.id],
        },
      );
      assert.equal(retainArchivedMedicalAssignmentResponse.statusCode, 200);
      assert.deepEqual(
        retainArchivedMedicalAssignmentResponse
          .json()
          .requirements.map(
            (requirement: { siteId: string }) => requirement.siteId,
          )
          .sort(),
        [site.id, secondSite.id].sort(),
      );
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
      const removeArchivedMedicalAssignmentResponse = await request(
        'PATCH',
        `/api/v1/admin/medicals/${medical.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 1,
          siteIds: [site.id],
        },
      );
      assert.equal(removeArchivedMedicalAssignmentResponse.statusCode, 200);
      assert.deepEqual(
        removeArchivedMedicalAssignmentResponse
          .json()
          .requirements.map(
            (requirement: { siteId: string }) => requirement.siteId,
          ),
        [site.id],
      );
      const archivedNewMedicalSelectionResponse = await request(
        'PATCH',
        `/api/v1/admin/medicals/${medical.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 1,
          siteIds: [site.id, secondSite.id],
        },
      );
      assert.equal(archivedNewMedicalSelectionResponse.statusCode, 400);
      assert.equal(
        archivedNewMedicalSelectionResponse.json().code,
        'ARCHIVED_MEDICAL_SITE_SELECTION',
      );
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

      const newlyArchivedMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medicals',
        {
          name: 'Archived Site Medical Rejection',
          validityMonths: 12,
          siteIds: [secondSite.id],
        },
      );
      assert.equal(newlyArchivedMedicalResponse.statusCode, 400);
      assert.equal(
        newlyArchivedMedicalResponse.json().code,
        'ARCHIVED_MEDICAL_SITE_SELECTION',
      );

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

      const employeeDetailAfterCourseArchive = await request(
        'GET',
        `/api/v1/admin/employees/${employee.id}`,
      );
      assert.equal(employeeDetailAfterCourseArchive.statusCode, 200);
      assert.equal(
        employeeDetailAfterCourseArchive
          .json()
          .completions.some(
            (completion: { course: { id: string } }) =>
              completion.course.id === course.id,
          ),
        true,
      );

      const employeeListAfterCourseArchive = await request(
        'GET',
        '/api/v1/admin/employees?search=Overdue%20Employee',
      );
      assert.equal(employeeListAfterCourseArchive.statusCode, 200);
      assert.equal(
        employeeListAfterCourseArchive.json().items[0].latestCompletionOn,
        null,
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
            (row: {
              status: string;
              eligible: boolean;
              domainEligible: boolean;
              combinedAccess: { eligible: boolean };
            }) =>
              row.status === 'noRequirements' &&
              row.domainEligible === false &&
              row.eligible === row.combinedAccess.eligible,
          ),
      );
      const compliantSuspendedTrainingSummary = suspendedReadinessResponse
        .json()
        .find(
          (row: { employee: { id: string } }) =>
            row.employee.id === compliantEmployee.id,
      );
      assert.equal(compliantSuspendedTrainingSummary.eligible, true);
      assert.equal(
        compliantSuspendedTrainingSummary.combinedAccess.status,
        'expiring',
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

      const archiveMedicalResponse = await request(
        'POST',
        `/api/v1/admin/medicals/${medical.id}/archive`,
      );
      assert.equal(archiveMedicalResponse.statusCode, 200);

      const archivedMedicalDetail = await request(
        'GET',
        `/api/v1/admin/medicals/${medical.id}`,
      );
      assert.equal(archivedMedicalDetail.statusCode, 200);
      assert.deepEqual(
        archivedMedicalDetail
          .json()
          .requirements.map(
            (requirement: { siteId: string }) => requirement.siteId,
          ),
        [site.id],
      );
      assert.equal(
        archivedMedicalDetail
          .json()
          .completions.some(
            (completion: { id: string }) =>
              completion.id === medicalCompletionResponse.json().id,
          ),
        true,
      );

      const employeeDetailAfterMedicalArchive = await request(
        'GET',
        `/api/v1/admin/employees/${compliantEmployee.id}`,
      );
      assert.equal(employeeDetailAfterMedicalArchive.statusCode, 200);
      assert.equal(
        employeeDetailAfterMedicalArchive
          .json()
          .medicalCompletions.some(
            (completion: { medical: { id: string } }) =>
              completion.medical.id === medical.id,
          ),
        true,
      );

      const employeeListAfterMedicalArchive = await request(
        'GET',
        '/api/v1/admin/employees?search=Compliant%20Employee',
      );
      assert.equal(employeeListAfterMedicalArchive.statusCode, 200);
      assert.equal(
        employeeListAfterMedicalArchive.json().items[0].latestMedicalCompletionOn,
        null,
      );

      const siteListAfterMedicalArchive = await request(
        'GET',
        '/api/v1/admin/sites?search=Constraint%20Site',
      );
      assert.equal(siteListAfterMedicalArchive.statusCode, 200);
      assert.equal(
        siteListAfterMedicalArchive.json().items[0]._count.medicalRequirements,
        0,
      );
      const siteDetailAfterMedicalArchive = await request(
        'GET',
        `/api/v1/admin/sites/${site.id}`,
      );
      assert.equal(siteDetailAfterMedicalArchive.statusCode, 200);
      assert.deepEqual(siteDetailAfterMedicalArchive.json().medicalRequirements, []);

      const medicalOptionsAfterArchive = await request(
        'GET',
        '/api/v1/admin/medical-options',
      );
      assert.equal(medicalOptionsAfterArchive.statusCode, 200);
      assert.equal(
        medicalOptionsAfterArchive
          .json()
          .some((option: { id: string }) => option.id === medical.id),
        false,
      );

      const completionForArchivedMedicalResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: compliantEmployee.id,
          medicalId: medical.id,
          completedOn: '2026-06-01',
        },
      );
      assert.equal(completionForArchivedMedicalResponse.statusCode, 404);
      assert.equal(
        completionForArchivedMedicalResponse.json().code,
        'MEDICAL_NOT_FOUND',
      );

      const suspendedMedicalReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/medical-readiness?asOf=2026-06-05`,
      );
      assert.equal(suspendedMedicalReadinessResponse.statusCode, 200);
      assert.ok(
        suspendedMedicalReadinessResponse
          .json()
          .every(
            (row: {
              status: string;
              eligible: boolean;
              domainEligible: boolean;
              combinedAccess: { eligible: boolean };
            }) =>
              row.status === 'noRequirements' &&
              row.domainEligible === false &&
              row.eligible === row.combinedAccess.eligible,
          ),
      );
      const expiringSuspendedMedicalSummary = suspendedMedicalReadinessResponse
        .json()
        .find(
          (row: { employee: { id: string } }) =>
            row.employee.id === expiringEmployee.id,
        );
      assert.equal(expiringSuspendedMedicalSummary.eligible, true);
      assert.deepEqual(
        expiringSuspendedMedicalSummary.combinedAccess.blockingDomains,
        [],
      );

      const restoreMedicalResponse = await request(
        'POST',
        `/api/v1/admin/medicals/${medical.id}/restore`,
      );
      assert.equal(restoreMedicalResponse.statusCode, 200);
      const medicalOptionsAfterRestore = await request(
        'GET',
        '/api/v1/admin/medical-options',
      );
      assert.equal(medicalOptionsAfterRestore.statusCode, 200);
      assert.equal(
        medicalOptionsAfterRestore
          .json()
          .some((option: { id: string }) => option.id === medical.id),
        true,
      );
      const siteDetailAfterMedicalRestore = await request(
        'GET',
        `/api/v1/admin/sites/${site.id}`,
      );
      assert.equal(siteDetailAfterMedicalRestore.statusCode, 200);
      assert.deepEqual(
        siteDetailAfterMedicalRestore
          .json()
          .medicalRequirements.map(
            (requirement: { medicalId: string }) => requirement.medicalId,
          ),
        [medical.id],
      );
      const restoredMedicalReadinessResponse = await request(
        'GET',
        `/api/v1/sites/${site.id}/medical-readiness?asOf=2026-06-05`,
      );
      assert.equal(restoredMedicalReadinessResponse.statusCode, 200);
      const expiringRestoredMedicalSummary = restoredMedicalReadinessResponse
        .json()
        .find(
          (row: { employee: { id: string } }) =>
            row.employee.id === expiringEmployee.id,
        );
      assert.equal(expiringRestoredMedicalSummary.status, 'incomplete');
      assert.equal(expiringRestoredMedicalSummary.domainEligible, false);
      assert.equal(expiringRestoredMedicalSummary.eligible, false);
      assert.deepEqual(
        expiringRestoredMedicalSummary.combinedAccess.blockingDomains,
        ['medical'],
      );

      const updateMedicalValidityResponse = await request(
        'PATCH',
        `/api/v1/admin/medicals/${medical.id}`,
        {
          name: 'Calendar Month Safety',
          validityMonths: 2,
          siteIds: [site.id],
        },
      );
      assert.equal(updateMedicalValidityResponse.statusCode, 200);
      const medicalRenewalResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: compliantEmployee.id,
          medicalId: medical.id,
          completedOn: '2026-06-01',
          comment: 'Renewal after validity update.',
        },
      );
      assert.equal(medicalRenewalResponse.statusCode, 201);
      assert.equal(medicalRenewalResponse.json().expiresOn, '2026-08-01');
      assert.equal(medicalRenewalResponse.json().validityMonthsApplied, 2);

      const duplicateMedicalCorrectionResponse = await request(
        'POST',
        `/api/v1/admin/medical-completions/${medicalCompletionResponse.json().id}/correct-dates`,
        {
          completedOn: '2026-06-01',
          expiresOn: '2027-06-01',
          reason: 'Duplicate medical corrected date rollback test.',
        },
      );
      assert.equal(duplicateMedicalCorrectionResponse.statusCode, 409);
      assert.equal(
        duplicateMedicalCorrectionResponse.json().code,
        'MEDICAL_COMPLETION_EXISTS',
      );
      const originalMedicalCompletion = await prisma.medicalCompletion.findUnique({
        where: { id: medicalCompletionResponse.json().id },
      });
      assert.equal(
        originalMedicalCompletion?.expiresOn.toISOString().slice(0, 10),
        '2026-06-30',
      );
      assert.equal(originalMedicalCompletion?.validityMonthsApplied, 1);
      assert.equal(originalMedicalCompletion?.voidedAt, null);

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

      const voidMedicalResponse = await request(
        'POST',
        `/api/v1/admin/medical-completions/${medicalCompletionResponse.json().id}/void`,
        { reason: 'Incorrect medical date' },
      );
      assert.equal(voidMedicalResponse.statusCode, 200);
      assert.equal(
        voidMedicalResponse.json().voidReason,
        'Incorrect medical date',
      );

      const secondVoidResponse = await request(
        'POST',
        `/api/v1/admin/completions/${completionResponse.json().id}/void`,
        { reason: 'A second void attempt' },
      );
      assert.equal(secondVoidResponse.statusCode, 409);
      assert.equal(secondVoidResponse.json().code, 'COMPLETION_ALREADY_VOIDED');
      const secondMedicalVoidResponse = await request(
        'POST',
        `/api/v1/admin/medical-completions/${medicalCompletionResponse.json().id}/void`,
        { reason: 'A second medical void attempt' },
      );
      assert.equal(secondMedicalVoidResponse.statusCode, 409);
      assert.equal(
        secondMedicalVoidResponse.json().code,
        'MEDICAL_COMPLETION_ALREADY_VOIDED',
      );

      await assert.rejects(
        prisma.courseCompletion.update({
          where: { id: completionResponse.json().id },
          data: { voidReason: 'Rewritten void reason' },
        }),
        /Voided completion history is immutable/,
      );
      await assert.rejects(
        prisma.medicalCompletion.update({
          where: { id: medicalCompletionResponse.json().id },
          data: { voidedAt: null, voidedBySubject: null, voidReason: null },
        }),
        /Voided completion history is immutable/,
      );
      const replacementMedicalCompletionResponse = await request(
        'POST',
        '/api/v1/admin/medical-completions',
        {
          employeeId: compliantEmployee.id,
          medicalId: medical.id,
          completedOn: '2026-05-31',
        },
      );
      assert.equal(replacementMedicalCompletionResponse.statusCode, 201);

      await prisma.employee.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          displayName: `Option Employee ${String(index).padStart(3, '0')}`,
          email: `option.employee.${index}@example.com`,
          cognitoSubject: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        })),
      });
      await prisma.course.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          name: `Option Course ${String(index).padStart(3, '0')}`,
          validityMonths: 12,
        })),
      });
      await prisma.medical.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          name: `Option Medical ${String(index).padStart(3, '0')}`,
          validityMonths: 12,
        })),
      });
      const employeeOptionsResponse = await request(
        'GET',
        '/api/v1/admin/employee-options',
      );
      const courseOptionsResponse = await request(
        'GET',
        '/api/v1/admin/course-options',
      );
      const medicalOptionsResponse = await request(
        'GET',
        '/api/v1/admin/medical-options',
      );
      assert.equal(employeeOptionsResponse.statusCode, 200);
      assert.equal(courseOptionsResponse.statusCode, 200);
      assert.equal(medicalOptionsResponse.statusCode, 200);
      assert.equal(
        employeeOptionsResponse
          .json()
          .some(
            (option: { displayName: string }) =>
              option.displayName === 'Option Employee 100',
          ),
        true,
      );
      assert.equal(
        courseOptionsResponse
          .json()
          .some(
            (option: { name: string }) => option.name === 'Option Course 100',
          ),
        true,
      );
      assert.equal(
        medicalOptionsResponse
          .json()
          .some(
            (option: { name: string }) => option.name === 'Option Medical 100',
          ),
        true,
      );
    } finally {
      await app.close();
      await disconnectDatabase();
    }
  },
);
