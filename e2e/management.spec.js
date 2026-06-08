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
    await page.goto('/manage/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    await page.getByLabel('Name').fill(employeeName);
    await page.getByLabel('Job title').fill('Test Technician');
    await page.getByLabel('Crew').fill('Test Crew');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Employee added.')).toBeVisible();
    await page.locator('tbody').getByText(employeeName, { exact: true }).click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Employee archived.')).toBeVisible();
  });

  test('site requirement configuration and archive safeguard', async ({ page, request }) => {
    const customer = await create(request, '/customers', { name: unique('Customer') });
    const site = await create(request, '/sites', {
      customerId: customer.id,
      name: unique('Site'),
      region: 'Test Region',
      timeZone: 'America/St_Johns',
    });
    const course = await create(request, '/courses', {
      code: unique('PW').slice(0, 50),
      name: unique('Requirement Course'),
      defaultValidityMonths: 12,
    });

    await page.goto(`/manage/sites/${site.id}`);
    await page.getByRole('button', { name: 'Add requirement' }).click();
    await page.getByLabel('Course').selectOption(course.id);
    await page.getByLabel('Effective from').fill('2026-01-01');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Site requirement added.')).toBeVisible();

    await page.goto(`/manage/courses?id=${course.id}`);
    await page.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(
      page.getByText('End all open site requirements before archiving the course.'),
    ).toBeVisible();
  });

  test('completion entry, renewal setup, and voiding', async ({ page, request }) => {
    const employee = await create(request, '/employees', {
      displayName: unique('Completion Employee'),
      jobTitle: 'Technician',
    });
    const course = await create(request, '/courses', {
      code: unique('COMP').slice(0, 50),
      name: unique('Completion Course'),
      defaultValidityMonths: 1,
    });

    await page.goto(`/manage/completions?action=create&employeeId=${employee.id}`);
    await page.getByLabel('Course').selectOption(course.id);
    await page.getByLabel('Completed on').fill('2026-01-31');
    await expect(page.getByText('Expires Feb 28, 2026')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Completion recorded.')).toBeVisible();

    await page.locator('tbody').getByText(employee.displayName, { exact: true }).click();
    await page.getByRole('button', { name: 'Renew' }).click();
    await expect(page.getByLabel('Employee')).toHaveValue(employee.id);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Void' }).click();
    await page.getByLabel('Reason').fill('Incorrect date entered during smoke test');
    await page.getByRole('button', { name: 'Void completion' }).click();
    await expect(page.getByText('Completion voided.')).toBeVisible();
  });

  test('viewer access is rejected for admin mutations', async ({ request }) => {
    const response = await request.post('/api/v1/admin/employees', {
      headers: {
        'x-demo-user-role': 'viewer',
        'x-demo-user-subject': 'playwright-viewer',
      },
      data: {
        displayName: 'Viewer Cannot Create',
        jobTitle: 'Viewer',
      },
    });

    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });
});
