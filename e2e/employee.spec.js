import { expect, test } from '@playwright/test';

const employeeSubject = '20000000-0000-4000-8000-000000000001';
const adminHeaders = {
  'x-demo-user-role': 'admin',
  'x-demo-user-subject': 'playwright-admin',
};

async function create(request, path, data) {
  const response = await request.post(`/api/v1/admin${path}`, {
    headers: adminHeaders,
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('employee sees only their own training and medical readiness', async ({
  page,
  request,
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const employeeResponse = await request.get('/api/v1/admin/employees', {
    headers: adminHeaders,
    params: { search: 'Maya Chen' },
  });
  expect(employeeResponse.ok()).toBeTruthy();
  const employee = (await employeeResponse.json()).items[0];
  await create(request, '/employees', {
    displayName: `Other Employee ${suffix}`,
    email: `other.employee.${suffix}@example.com`,
  });
  const site = await create(request, '/sites', {
    name: `Employee Site ${suffix}`,
    timeZone: 'America/St_Johns',
  });
  const course = await create(request, '/courses', {
    name: `Employee Course ${suffix}`,
    validityMonths: 12,
    siteIds: [site.id],
  });
  await create(request, '/completions', {
    employeeId: employee.id,
    courseId: course.id,
    completedOn: '2026-01-31',
  });
  const medical = await create(request, '/medicals', {
    name: `Employee Medical ${suffix}`,
    validityMonths: 12,
    siteIds: [site.id],
  });
  await create(request, '/medical-completions', {
    employeeId: employee.id,
    medicalId: medical.id,
    completedOn: '2026-01-31',
    comment: 'Private administrator comment',
  });
  await page.goto('/training');

  await expect(page.getByRole('heading', { name: 'My training readiness' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Employee' })).toHaveCount(0);
  await expect(
    page.locator('tbody').getByText(employee.displayName, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(`Other Employee ${suffix}`, { exact: true })).toHaveCount(0);

  await page.locator('tbody tr').filter({ hasText: site.name }).click();
  await expect(
    page.getByText(`${employee.displayName} at ${site.name}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(course.name, { exact: true })).toBeVisible();

  await page.goto('/medical');
  await expect(page.getByRole('heading', { name: 'My medical readiness' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Employee' })).toHaveCount(0);
  await page.locator('tbody tr').filter({ hasText: site.name }).click();
  await expect(page.getByText(medical.name, { exact: true })).toBeVisible();
  await expect(page.getByText(`Other Employee ${suffix}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Private administrator comment')).toHaveCount(0);

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/training$/);

  for (const path of [
    '/api/v1/employees',
    `/api/v1/sites/${site.id}/readiness`,
    `/api/v1/sites/${site.id}/medical-readiness`,
    '/api/v1/completions',
    '/api/v1/admin/employees',
    '/api/v1/admin/medicals',
    '/api/v1/admin/medical-completions',
  ]) {
    const response = await request.get(path, {
      headers: {
        'x-demo-user-role': 'employee',
        'x-demo-user-subject': employeeSubject,
      },
    });
    expect(response.status()).toBe(403);
  }
});
