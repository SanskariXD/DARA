import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type {
  Survey,
  SurveyExtractionResult,
  SurveyTranscript,
} from "../src/lib/survey";
import { translate, type AppLanguage } from "../src/lib/i18n";

test.use({ viewport: { width: 1440, height: 1000 } });

const fixtureNames = [
  "Fixture Parent One",
  "Fixture Parent Two",
  "Fixture Child Three",
];
const paidRoutes =
  /\/api\/(extract|reconcile|speech\/(transcribe|tts))(?:\?|$)/;

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
  await expect(page.locator(".household-card")).toHaveCount(5);
  for (const code of ["EX-001", "EX-002", "EX-003", "EX-004", "EX-005"])
    await expect(
      page.locator(".household-card").filter({ hasText: code }),
    ).toHaveCount(1);
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

async function selectHealthMember(page: Page, name: string) {
  await section(page, "Health");
  await page.locator(".health-member-row").filter({ hasText: name }).click();
  await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
}

async function mockNoopReconciliation(page: Page) {
  await page.route("**/api/reconcile", async (route) => {
    const { survey, segments } = route.request().postDataJSON() as {
      survey: Survey;
      segments: SurveyTranscript[];
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        baseRevision: survey.revision,
        checkedSegmentIds: segments.map((segment) => segment.id),
        envelopes: [],
      }),
    });
  });
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
}, testInfo) => {
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
    .getByRole("combobox", { name: "Ask about", exact: true })
    .selectOption("household");
  await custom
    .getByRole("combobox", { name: "Answer type", exact: true })
    .selectOption("text");
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
      .getByRole("combobox", { name: "Relationship", exact: true })
      .selectOption(["self", "spouse", "child"][index]);
  }
  await members
    .first()
    .getByLabel(/^Weight/)
    .pressSequentially("63.05");
  await expect(members.first().getByLabel(/^Weight/)).toHaveValue("63.05");
  await selectHealthMember(page, fixtureNames[0]);
  await page
    .getByRole("combobox", { name: "Health discussion", exact: true })
    .selectOption("concerns");
  await page
    .getByLabel("Reported symptoms and health history", { exact: true })
    .fill("Synthetic observation for verification only.");
  await section(page, "Notes");
  await page
    .getByLabel("Household notes", { exact: true })
    .fill("Synthetic household note retained with this visit.");
  await expect(page.getByLabel("Member notes", { exact: true })).toHaveCount(0);
  await expect(page.locator(".survey-content textarea")).toHaveCount(1);
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
  await capture(page, testInfo, "review-ready-desktop");
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
  await expect(
    page
      .locator(".family-section")
      .first()
      .getByLabel(/^Weight/),
  ).toHaveValue("63.05");
  await selectHealthMember(page, fixtureNames[0]);
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("Synthetic observation for verification only.");
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
    await capture(page, testInfo, `example-directory-${width}`);
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
  await mockNoopReconciliation(page);
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
        notes: [
          {
            text: "The household prefers morning visits.",
            evidence: "The household prefers morning visits.",
            memberId: null,
          },
        ],
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
            attribution: {
              kind: "name",
              reference: "Manual Fixture Name",
              evidence: segment.text,
              segmentId: segment.id,
            },
            corrections: [
              {
                fieldId: "name",
                previousValue: "Manual Fixture Name",
                evidence: segment.text,
              },
            ],
          },
        ],
        notes: [],
      };
    } else
      result = {
        familySize: 2,
        familySizeEvidence: segment.text,
        familySizeCorrection: { previousValue: 3, evidence: segment.text },
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
    "There are three family members in this synthetic test household. The household prefers morning visits.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("3");
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "The household prefers morning visits.",
  );
  await expect(page.locator(".survey-content textarea")).toHaveCount(1);
  await expect(page.locator(".captured-note")).toHaveCount(0);
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
    "Correction for Manual Fixture Name: the name is Suggested Fixture Name and the phone is 9876543210.",
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

