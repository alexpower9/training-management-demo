import { expect, test } from '@playwright/test';

const ownerHeaders = {
  'x-demo-user-role': 'owner',
  'x-demo-user-subject': 'playwright-owner',
};

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

test.describe.serial('owner identity administration', () => {
  test('links an employee account', async ({ page, request }) => {
    const createResponse = await request.post('/api/v1/admin/employees', {
      headers: ownerHeaders,
      data: { displayName: unique('Owner Linked Employee') },
    });
    expect(createResponse.ok()).toBeTruthy();
    const employee = await createResponse.json();
    const employeeSubject = crypto.randomUUID();

    await page.goto(`/manage/employees?id=${employee.id}`);
    await page.getByRole('button', { name: 'Link account' }).click();
    await page.getByLabel('Cognito subject').fill(employeeSubject);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Employee account linked.')).toBeVisible();
    await expect(page.getByText(employeeSubject)).toBeVisible();
  });

  test('invites a new administrator', async ({ page }) => {
    const email = `${unique('new-admin')}@example.com`;
    await page.goto('/manage/administrators');
    await page.getByRole('button', { name: 'Invite administrator' }).click();
    await page.getByLabel('Name').fill('Playwright Administrator');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Administrator invitation sent.')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText('Invitation pending')).toBeVisible();
  });
});
