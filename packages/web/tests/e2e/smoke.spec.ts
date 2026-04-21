import { expect, test } from "@playwright/test";

test("モデル生成の主要フローを完了できる", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Browser PICT Tool" })).toBeVisible();
  await expect(page.locator("#model-input")).toHaveValue(/Browser: Chrome, Firefox, Safari/);

  await page.locator("#generate-button").click();

  await expect(page.locator("#status-summary")).toHaveText("完了", { timeout: 20_000 });
  await expect(page.locator("#results-caption")).toContainText("行 /");
  await expect(page.locator("#results-table-shell tbody tr").first()).toBeVisible();

  await expect(page.locator("#export-csv-button")).toBeEnabled();
  await expect(page.locator("#export-tsv-button")).toBeEnabled();
  await expect(page.locator("#export-md-button")).toBeEnabled();
});
