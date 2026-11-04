import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/** Picks the robot emoji on a green tint and keeps it. */
async function pickRobot(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Your picture' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Robot' }).click();
  await dialog.getByRole('radio', { name: 'Green' }).first().click();
  await dialog.getByRole('button', { name: 'Use this picture' }).click();
  await expect(dialog).toBeHidden();
}

const headerAvatar = (page: Page) => page.locator('[data-profile-trigger] .avatar');

for (const colorScheme of ['light', 'dark'] as const) {
  test(`profile page welcomes, then shows the profile (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('./user/');
    await expect(page.getByRole('heading', { level: 1, name: 'Your desk' })).toBeVisible();
    await expect(page.getByText('or bring your save', { exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Set up your profile' }).click();
    await expectAccessible(page);
    await pickRobot(page);

    // The browser now holds a save: the example diagram, with the picture in the header.
    await expect(page.getByRole('heading', { name: 'Your diagrams' })).toBeVisible();
    await expect(page.getByRole('link', { name: /MNIST classifier/ })).toBeVisible();
    await expect(headerAvatar(page)).toHaveAttribute('data-kind', 'emoji');
    await expect(headerAvatar(page)).toHaveAttribute('data-tint', 'green');
    await expectAccessible(page);
  });
}

test('the name is edited in place and shows in the header menu', async ({ page }) => {
  await page.goto('./user/');
  await page.getByRole('button', { name: 'Set up your profile' }).click();
  await pickRobot(page);
  await page.getByRole('button', { name: 'Add your name' }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Ada Lovelace');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible();

  await page.goto('./');
  await page.getByRole('button', { name: 'Your profile: Ada Lovelace' }).click();
  const menu = page.locator('#profile-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('1 diagram in this browser');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('a save file brings the profile and diagrams to another browser', async ({
  page,
  browser,
}) => {
  await page.goto('./user/');
  await page.getByRole('button', { name: 'Set up your profile' }).click();
  await pickRobot(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save file' }).click();
  const file = await (await download).path();

  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto('./user/');
  await other.locator('input[type="file"]').setInputFiles(file);
  await expect(other.getByRole('status')).toContainText('1 new diagram and your profile');
  await expect(other.getByRole('link', { name: /MNIST classifier/ })).toBeVisible();
  await expect(headerAvatar(other)).toHaveAttribute('data-kind', 'emoji');
  await fresh.close();
});

test('the gallery opens a diagram in the editor, which keeps the profile', async ({ page }) => {
  await page.goto('./user/');
  await page.getByRole('button', { name: 'Set up your profile' }).click();
  await pickRobot(page);
  await page.getByRole('link', { name: /MNIST classifier/ }).click();
  await expect(page).toHaveURL(/\/tool\/$/);
  await expect(page.getByRole('img', { name: 'MNIST classifier' })).toBeVisible();
  // The editor's own autosave must not drop the profile from the save.
  await page.goto('./user/');
  await expect(headerAvatar(page)).toHaveAttribute('data-kind', 'emoji');
});

test('signing out removes everything from this browser', async ({ page }) => {
  await page.goto('./user/');
  await page.getByRole('button', { name: 'Set up your profile' }).click();
  await pickRobot(page);
  await page.getByRole('button', { name: 'Sign out of this browser' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your desk' })).toBeVisible();
  await expect(headerAvatar(page)).toHaveAttribute('data-kind', '');
});
