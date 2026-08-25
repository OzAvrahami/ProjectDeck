import { expect, test } from "@playwright/test";

test("loads the ProjectDeck foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "ProjectDeck" }),
  ).toBeVisible();
  await expect(page.getByText("Application foundation ready.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Portfolio navigation" }),
  ).toContainText("Projects");
});
