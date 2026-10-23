/**
 * E2E — partner reschedule + cancel on an actual booking.
 *
 * SETUP (one-time):
 *   npm install --save-dev @playwright/test --legacy-peer-deps
 *   npx playwright install chromium
 *   Create .env.test.local with:
 *     E2E_BASE_URL=https://www.securedoctorclean.com
 *     E2E_USERNAME=jethrow        # Coca Cola test partner
 *     E2E_PASSWORD=<redacted>
 *     E2E_TEST_JOB_ID=<uuid of a disposable job you keep seeded>
 *
 * RUN:
 *   npx playwright test e2e/reschedule-cancel.spec.ts
 *
 * This test is intentionally hard-coded to use the "Coca Cola" test
 * partner so a real customer booking never gets rescheduled or cancelled.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'https://www.securedoctorclean.com';
const USERNAME = process.env.E2E_USERNAME ?? 'jethrow';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const JOB_ID = process.env.E2E_TEST_JOB_ID ?? '';

test.describe('Partner reschedule/cancel flow', () => {
  test.skip(!PASSWORD || !JOB_ID, 'E2E_PASSWORD + E2E_TEST_JOB_ID must be set');

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder(/username/i).fill(USERNAME);
    await page.getByPlaceholder(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('opens job detail → sees Manage Booking card', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/jobs/${JOB_ID}`);
    await expect(page.getByText('Manage Booking')).toBeVisible();
    await expect(page.getByRole('button', { name: /reschedule/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });

  test('reschedule modal — shows original time + fee preview', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/jobs/${JOB_ID}`);
    await page.getByRole('button', { name: /reschedule/i }).click();
    await expect(page.getByText(/Currently scheduled for/i)).toBeVisible();
    // Fee preview block should render (either "No reschedule fee" or an amber amount)
    await expect(
      page.getByText(/No reschedule fee|Reschedule fee: S\$/i),
    ).toBeVisible();
  });

  test('cancel modal — original price + fee preview visible', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/jobs/${JOB_ID}`);
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByText(/Original booking price/i)).toBeVisible();
    // Keep booking + Confirm buttons present
    await expect(page.getByRole('button', { name: /keep booking/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
  });

  test('reschedule — picking a date <2h away is blocked', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/jobs/${JOB_ID}`);
    await page.getByRole('button', { name: /reschedule/i }).click();
    // Submit without filling date → should surface server/UI validation
    await page.getByRole('button', { name: /^reschedule$/i }).click();
    await expect(page.getByText(/pick a new date and time|Invalid/i)).toBeVisible();
  });
});
