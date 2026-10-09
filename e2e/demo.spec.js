import { expect, test as base } from '@playwright/test';

const test = base.extend({
  staticOnly: [
    async ({ page, baseURL }, use) => {
      const unexpectedRequests = [];
      const pageErrors = [];
      const origin = new URL(baseURL).origin;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          (url.origin === origin &&
            url.pathname.startsWith('/nme-demo/') &&
            !['fetch', 'xhr'].includes(request.resourceType()) &&
            !/\/(api|auth|oauth2)\//.test(url.pathname))
        ) return;
        unexpectedRequests.push(request.url());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await use();
      expect(unexpectedRequests, 'The demo must only request its own static assets.').toEqual([]);
      expect(pageErrors, 'The demo must run without browser errors.').toEqual([]);
    },
    { auto: true },
  ],
});

async function addEmployee(page, name = 'Demo Test Employee') {
  await page.goto('#/manage/employees');
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Add employee', exact: true });
  await drawer.getByLabel('Name', { exact: true }).fill(name);
  await drawer.getByLabel('Email').fill('demo.test.employee@example.com');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Employee added.', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible();
  return name;
}

async function addRequirement(page, type, name) {
  const isMedical = type === 'medical';
  await page.goto(`#/manage/${isMedical ? 'medicals' : 'courses'}`);
  await page.getByRole('button', { name: `Add ${type}`, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `Add ${type}`, exact: true });
  await drawer.getByLabel(`${isMedical ? 'Medical' : 'Course'} name`).fill(name);
  await drawer.getByLabel('No Site Requirement').check();
  await drawer.getByLabel('Validity in months').fill('12');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`${isMedical ? 'Medical' : 'Course'} added.`, { exact: true })).toBeVisible();
}

test('seeded readiness works without sign-in and hash routes survive refresh', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/nme-demo\/#\/training$/);
  await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption({ label: 'North Ridge Mine' });
  await expect(page.getByRole('heading', { name: 'Employee training readiness' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Employee', exact: true })).toContainText('Maya Chen');
  await expect(page.getByRole('button', { name: /sign (in|out)/i })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Medical', exact: true }).click();
  await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption({ label: 'North Ridge Mine' });
  await expect(page.getByRole('heading', { name: 'Employee medical readiness' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/nme-demo\/#\/medical$/);
  await page.getByRole('combobox', { name: 'Site', exact: true }).selectOption({ label: 'North Ridge Mine' });
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.locator('tbody tr').first().click();
  await expect(page.locator('.requirement-row').first()).toBeVisible();

  await page.goto('#/manage/courses');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Course catalogue' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('mock employees and training completions persist after refresh', async ({ page }) => {
  const employeeName = await addEmployee(page);
  const courseName = 'Demo equipment orientation';
  await addRequirement(page, 'course', courseName);

  await page.goto('#/manage/completions?action=create');
  const drawer = page.getByRole('dialog', { name: 'Record course completion' });
  await drawer.getByRole('combobox', { name: 'Employee', exact: true }).selectOption({ label: employeeName });
  await drawer.getByRole('combobox', { name: 'Course', exact: true }).selectOption({ label: courseName });
  await drawer.getByLabel('Completed on').fill(new Date().toISOString().slice(0, 10));
  await drawer.getByLabel('Comment').fill('Mock certificate checked for the demo.');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Completion recorded.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Mock certificate checked for the demo.', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: employeeName })).toContainText(courseName);

  await page.goto('#/manage/employees');
  await page.locator('tbody tr').filter({ hasText: employeeName }).click();
  await expect(page.getByText(courseName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Employee archived.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('tbody tr').filter({ hasText: employeeName })).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(page.locator('tbody tr').filter({ hasText: employeeName })).toBeVisible();
});

test('medical pending dates can be finalized and corrected with history preserved', async ({ page }) => {
  const medicalName = 'Demo hearing assessment';
  await addRequirement(page, 'medical', medicalName);
  await page.goto('#/manage/completions?type=medical&action=create');
  const drawer = page.getByRole('dialog', { name: 'Record medical completion' });
  await drawer.getByRole('combobox', { name: 'Employee', exact: true }).selectOption({ label: 'Maya Chen' });
  await drawer.getByRole('combobox', { name: 'Medical', exact: true }).selectOption({ label: medicalName });
  await drawer.getByLabel('Comment').fill('Waiting for the mock assessment date.');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Pending date saved. It will not affect readiness until finalized.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Medical pending dates' })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: medicalName })).toContainText('Pending date');

  await page.getByRole('button', { name: 'Add completion date', exact: true }).click();
  const finalize = page.getByRole('dialog', { name: 'Add completion date' });
  await finalize.getByLabel('Completed on').fill('2026-01-31');
  await finalize.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Completion date added. The completion now counts toward readiness.')).toBeVisible();
  await page.getByRole('button', { name: 'View completion', exact: true }).click();
  await page.getByRole('button', { name: 'Edit dates', exact: true }).click();
  const correction = page.getByRole('dialog', { name: 'Edit medical completion dates' });
  await correction.getByLabel('Completed on', { exact: true }).fill('2026-02-01');
  await correction.getByLabel('Expires on').fill('2027-03-15');
  await correction.getByLabel('Correction reason').fill('Corrected against the mock assessment record.');
  await correction.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Completion dates corrected. The original remains in voided history.')).toBeVisible();
  await page.reload();
  await page.getByLabel('Search', { exact: true }).fill(medicalName);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Show voided').check();
  await expect(page.locator('tbody tr')).toHaveCount(2);
});
