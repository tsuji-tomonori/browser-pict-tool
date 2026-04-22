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

test("不正なモデル入力で診断と aria-invalid を表示する", async ({ page }) => {
  await page.goto("/");

  await page.locator("#model-input").fill("Browser Chrome,Firefox");
  await page.locator("#generate-button").click();

  await expect(page.locator("#status-summary")).toHaveText(/エラー|中断/);
  await expect(page.locator("#diagnostics-summary")).toContainText("エラー");
  await expect(page.locator("#model-input")).toHaveAttribute("aria-invalid", "true");
});

test("結果テーブルのフィルタと並び替えが動作する", async ({ page }) => {
  await page.goto("/");

  await page.locator("#generate-button").click();
  await expect(page.locator("#status-summary")).toHaveText("完了", { timeout: 20_000 });

  const firstCell = page.locator("#results-table-shell tbody tr").first().locator("td").first();
  const beforeSort = await firstCell.innerText();

  await page.locator(".sort-button").first().click();
  const afterSort = await firstCell.innerText();
  expect(afterSort).not.toBe("");

  await page.locator("#filter-input").fill("Firefox");
  await expect(page.locator("#results-summary")).toContainText("表示行");
  await expect(page.locator("#results-table-shell tbody tr").first()).toContainText("Firefox");

  expect(beforeSort).not.toBe("");
});

test("列幅ハンドルのキーボード操作で列幅を変更できる", async ({ page }) => {
  await page.goto("/");

  await page.locator("#generate-button").click();
  await expect(page.locator("#status-summary")).toHaveText("完了", { timeout: 20_000 });

  const resizeHandle = page.locator("[data-resize-index='0']");
  await expect(resizeHandle).toBeVisible();

  const targetCol = page.locator("col[data-col-index='0']");
  const beforeWidth = await targetCol.evaluate((element) => getComputedStyle(element).width);

  await resizeHandle.focus();
  await page.keyboard.press("ArrowRight");

  await expect
    .poll(async () => targetCol.evaluate((element) => getComputedStyle(element).width))
    .not.toBe(beforeWidth);
});