test("relationship defaults respect explicit sex and missing health answers open the correct member", async ({
  page,
}, testInfo) => {
  await openWorkspace(page);
  await addHousehold(page, "Health Navigation Fixture", "E2E-HEALTH");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("2");
  await section(page, "Family");
  const members = page.locator(".family-section");
  await members
    .nth(0)
    .getByLabel(/^Full name/)
    .fill("Fixture Father");
  await members.nth(0).getByLabel(/^Age/).fill("45");
  await members
    .nth(0)
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("father");
  await expect(
    members.nth(0).getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("male");
  await members
    .nth(0)
    .getByRole("combobox", { name: "Sex", exact: true })
    .selectOption("other");
  await members
    .nth(0)
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("uncle");
  await expect(
    members.nth(0).getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("other");
  await members
    .nth(1)
    .getByLabel(/^Full name/)
    .fill("Fixture Mother");
  await members.nth(1).getByLabel(/^Age/).fill("42");
  await members
    .nth(1)
    .getByRole("combobox", { name: "Relationship", exact: true })
    .selectOption("mother");
  await expect(
    members.nth(1).getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("female");
  await section(page, "Health");
  await capture(page, testInfo, "health-overview-desktop");
  await page
    .locator(".health-member-row")
    .filter({ hasText: "Fixture Mother" })
    .click();
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await capture(page, testInfo, "health-compact-390");
  await page
    .getByRole("combobox", { name: "Health discussion", exact: true })
    .selectOption("concerns");
  await page
    .getByLabel("Reported symptoms and health history", { exact: true })
    .fill("Synthetic observation for the second member only.");
  await page
    .getByRole("combobox", { name: "Pregnancy status", exact: true })
    .selectOption("yes");
  await noOverflow(page);
  await capture(page, testInfo, "health-expanded-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section(page, "Review");
  const issue = page
    .locator(".review-issues > div")
    .filter({ hasText: "Gestational age is required." });
  await expect(issue).toHaveCount(1);
  await expect(issue).toContainText("Fixture Mother");
  await issue.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Fixture Mother", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Gestational age/)).toBeFocused();
  await page.getByLabel(/^Gestational age/).fill("24");
  await page
    .getByRole("button", { name: "Back to health overview", exact: true })
    .click();
  await page
    .locator(".health-member-row")
    .filter({ hasText: "Fixture Father" })
    .click();
  await expect(
    page.getByRole("region", { name: "Fixture Father", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Health discussion", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveCount(0);
  await section(page, "Notes");
  await expect(page.locator(".survey-content textarea")).toHaveCount(1);
  await expect(page.getByLabel("Member notes", { exact: true })).toHaveCount(0);
});

test("all six interface languages preserve names, custom choices and free-text answers", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await openWorkspace(page);
  await addHousehold(page, "Review", "E2E-LOCALE");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("1");
  await page
    .getByRole("button", { name: "Add a question", exact: true })
    .click();
  const custom = page.getByRole("dialog", {
    name: "Add a question",
    exact: true,
  });
  await custom.getByLabel("Question", { exact: true }).fill("Settings");
  await custom
    .getByRole("combobox", { name: "Answer type", exact: true })
    .selectOption("select");
  await custom.getByLabel(/^Choices/).fill("Households, Review");
  await custom
    .getByRole("button", { name: "Add question", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Settings/ })
    .selectOption("Households");
  await section(page, "Family");
  await page.getByLabel(/^Full name/).fill("Households");
  await page.getByLabel(/^Age/).fill("31");
  await section(page, "Notes");
  await page
    .getByLabel("Household notes", { exact: true })
    .fill("Ready for your review");
  await saved(page);
  const headings: [AppLanguage, string][] = [
    ["en", "Households"],
    ["kn", "ಮನೆಗಳು"],
    ["hi", "घर-परिवार"],
    ["te", "కుటుంబాలు"],
    ["ta", "குடும்பங்கள்"],
    ["ml", "കുടുംബങ്ങൾ"],
  ];
  for (const [language, heading] of headings) {
    await page.locator(".app-sidebar nav button").nth(2).click();
    await expect(page.locator("#app-language option")).toHaveCount(6);
    await page.locator("#app-language").selectOption(language);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await capture(page, testInfo, `settings-${language}-390`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".app-sidebar nav button").first().click();
    await expect(page.locator("main h1")).toHaveText(heading);
    await page
      .locator(".household-card")
      .filter({ hasText: "E2E-LOCALE" })
      .click();
    await expect(page.locator("main h1")).toHaveText("Review");
    await page
      .getByRole("button", {
        name: translate(language, "Continue visit"),
        exact: true,
      })
      .click();
    await page.locator(".survey-progress button").nth(0).click();
    const userChoice = page.getByRole("combobox", { name: /^Settings/ });
    await expect(userChoice).toHaveValue("Households");
    await expect(userChoice.locator("option:checked")).toHaveText("Households");
    await page.locator(".survey-progress button").nth(1).click();
    await expect(page.locator('input[id$="-name"]')).toHaveValue("Households");
    await expect(page.locator(".family-section h3")).toHaveText("Households");
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await capture(page, testInfo, `family-${language}-390`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".survey-progress button").nth(3).click();
    await expect(page.locator("#answer-household-householdNotes")).toHaveValue(
      "Ready for your review",
    );
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ml");
  await expect(page.locator("main h1")).toHaveText("കുടുംബങ്ങൾ");
  await page.locator(".app-sidebar nav button").nth(2).click();
  await expect(page.locator("#app-language")).toHaveValue("ml");
});

test("clearing own entries preserves examples and preferences and rejects an outstanding extraction", async ({
  page,
}) => {
  test.setTimeout(60000);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  let finished: () => void = () => {};
  const delivered = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await mockNoopReconciliation(page);
  await page.route("**/api/extract", async (route) => {
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    started = true;
    await gate;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          surveyId: survey.id,
          segmentId: segment.id,
          segmentIndex: segment.index,
          baseRevision: survey.revision,
          result: {
            familySize: 3,
            familySizeEvidence: segment.text,
            members: [],
            notes: [],
          },
        }),
      });
      const response = await route.request().response();
      if (response) await response.finished();
    } finally {
      finished();
    }
  });
  await openWorkspace(page);
  await addHousehold(page, "Reset Fixture Household", "E2E-RESET");
  await startVisit(page);
  const conversation = await beginText(
    page,
    "This synthetic household has three family members.",
  );
  await expect.poll(() => started).toBe(true);
  await conversation.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".app-sidebar nav button").nth(2).click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Reset Fixture Worker");
  await page
    .getByLabel("Assigned area", { exact: true })
    .fill("Reset Fixture Area");
  await page.locator("#app-language").selectOption("kn");
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await page
    .locator(".settings-group button")
    .filter({
      has: page.getByText(translate("kn", "Clear my entries"), { exact: true }),
    })
    .click();
  const reset = page.getByRole("dialog", {
    name: translate("kn", "Clear your entries?"),
    exact: true,
  });
  await reset
    .getByRole("button", {
      name: translate("kn", "Clear entries"),
      exact: true,
    })
    .click();
  await expect(page.locator(".household-card")).toHaveCount(5);
  release();
  await delivered;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.locator(".household-card").filter({ hasText: "E2E-RESET" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".household-card")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  for (const code of ["EX-001", "EX-002", "EX-003", "EX-004", "EX-005"])
    await expect(
      page.locator(".household-card").filter({ hasText: code }),
    ).toHaveCount(1);
  await page.locator(".app-sidebar nav button").nth(2).click();
  await expect(page.locator("#app-language")).toHaveValue("kn");
  await expect(
    page.getByLabel(translate("kn", "Your name"), { exact: true }),
  ).toHaveValue("Reset Fixture Worker");
  await expect(
    page.getByLabel(translate("kn", "Assigned area"), { exact: true }),
  ).toHaveValue("Reset Fixture Area");
});

test("full-conversation review waits for backfill and preserves edits made while its response is pending", async ({
  page,
}) => {
  test.setTimeout(60000);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let checks = 0;
  await page.route("**/api/extract", async (route) => {
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        baseRevision: survey.revision,
        result: { familySize: null, members: [], notes: [] },
      }),
    });
  });
  await page.route("**/api/reconcile", async (route) => {
    const { survey, segments } = route.request().postDataJSON() as {
      survey: Survey;
      segments: SurveyTranscript[];
    };
    checks++;
    if (checks === 1) await gate;
    const segment = segments[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        baseRevision: survey.revision,
        checkedSegmentIds: segments.map((item) => item.id),
        envelopes: [
          {
            surveyId: survey.id,
            segmentId: segment.id,
            segmentIndex: segment.index,
            baseRevision: survey.revision,
            mode: "reconcile",
            result: {
              familySize: null,
              members: [
                {
                  memberId: survey.members[0].id,
                  age: 30,
                  weight: 60,
                  phone: "9876543210",
                  relation: "father",
                  evidence: segment.text,
                  attribution: {
                    kind: "name",
                    reference: "Backfill Fixture Person",
                    evidence: segment.text,
                    segmentId: segment.id,
                  },
                },
              ],
              notes: [],
            },
          },
        ],
      }),
    });
  });
  await openWorkspace(page);
  await addHousehold(page, "Backfill Fixture Household", "E2E-BACKFILL");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("1");
  await section(page, "Family");
  await page.getByLabel(/^Full name/).fill("Backfill Fixture Person");
  const dialog = await beginText(
    page,
    "Backfill Fixture Person is the father, is 30 years old, weighs 60 kg and uses phone 9876543210.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Review");
  await expect.poll(() => checks).toBe(1);
  await expect(
    page.getByText("Checking the full conversation…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Age is required.", { exact: true })).toHaveCount(
    0,
  );
  await section(page, "Family");
  await page.getByLabel(/^Age/).fill("31");
  await page.getByLabel(/^Weight/).fill("63.05");
  await page.getByLabel("Phone number", { exact: true }).fill("1234567890");
  await page.getByLabel("Phone number", { exact: true }).fill("");
  release();
  await section(page, "Review");
  await expect(
    page.getByText("Conversation checked", { exact: true }),
  ).toBeVisible();
  await section(page, "Family");
  await expect(page.getByLabel(/^Age/)).toHaveValue("31");
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63.05");
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("combobox", { name: "Relationship", exact: true }),
  ).toHaveValue("father");
  await expect(
    page.getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("male");
  expect(checks).toBe(2);
});

