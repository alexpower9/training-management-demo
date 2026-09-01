import { expect, test } from '@playwright/test';

const adminHeaders = {
  'x-demo-user-role': 'admin',
  'x-demo-user-subject': 'playwright-admin',
};

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function create(request, path, data) {
  const response = await request.post(`/api/v1/admin${path}`, {
    headers: adminHeaders,
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe.serial('training management smoke tests', () => {
  test('employee CRUD and archive workflow', async ({ page }) => {
    const employeeName = unique('Playwright Employee');
    const employeeEmail = `${unique('playwright-employee')}@example.com`;
    await page.goto('/manage/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    await page.getByLabel('Name').fill(employeeName);
    await page.getByLabel('Email').fill(employeeEmail);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Employee added and invitation sent.')).toBeVisible();
    await expect(page.getByText(employeeEmail, { exact: true }).first()).toBeVisible();
    const employeeRow = page.locator('tbody tr').filter({ hasText: employeeName });
    await expect(employeeRow.getByText('Invitation pending')).toBeVisible();
    await employeeRow.click();
    await page.getByRole('button', { name: 'Resend invitation' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Resend invitation' })
      .click();
    await expect(page.getByText('Employee invitation resent.')).toBeVisible();
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Employee archived.')).toBeVisible();
  });

  test('course creation owns site selection and archive preserves it', async ({ page, request }) => {
    const site = await create(request, '/sites', {
      name: unique('Site'),
      timeZone: 'America/St_Johns',
    });
    const courseName = unique('Requirement Course');

    await page.goto('/manage/courses');
    await page.getByRole('button', { name: 'Add course' }).click();
    await page.getByLabel('Course name').fill(courseName);
    await page.getByLabel(site.name).check();
    await page.getByLabel('Validity in months').fill('12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Course added.')).toBeVisible();

    const coursesResponse = await request.get('/api/v1/admin/courses', {
      headers: adminHeaders,
      params: { search: courseName },
    });
    const course = (await coursesResponse.json()).items[0];
    expect(course.requirements.map((requirement) => requirement.siteId)).toContain(site.id);

    await page.goto('/training');
    await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption(site.id);
    await expect(
      page.getByRole('combobox', { name: 'Course', exact: true }),
    ).toContainText(courseName);

    await page.goto(`/manage/courses?id=${course.id}`);
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Course archived.')).toBeVisible();
    await expect(page.getByText(site.name, { exact: true })).toBeVisible();

    await page.goto(`/manage/sites/${site.id}`);
    await expect(page.getByText('No required courses', { exact: true })).toBeVisible();
    await expect(page.getByText(courseName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign course' })).toHaveCount(0);
  });

  test('no-site course can be completed without becoming a site requirement', async ({
    page,
    request,
  }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('General Course Employee'),
      email: `${unique('general-course-employee')}@example.com`,
    });
    const site = await create(request, '/sites', {
      name: unique('General Course Site'),
      timeZone: 'America/St_Johns',
    });
    const courseName = unique('General Course');

    await page.goto('/manage/courses');
    await page.getByRole('button', { name: 'Add course' }).click();
    await page.getByLabel('Course name').fill(courseName);
    await page.getByLabel('No Site Requirement').check();
    await page.getByLabel('Validity in months').fill('12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Course added.')).toBeVisible();
    await expect(
      page
        .locator('tbody tr')
        .filter({ hasText: courseName })
        .getByText('Does not affect readiness'),
    ).toBeVisible();

    const coursesResponse = await request.get('/api/v1/admin/courses', {
      headers: adminHeaders,
      params: { search: courseName },
    });
    const course = (await coursesResponse.json()).items[0];
    expect(course.requirements).toHaveLength(0);

    await page.goto(`/manage/completions?action=create&employeeId=${employee.id}`);
    await page.locator('.form-drawer select').nth(1).selectOption(course.id);
    await page.getByLabel('Completed on').fill('2026-02-15');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Completion recorded.')).toBeVisible();

    const siteCoursesResponse = await request.get(`/api/v1/sites/${site.id}/courses`, {
      headers: adminHeaders,
    });
    expect(
      (await siteCoursesResponse.json()).some((siteCourse) => siteCourse.id === course.id),
    ).toBe(false);
  });

  test('completion entry, renewal setup, and voiding', async ({ page, request }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Completion Employee'),
      email: `${unique('completion-employee')}@example.com`,
    });
    const site = await create(request, '/sites', {
      name: unique('Completion Site'),
      timeZone: 'America/St_Johns',
    });
    const course = await create(request, '/courses', {
      name: unique('Completion Course'),
      validityMonths: 1,
      siteIds: [site.id],
    });

    await page.goto(`/manage/completions?action=create&employeeId=${employee.id}`);
    const courseDrawer = page.getByRole('dialog', {
      name: 'Record course completion',
    });
    await courseDrawer.locator('select').nth(1).selectOption(course.id);
    await courseDrawer.getByLabel('Completed on').fill('2026-01-31');
    await courseDrawer
      .getByLabel('Comment')
      .fill('Certificate verified during smoke test');
    await expect(page.getByText('Expires Feb 28, 2026')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Completion recorded.')).toBeVisible();
    await expect(page.getByText('Certificate verified during smoke test')).toBeVisible();

    const originalResponse = await request.get('/api/v1/admin/completions', {
      headers: adminHeaders,
      params: { employeeId: employee.id, courseId: course.id },
    });
    expect(originalResponse.ok()).toBeTruthy();
    const original = (await originalResponse.json()).items[0];

    await page.locator('tbody').getByText(employee.displayName, { exact: true }).click();
    await page.getByRole('button', { name: 'Renew' }).click();
    await expect(page.locator('.form-drawer select').first()).toHaveValue(employee.id);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Edit dates' }).click();
    const correctionDrawer = page.getByRole('dialog', {
      name: 'Edit course completion dates',
    });
    await expect(correctionDrawer.getByLabel('Completed on')).toHaveValue('2026-01-31');
    await expect(correctionDrawer.getByLabel('Expires on')).toHaveValue('2026-02-28');
    await correctionDrawer.getByLabel('Completed on').fill('2026-02-01');
    await correctionDrawer.getByLabel('Expires on').fill('2026-03-15');
    await correctionDrawer
      .getByLabel('Correction reason')
      .fill('Corrected against the signed course certificate.');
    await correctionDrawer.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByText('Completion dates corrected. The original remains in voided history.'),
    ).toBeVisible();
    await expect(page.getByText('Feb 1, 2026', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Mar 15, 2026', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Corrected dates · expiry manually set')).toBeVisible();

    const correctedResponse = await request.get('/api/v1/admin/completions', {
      headers: adminHeaders,
      params: {
        employeeId: employee.id,
        courseId: course.id,
        includeVoided: 'true',
      },
    });
    expect(correctedResponse.ok()).toBeTruthy();
    const correctedItems = (await correctedResponse.json()).items;
    const corrected = correctedItems.find((completion) => !completion.voidedAt);
    const voidedOriginal = correctedItems.find((completion) => completion.id === original.id);
    expect(corrected.correctsCompletionId).toBe(original.id);
    expect(corrected.expiryManuallySet).toBe(true);
    expect(corrected.completedOn).toBe('2026-02-01');
    expect(corrected.expiresOn).toBe('2026-03-15');
    expect(voidedOriginal.voidReason).toBe(
      'Corrected against the signed course certificate.',
    );

    await page.getByRole('button', { name: 'Void', exact: true }).click();
    await page.getByLabel('Reason').fill('Incorrect date entered during smoke test');
    await page.getByRole('button', { name: 'Void completion' }).click();
    await expect(page.getByText('Completion voided.')).toBeVisible();
  });

  test('pending training date can be finalized after its employee and course are archived', async ({
    page,
    request,
  }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Pending Training Employee'),
      email: `${unique('pending-training-employee')}@example.com`,
    });
    const course = await create(request, '/courses', {
      name: unique('Pending Training Course'),
      validityMonths: 1,
      siteIds: [],
    });

    await page.goto(
      `/manage/completions?view=history&action=create&employeeId=${employee.id}`,
    );
    const entryDrawer = page.getByRole('dialog', {
      name: 'Record course completion',
    });
    await entryDrawer.locator('select').nth(1).selectOption(course.id);
    await expect(entryDrawer.getByLabel('Completed on (optional)')).toHaveValue('');
    await entryDrawer
      .getByLabel('Comment')
      .fill('Technician will confirm the certificate date.');
    await entryDrawer.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText(
        'Pending date saved. It will not affect readiness until finalized.',
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/view=pending/);
    await expect(page.getByText('Pending date', { exact: true }).first()).toBeVisible();

    const archiveEmployee = await request.post(
      `/api/v1/admin/employees/${employee.id}/archive`,
      { headers: adminHeaders },
    );
    expect(archiveEmployee.ok()).toBeTruthy();
    const archiveCourse = await request.post(
      `/api/v1/admin/courses/${course.id}/archive`,
      { headers: adminHeaders },
    );
    expect(archiveCourse.ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Add completion date' }).click();
    const finalizeDrawer = page.getByRole('dialog', {
      name: 'Add completion date',
    });
    await finalizeDrawer.getByLabel('Completed on').fill('2026-01-31');
    await expect(finalizeDrawer.getByText('Expires Feb 28, 2026')).toBeVisible();
    await finalizeDrawer.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText('Completion date added. The completion now counts toward readiness.'),
    ).toBeVisible();
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'View completion' }).click();
    await expect(page).toHaveURL(/view=history/);
    await expect(page.getByText('Jan 31, 2026', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Feb 28, 2026', { exact: true }).first()).toBeVisible();
  });

  test('medical renewal can remain pending beside current history and retain cancellation', async ({
    page,
    request,
  }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Pending Medical Employee'),
      email: `${unique('pending-medical-employee')}@example.com`,
    });
    const medical = await create(request, '/medicals', {
      name: unique('Pending Medical'),
      validityMonths: 12,
      siteIds: [],
    });
    const current = await create(request, '/medical-completions', {
      employeeId: employee.id,
      medicalId: medical.id,
      completedOn: '2026-06-01',
    });

    await page.goto(
      `/manage/completions?type=medical&view=history&id=${current.id}`,
    );
    await page.getByRole('button', { name: 'Renew' }).click();
    const renewalDrawer = page.getByRole('dialog', {
      name: 'Record medical completion',
    });
    await expect(renewalDrawer.locator('select').first()).toHaveValue(employee.id);
    await expect(renewalDrawer.locator('select').nth(1)).toHaveValue(medical.id);
    await expect(renewalDrawer.getByLabel('Completed on (optional)')).toHaveValue('');
    await renewalDrawer.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText(
        'Pending date saved. It will not affect readiness until finalized.',
      ),
    ).toBeVisible();
    const pendingResponse = await request.get(
      '/api/v1/admin/medical-pending-completions',
      {
        headers: adminHeaders,
        params: { employeeId: employee.id, medicalId: medical.id },
      },
    );
    expect(pendingResponse.ok()).toBeTruthy();
    const pending = (await pendingResponse.json()).items[0];
    expect(pending.status).toBe('pending');

    const currentResponse = await request.get(
      `/api/v1/admin/medical-completions/${current.id}`,
      { headers: adminHeaders },
    );
    expect(currentResponse.ok()).toBeTruthy();
    expect((await currentResponse.json()).voidedAt).toBeNull();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const cancelDialog = page.getByRole('dialog', {
      name: 'Cancel pending date?',
    });
    await cancelDialog
      .getByLabel('Reason')
      .fill('The renewal request was entered for the wrong technician.');
    await cancelDialog.getByRole('button', { name: 'Cancel pending date' }).click();
    await expect(page.getByText('Pending date cancelled.')).toBeVisible();

    await page.goto(
      `/manage/completions?type=medical&view=pending&resolved=true&id=${pending.id}`,
    );
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('The renewal request was entered for the wrong technician.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add completion date' }),
    ).toHaveCount(0);
  });

  test('medical requirement controls combined site access and supports completion voiding', async ({
    page,
    request,
  }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Medical Employee'),
      email: `${unique('medical-employee')}@example.com`,
    });
    const site = await create(request, '/sites', {
      name: unique('Medical Site'),
      timeZone: 'America/St_Johns',
    });
    const course = await create(request, '/courses', {
      name: unique('Medical Access Course'),
      validityMonths: 12,
      siteIds: [site.id],
    });
    await create(request, '/completions', {
      employeeId: employee.id,
      courseId: course.id,
      completedOn: '2026-06-01',
    });

    const medicalName = unique('Fitness to Work');
    await page.goto('/manage/medicals');
    await page.getByRole('button', { name: 'Add medical' }).click();
    await page.getByLabel('Medical name').fill(medicalName);
    await page.getByLabel(site.name).check();
    await page.getByLabel('Validity in months').fill('12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Medical added.')).toBeVisible();

    const medicalResponse = await request.get('/api/v1/admin/medicals', {
      headers: adminHeaders,
      params: { search: medicalName },
    });
    const medical = (await medicalResponse.json()).items[0];
    let readinessResponse = await request.get(
      `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      { headers: adminHeaders },
    );
    let summary = (await readinessResponse.json()).find(
      (row) => row.employee.id === employee.id,
    );
    expect(summary.status).toBe('compliant');
    expect(summary.domainEligible).toBe(true);
    expect(summary.eligible).toBe(false);
    expect(summary.combinedAccess.eligible).toBe(false);
    expect(summary.combinedAccess.blockingDomains).toEqual(['medical']);

    const missingMedicalReadinessResponse = await request.get(
      `/api/v1/sites/${site.id}/medical-readiness?asOf=2026-06-05`,
      { headers: adminHeaders },
    );
    const missingMedicalSummary = (await missingMedicalReadinessResponse.json()).find(
      (row) => row.employee.id === employee.id,
    );
    expect(missingMedicalSummary.status).toBe('incomplete');
    expect(missingMedicalSummary.domainEligible).toBe(false);
    expect(missingMedicalSummary.eligible).toBe(false);

    await page.goto(`/manage/completions?type=medical&action=create&employeeId=${employee.id}`);
    const medicalDrawer = page.getByRole('dialog', {
      name: 'Record medical completion',
    });
    await medicalDrawer.locator('select').nth(1).selectOption(medical.id);
    await medicalDrawer.getByLabel('Completed on').fill('2026-06-01');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Completion recorded.')).toBeVisible();

    readinessResponse = await request.get(
      `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      { headers: adminHeaders },
    );
    summary = (await readinessResponse.json()).find(
      (row) => row.employee.id === employee.id,
    );
    expect(summary.status).toBe('compliant');
    expect(summary.domainEligible).toBe(true);
    expect(summary.eligible).toBe(true);
    expect(summary.combinedAccess.eligible).toBe(true);

    await page.locator('tbody').getByText(employee.displayName, { exact: true }).click();
    await page.getByRole('button', { name: 'Edit dates' }).click();
    const correctionDrawer = page.getByRole('dialog', {
      name: 'Edit medical completion dates',
    });
    await expect(correctionDrawer.getByLabel('Completed on')).toHaveValue('2026-06-01');
    await correctionDrawer.getByLabel('Expires on').fill('2026-06-03');
    await correctionDrawer
      .getByLabel('Correction reason')
      .fill('Medical certificate expiry was entered incorrectly.');
    await correctionDrawer.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByText('Completion dates corrected. The original remains in voided history.'),
    ).toBeVisible();
    await expect(page.getByText('Corrected dates · expiry manually set')).toBeVisible();

    readinessResponse = await request.get(
      `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      { headers: adminHeaders },
    );
    summary = (await readinessResponse.json()).find(
      (row) => row.employee.id === employee.id,
    );
    expect(summary.status).toBe('compliant');
    expect(summary.domainEligible).toBe(true);
    expect(summary.eligible).toBe(false);
    expect(summary.combinedAccess.eligible).toBe(false);
    expect(summary.combinedAccess.blockingDomains).toEqual(['medical']);

    await page.getByRole('button', { name: 'Renew' }).click();
    await expect(page.locator('.form-drawer select').first()).toHaveValue(employee.id);
    await expect(page.locator('.form-drawer select').nth(1)).toHaveValue(medical.id);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.locator('tbody').getByText(employee.displayName, { exact: true }).click();
    await page.getByRole('button', { name: 'Void', exact: true }).click();
    await page.getByLabel('Reason').fill('Incorrect medical completion');
    await page.getByRole('button', { name: 'Void completion' }).click();
    await expect(page.getByText('Completion voided.')).toBeVisible();

    readinessResponse = await request.get(
      `/api/v1/sites/${site.id}/readiness?asOf=2026-06-05`,
      { headers: adminHeaders },
    );
    summary = (await readinessResponse.json()).find(
      (row) => row.employee.id === employee.id,
    );
    expect(summary.status).toBe('compliant');
    expect(summary.domainEligible).toBe(true);
    expect(summary.eligible).toBe(false);
    expect(summary.combinedAccess.eligible).toBe(false);
  });

  test('employee access is rejected for admin mutations', async ({ request }) => {
    const response = await request.post('/api/v1/admin/employees', {
      headers: {
        'x-demo-user-role': 'employee',
        'x-demo-user-subject': '20000000-0000-4000-8000-000000000099',
      },
      data: {
        displayName: 'Employee Cannot Create',
        email: 'cannot.create@example.com',
      },
    });

    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  test('manual employee account linking is no longer available', async ({ request }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Admin Cannot Link'),
      email: `${unique('admin-cannot-link')}@example.com`,
    });
    const response = await request.put(
      `/api/v1/admin/employees/${employee.id}/account`,
      {
        headers: adminHeaders,
        data: { subject: crypto.randomUUID() },
      },
    );

    expect(response.status()).toBe(404);
  });
});
