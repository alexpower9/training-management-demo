import { expect, test } from '@playwright/test';

const employeeSubject = '20000000-0000-4000-8000-000000000001';
const adminHeaders = {
  'x-demo-user-role': 'admin',
  'x-demo-user-subject': 'playwright-admin',
};
const ownerHeaders = {
  'x-demo-user-role': 'owner',
  'x-demo-user-subject': 'playwright-owner',
};

async function create(request, path, data) {
  const response = await request.post(`/api/v1/admin${path}`, {
    headers: adminHeaders,
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('employee sees and selects only their own training readiness', async ({
  page,
  request,
}) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const employee = await create(request, '/employees', {
    displayName: `Employee Self ${suffix}`,
  });
  await create(request, '/employees', {
    displayName: `Other Employee ${suffix}`,
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
  const linkResponse = await request.put(
    `/api/v1/admin/employees/${employee.id}/account`,
    {
      headers: ownerHeaders,
      data: { subject: employeeSubject },
    },
  );
  expect(linkResponse.ok()).toBeTruthy();

  await page.goto('/training');

  await expect(page.getByRole('heading', { name: 'My site readiness' })).toBeVisible();
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

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/training$/);

  for (const path of [
    '/api/v1/employees',
    `/api/v1/sites/${site.id}/readiness`,
    '/api/v1/completions',
    '/api/v1/admin/employees',
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
