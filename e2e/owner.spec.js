import { expect, test } from '@playwright/test';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

test.describe.serial('owner identity administration', () => {
  test('invites a new employee', async ({ page }) => {
    const employeeName = unique('Owner Employee');
    const employeeEmail = `${unique('owner-employee')}@example.com`;
    await page.goto('/manage/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    await page.getByLabel('Name').fill(employeeName);
    await page.getByLabel('Email').fill(employeeEmail);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Employee added and invitation sent.')).toBeVisible();
    await expect(page.getByText(employeeEmail, { exact: true }).first()).toBeVisible();
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
