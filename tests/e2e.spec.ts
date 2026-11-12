import { test, expect, type Page, type Response, type Request } from "@playwright/test";

test.use({
  baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
  viewport: { width: 1440, height: 1000 },
});
async function openWorkspace(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Households", exact: true }),
  ).toBeVisible();
}
async function startFirstVisit(page: Page) {
  await page.getByRole("button", { name: /Lakshmi Devi.*CH-001/ }).click();
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Lakshmi Devi",
  );
}

test("manual entry, validation, completion, reload, and read-only history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openWorkspace(page);
  await startFirstVisit(page);
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Lakshmi Devi Shetty");
  await page
    .getByLabel("Reported symptoms", { exact: true })
    .fill("No symptoms reported today.");
  const temperature = page.getByLabel("Temperature", { exact: false });
  await temperature.pressSequentially("37.05");
  await expect(temperature).toHaveValue("37.05");
  await page.getByLabel("Phone number", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Review visit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish visit", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Enter a 10-digit phone number.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to form", exact: true })
    .last()
    .click();
  await page.getByLabel("Phone number", { exact: true }).fill("9876543210");
  await page.getByRole("button", { name: "Review visit", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit." })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visit saved.", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Visits", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Completed/ })
    .filter({ hasText: "Completed" })
    .first()
    .click();
  await page.getByRole("button", { name: /Lakshmi Devi.*Completed/ }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Lakshmi Devi Shetty",
  );
  await expect(page.getByLabel("Full name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
    "9876543210",
  );
  expect(errors).toEqual([]);
});

test("sample replay preserves manual edits, attributes the husband, and completes review", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  const apiDiagnostics: Array<Record<string, unknown>> = [];
  let rejectApiFailure!: (reason: Error) => void;
  const apiFailure = new Promise<never>((_resolve, reject) => {
    rejectApiFailure = reject;
  });
  // Attach a handler before the first request; the original promise still rejects
  // in the race below. This prevents an early network failure being unhandled.
  void apiFailure.catch(() => undefined);
  const isSampleRequest = (url: string) => new URL(url).pathname === "/api/demo/extract";
  const onResponse = (response: Response) => {
    if (!isSampleRequest(response.url())) return;
    const entry: Record<string, unknown> = {
      url: response.url(), status: response.status(),
      origin: response.request().headers().origin ?? null,
    };
    apiDiagnostics.push(entry);
    if (!response.ok()) {
      void response.text().then((body) => {
        entry.body = body.slice(0, 1500);
        rejectApiFailure(new Error(`Sample extraction HTTP ${response.status()} at ${response.url()}; Origin ${entry.origin}; ${entry.body}`));
      }).catch(() => rejectApiFailure(new Error(`Sample extraction HTTP ${response.status()}; response body unavailable.`)));
    }
  };
  const onRequestFailed = (request: Request) => {
    if (!isSampleRequest(request.url())) return;
    const message = request.failure()?.errorText ?? "Unknown network failure";
    apiDiagnostics.push({url: request.url(), error: message});
    rejectApiFailure(new Error(`Sample extraction network failure: ${message}`));
  };
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("pageerror", (e) => errors.push(e.message));
  await openWorkspace(page);
  await startFirstVisit(page);
  await page.getByLabel("Weight", { exact: false }).fill("62");
  await page
    .getByRole("button", { name: "Try sample conversation", exact: true })
    .click();
  const phone = page.getByLabel("Phone number", { exact: true });
  await phone.fill("9876543210");
  await phone.focus();
  await phone.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(3, 3),
  );
  const initialPhoneBox = await phone.boundingBox();
  const initialScroll = await page.evaluate(() => window.scrollY);
  try {
    await Promise.race([
      expect(page.getByRole("button", {name: "Review sample", exact: true})).toBeVisible({timeout: 40000}),
      apiFailure,
    ]);
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
    await test.info().attach("sample-api-responses.json", {
      body: JSON.stringify(apiDiagnostics, null, 2), contentType: "application/json",
    });
  }
  expect(apiDiagnostics).toHaveLength(7);
  await expect(page.getByLabel("Weight", { exact: false })).toHaveValue("62");
  await expect(phone).toBeFocused();
  expect(
    await phone.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(3);
  await expect(phone).toHaveValue("9876543210");
  const finalPhoneBox = await phone.boundingBox();
  expect(
    Math.abs((finalPhoneBox?.y ?? 0) - (initialPhoneBox?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - initialScroll),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: /Ramesh.*Husband/ }).click();
  await expect(page.getByLabel("Fever duration", { exact: false })).toHaveValue(
    "7",
  );
  await expect(
    page.getByLabel("Reported symptoms", { exact: true }),
  ).toHaveValue(/My husband has been having fever for a week/);
  await page.getByRole("button", { name: /Lakshmi Devi.*Self/ }).click();
  await expect(page.getByLabel("Fever duration", { exact: false })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Review visit", exact: true }).click();
  while (
    await page
      .getByRole("button", { name: "Keep my entry", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Keep my entry", exact: true })
      .first()
      .click();
  while (
    await page.getByRole("button", { name: "Reviewed", exact: true }).count()
  )
    await page
      .getByRole("button", { name: "Reviewed", exact: true })
      .first()
      .click();
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit." })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visit saved.", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile directory, real add action, and keyboard-safe dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByLabel("Search households").fill("does-not-exist");
  await expect(
    page.getByRole("heading", { name: "No households found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page
    .getByRole("button", { name: "Add household", exact: true })
    .click();
  await page
    .getByLabel("Primary member name", { exact: true })
    .fill("Test Family");
  await page.getByLabel("House number", { exact: true }).fill("TEST-01");
  await page.getByLabel("Age", { exact: true }).fill("31");
  await page.getByLabel("Address", { exact: true }).fill("Sample Street");
  await page.getByLabel("Area", { exact: true }).fill("Demo Village");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add household", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test Family & family", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Test Family",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("offline shell reload preserves saved drafts without provider requests", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await openWorkspace(page);
  await startFirstVisit(page);
  await page
    .getByLabel("Reported symptoms", { exact: true })
    .fill("Synthetic note retained offline.");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Offline. You can continue editing on this device.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Lakshmi Devi.*CH-001/ }).click();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  await expect(
    page.getByLabel("Reported symptoms", { exact: true }),
  ).toHaveValue("Synthetic note retained offline.");
  await page.getByLabel("Phone number", { exact: true }).fill("9876543210");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
});

test("browser back restores the matching visit and household", async ({
  page,
}) => {
  await openWorkspace(page);
  await startFirstVisit(page);
  await page
    .getByLabel("Reported symptoms", { exact: true })
    .fill("First household synthetic note.");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Households", exact: true })
    .click();
  await page.getByRole("button", { name: /Savitri.*CH-002/ }).click();
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Savitri",
  );
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Lakshmi Devi",
  );
  await expect(
    page.getByLabel("Reported symptoms", { exact: true }),
  ).toHaveValue("First household synthetic note.");
  await expect(
    page.getByRole("button", { name: "Lakshmi Devi", exact: true }),
  ).toBeVisible();
});