test("finishing waits for a recovered conversation check and requires review of its new answers", async ({
  page,
}) => {
  test.setTimeout(60000);
  let checks = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/extract", async (route) => {
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        baseRevision: survey.revision,
        result: { familySize: null, members: [], notes: [] },
      }),
    });
  });
  await page.route("**/api/reconcile", async (route) => {
    const { survey, segments } = route.request().postDataJSON() as {
      survey: Survey;
      segments: SurveyTranscript[];
    };
    const call = ++checks;
    if (call === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Synthetic temporary check failure." },
        }),
      });
      return;
    }
    if (call === 2) await gate;
    const segment = segments[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        baseRevision: survey.revision,
        checkedSegmentIds: segments.map((item) => item.id),
        envelopes:
          call === 2
            ? [
                {
                  surveyId: survey.id,
                  segmentId: segment.id,
                  segmentIndex: segment.index,
                  baseRevision: survey.revision,
                  mode: "reconcile",
                  result: {
                    familySize: null,
                    members: [
                      {
                        memberId: survey.members[0].id,
                        relation: "father",
                        evidence: segment.text,
                        attribution: {
                          kind: "name",
                          reference: "Finishing Fixture Person",
                          evidence: segment.text,
                          segmentId: segment.id,
                        },
                      },
                    ],
                    notes: [],
                  },
                },
              ]
            : [],
      }),
    });
  });
  await openWorkspace(page);
  await addHousehold(page, "Finishing Fixture Household", "E2E-FINISH");
  await startVisit(page);
  await page.getByLabel(/^Family members/).fill("1");
  await section(page, "Family");
  await page.getByLabel(/^Full name/).fill("Finishing Fixture Person");
  await page.getByLabel(/^Age/).fill("35");
  const dialog = await beginText(
    page,
    "Finishing Fixture Person is the father.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Review");
  await expect(
    page.getByText("Conversation not checked", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I checked the conversation and answers manually.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect.poll(() => checks).toBe(2);
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeDisabled();
  const directory = page.locator(".app-sidebar nav button").first();
  if (await directory.isEnabled()) await directory.click();
  await expect(
    page.getByRole("navigation", { name: "Visit sections", exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText(
      "The conversation check updated this visit. Review the changes before finishing.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: "I have reviewed this visit.",
      exact: true,
    }),
  ).not.toBeChecked();
  await section(page, "Family");
  await expect(
    page.getByRole("combobox", { name: "Relationship", exact: true }),
  ).toHaveValue("father");
  await expect(
    page.getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("male");
  await section(page, "Review");
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
  expect(checks).toBe(3);
});
