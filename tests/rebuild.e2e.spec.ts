import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type {
  Survey,
  SurveyExtractionResult,
  SurveyTranscript,
} from "../src/lib/survey";

test.use({ viewport: { width: 1440, height: 1000 } });

const fixtureNames = [
  "Fixture Parent One",
  "Fixture Parent Two",
  "Fixture Child Three",
];
const paidRoutes = /\/api\/(extract|speech\/(transcribe|tts))(?:\?|$)/;

async function openWorkspace(page: Page) {
  const code = process.env.DARA_ACCESS_CODE;
  if (!code)
    throw new Error(
      "Set DARA_ACCESS_CODE to the test server's workspace code before running browser checks.",
    );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .first()
    .click();
  const access = page.getByRole("dialog", { name: "Open your workspace" });
  await access.getByLabel("Access code", { exact: true }).fill(code);
  await access
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Households", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your first household starts here.",
      exact: true,
    }),
  ).toBeVisible();
}

async function addHousehold(
  page: Page,
  name = "Browser Fixture Household",
  code = "E2E-001",
) {
  await page
    .getByRole("button", { name: "Add household", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a household" });
  await dialog.getByLabel(/^Household name/).fill(name);
  await dialog.getByLabel("House number", { exact: true }).fill(code);
  await dialog
    .getByLabel("Address", { exact: true })
    .fill("Synthetic test street");
  await dialog.getByLabel(/^Area/).fill("Browser test locality");
  await dialog
    .getByRole("button", { name: "Save household", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function startVisit(page: Page) {
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("");
}

async function section(
  page: Page,
  name: "Household" | "Family" | "Health" | "Notes" | "Review",
) {
  await page
    .getByRole("navigation", { name: "Visit sections" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
}

async function saved(page: Page) {
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function beginText(page: Page, text: string) {
  await page.getByRole("button", { name: /^Conversation(?:\s*\d+)?$/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Conversation",
    exact: true,
  });
  await dialog.getByLabel("Add conversation text", { exact: true }).fill(text);
  await dialog
    .getByRole("button", { name: "Fill answers from text", exact: true })
    .click();
  return dialog;
}

test("blank survey, manual identities, custom question, review, immutable history and blank repeat", async ({
  page,
}) => {
  test.setTimeout(60000);
  const requests: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(paidRoutes, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await openWorkspace(page);
  await addHousehold(page);
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("3");
  await page
    .getByRole("button", { name: "Add a question", exact: true })
    .click();
  const custom = page.getByRole("dialog", {
    name: "Add a question",
    exact: true,
  });
  await custom
    .getByLabel("Question", { exact: true })
    .fill("Preferred visit time");
  await custom
    .getByLabel("Ask about", { exact: true })
    .selectOption("household");
  await custom.getByLabel("Answer type", { exact: true }).selectOption("text");
  await custom
    .getByRole("checkbox", { name: "Require an answer before finishing" })
    .check();
  await custom
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  await section(page, "Family");
  const members = page.locator(".family-section");
  await expect(members).toHaveCount(3);
  for (let index = 0; index < fixtureNames.length; index++) {
    await expect(members.nth(index).getByLabel(/^Full name/)).toHaveValue("");
    await expect(members.nth(index).getByLabel(/^Age/)).toHaveValue("");
    await members
      .nth(index)
      .getByLabel(/^Full name/)
      .fill(fixtureNames[index]);
    await members.nth(index).getByLabel(/^Age/).fill(["34", "36", "7"][index]);
    await members
      .nth(index)
      .getByLabel("Relationship", { exact: true })
      .fill(["Self", "Spouse", "Child"][index]);
  }
  await section(page, "Health");
  await page.getByLabel(/^Temperature/).pressSequentially("37.05");
  await expect(page.getByLabel(/^Temperature/)).toHaveValue("37.05");
  await page
    .getByLabel("Reported symptoms", { exact: true })
    .fill("Synthetic observation for verification only.");
  await section(page, "Notes");
  await page
    .getByLabel("Household notes", { exact: true })
    .fill("Synthetic household note retained with this visit.");
  await page
    .getByLabel("Member notes", { exact: true })
    .fill("Synthetic note for the first member.");
  await section(page, "Review");
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit." })
    .check();
  await expect(
    page.getByRole("button", { name: "Finish visit", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      /Preferred visit time.*required|required.*Preferred visit time/i,
    ),
  ).toBeVisible();
  await section(page, "Household");
  await page.getByLabel(/^Preferred visit time/).fill("Morning");
  await section(page, "Review");
  await expect(
    page.getByRole("checkbox", { name: "I have reviewed this visit." }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit." })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start a blank repeat visit", exact: true })
    .click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("");
  await expect(page.getByLabel(/^Preferred visit time/)).toHaveCount(0);
  await section(page, "Family");
  await expect(page.locator(".family-section")).toHaveCount(0);
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "",
  );
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: /Browser Fixture Household.*E2E-001/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Repeat household visit/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Completed.*Household visit.*View record/ })
    .click();
  await expect(page.getByText(/This record is read-only\./)).toBeVisible();
  await section(page, "Household");
  await expect(page.getByLabel(/^Family members/)).toHaveValue("3");
  await expect(page.getByLabel(/^Family members/)).toBeDisabled();
  await expect(page.getByLabel(/^Preferred visit time/)).toHaveValue("Morning");
  await section(page, "Family");
  for (let index = 0; index < fixtureNames.length; index++) {
    await expect(
      page
        .locator(".family-section")
        .nth(index)
        .getByLabel(/^Full name/),
    ).toHaveValue(fixtureNames[index]);
    await expect(
      page
        .locator(".family-section")
        .nth(index)
        .getByLabel(/^Full name/),
    ).toBeDisabled();
  }
  await section(page, "Health");
  await expect(page.getByLabel(/^Temperature/)).toHaveValue("37.05");
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "Synthetic household note retained with this visit.",
  );
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("responsive directory and editable blank surveys fit phones and tablet", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await openWorkspace(page);
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Households", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    await capture(page, testInfo, `empty-directory-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await addHousehold(page, "Responsive Fixture Household", "E2E-MOBILE");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("3");
  await section(page, "Family");
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".family-section")).toHaveCount(3);
    const input = page
      .locator(".family-section")
      .first()
      .getByLabel(/^Full name/);
    await input.fill("Responsive Fixture Person");
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Responsive Fixture Person");
    await noOverflow(page);
    await capture(page, testInfo, `family-form-${width}`);
  }
});

test("saved drafts reload and remain editable offline without provider requests", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const requests: string[] = [];
  await page.route(paidRoutes, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await openWorkspace(page);
  await addHousehold(page, "Offline Fixture Household", "E2E-OFFLINE");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("1");
  await section(page, "Family");
  await page.getByLabel(/^Full name/).fill("Offline Fixture Person");
  await page.getByLabel(/^Age/).fill("29");
  await section(page, "Notes");
  await page
    .getByLabel("Household notes", { exact: true })
    .fill("Synthetic draft survives offline reload.");
  await saved(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText(
      "You’re offline. You can keep editing saved records on this device.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Offline Fixture Household.*E2E-OFFLINE/ })
    .click();
  await page
    .getByRole("button", { name: "Continue visit", exact: true })
    .click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeDisabled();
  await section(page, "Family");
  await expect(page.getByLabel(/^Full name/)).toHaveValue(
    "Offline Fixture Person",
  );
  await page.getByLabel("Phone number", { exact: true }).fill("9876543210");
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "Synthetic draft survives offline reload.",
  );
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: /Offline Fixture Household.*E2E-OFFLINE/ })
    .click();
  await page
    .getByRole("button", { name: "Continue visit", exact: true })
    .click();
  await section(page, "Family");
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
    "9876543210",
  );
  expect(requests).toEqual([]);
});

test("mocked extraction creates three members automatically and protects active and manual answers", async ({
  page,
}) => {
  test.setTimeout(60000);
  let calls = 0;
  let releaseSecond: () => void = () => {};
  const secondResponse = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  await page.route("**/api/extract", async (route) => {
    calls++;
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    let result: SurveyExtractionResult;
    if (calls === 1)
      result = {
        familySize: 3,
        familySizeEvidence: segment.text,
        members: [],
        notes: [],
      };
    else if (calls === 2) {
      await secondResponse;
      result = {
        familySize: null,
        members: [
          {
            memberId: survey.members[0].id,
            name: "Suggested Fixture Name",
            phone: "9876543210",
            evidence: segment.text,
          },
        ],
        notes: [],
      };
    } else
      result = {
        familySize: 2,
        familySizeEvidence: segment.text,
        members: [],
        notes: [],
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        baseRevision: survey.revision,
        result,
      }),
    });
  });
  await openWorkspace(page);
  await addHousehold(page, "Extraction Fixture Household", "E2E-EXTRACT");
  await startVisit(page);
  let dialog = await beginText(
    page,
    "There are three family members in this synthetic test household.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("3");
  await section(page, "Family");
  await expect(page.locator(".family-section")).toHaveCount(3);
  const first = page.locator(".family-section").first();
  await first.getByLabel(/^Full name/).fill("Manual Fixture Name");
  await page
    .locator(".family-section")
    .nth(2)
    .getByLabel(/^Full name/)
    .fill("Retained Third Fixture");
  dialog = await beginText(
    page,
    "The first member is Suggested Fixture Name and the phone is 9876543210.",
  );
  await expect.poll(() => calls).toBe(2);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const phone = first.getByLabel("Phone number", { exact: true });
  await phone.focus();
  const beforeBox = await phone.boundingBox();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await expect(
    page.getByText("Filling recorded answers", { exact: true }),
  ).toBeVisible();
  releaseSecond();
  await expect(
    page.getByText("Filling recorded answers", { exact: true }),
  ).toHaveCount(0);
  await expect(first.getByLabel(/^Full name/)).toHaveValue(
    "Manual Fixture Name",
  );
  await expect(phone).toHaveValue("");
  await expect(phone).toBeFocused();
  const afterBox = await phone.boundingBox();
  expect(
    Math.abs((afterBox?.y ?? 0) - (beforeBox?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - beforeScroll),
  ).toBeLessThanOrEqual(1);
  await section(page, "Review");
  await expect(
    page.getByText("Your edit is protected", { exact: true }),
  ).toHaveCount(2);
  while (
    await page
      .getByRole("button", { name: "Keep my entry", exact: true })
      .count()
  ) {
    await page
      .getByRole("button", { name: "Keep my entry", exact: true })
      .first()
      .click();
  }
  dialog = await beginText(page, "Correction: there are two family members.");
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Family");
  await expect(page.locator(".family-section")).toHaveCount(3);
  await expect(
    page
      .locator(".family-section")
      .nth(2)
      .getByLabel(/^Full name/),
  ).toHaveValue("Retained Third Fixture");
  await section(page, "Review");
  await expect(
    page.getByRole("button", { name: "Finish visit", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/family size|member sections|family member count/i),
  ).toBeVisible();
  expect(calls).toBe(3);
});

test("denied microphone permission preserves the manual visit and offers recovery", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException(
          "Synthetic browser permission denial",
          "NotAllowedError",
        );
      },
    });
  });
  await page.route(paidRoutes, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await openWorkspace(page);
  await addHousehold(page, "Permission Fixture Household", "E2E-PERMISSION");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("1");
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  const consent = page.getByRole("dialog", {
    name: "Before you start recording",
  });
  await expect(
    consent.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeDisabled();
  await consent
    .getByRole("checkbox", { name: "The family has agreed to recording." })
    .check();
  await consent
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByText("Allow microphone access to record this visit.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Recording conversation", { exact: true }),
  ).toHaveCount(0);
  await section(page, "Family");
  await page.getByLabel(/^Full name/).fill("Permission Fixture Person");
  await page.getByLabel(/^Age/).fill("31");
  await saved(page);
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  expect(requests).toEqual([]);
});
