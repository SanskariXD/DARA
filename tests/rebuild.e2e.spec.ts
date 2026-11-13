import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type {
  Survey,
  SurveyExtractionResult,
  SurveyTranscript,
} from "../src/lib/survey";
import { translate, type AppLanguage } from "../src/lib/i18n";
import { decodeProviderWire } from "../src/lib/server/live-providers";

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
  await page.getByRole("button", { name: "New survey", exact: true }).click();
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
  const back = page.getByRole("button", {
    name: "Back to health overview",
    exact: true,
  });
  if (await back.count()) await back.click();
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

test("manual survey and immutable history lead to a repeat with verified identity and fresh health", async ({
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
    .getByLabel("Household phone number", { exact: true })
    .fill("9876543210");
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
  await expect(page.getByLabel(/^Weight/)).toHaveCount(0);
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0);
  await selectHealthMember(page, fixtureNames[0]);
  await page
    .getByRole("combobox", { name: "Health discussion", exact: true })
    .selectOption("concerns");
  await page.getByLabel(/^Weight/).pressSequentially("63.05");
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63.05");
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
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await capture(page, testInfo, "review-compact-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start a repeat visit", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirm household members",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".family-section")).toHaveCount(3);
  for (let index = 0; index < fixtureNames.length; index++)
    await expect(
      page
        .locator(".family-section")
        .nth(index)
        .getByLabel(/^Full name/),
    ).toHaveValue(fixtureNames[index]);
  await section(page, "Review");
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Finish visit", exact: true }),
  ).toBeDisabled();
  await section(page, "Family");
  await page
    .getByRole("checkbox", {
      name: "I confirmed who lives in this household.",
      exact: true,
    })
    .click();
  await section(page, "Household");
  await expect(page.getByLabel(/^Family members/)).toHaveValue("3");
  await expect(
    page.getByLabel("Household phone number", { exact: true }),
  ).toHaveValue("9876543210");
  await expect(page.getByLabel(/^Preferred visit time/)).toHaveCount(0);
  await selectHealthMember(page, fixtureNames[0]);
  await expect(
    page.getByRole("combobox", { name: "Health discussion", exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel(/^Weight/)).toHaveCount(0);
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveCount(0);
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
  await expect(
    page.getByLabel("Household phone number", { exact: true }),
  ).toHaveValue("9876543210");
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
  await selectHealthMember(page, fixtureNames[0]);
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63.05");
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
  await section(page, "Household");
  await page
    .getByLabel("Household phone number", { exact: true })
    .fill("9876543210");
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
  await section(page, "Household");
  await expect(
    page.getByLabel("Household phone number", { exact: true }),
  ).toHaveValue("9876543210");
  expect(requests).toEqual([]);
});

test("fresh English and Kannada extraction fills health and notes while preserving active and manual answers", async ({
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
    if (calls === 1 || calls === 2) {
      const english = calls === 1;
      const person = english ? "Extracted Fixture Person" : "ಪರೀಕ್ಷಾ ರವಿ";
      const introduction = english
        ? "My name is Extracted Fixture Person."
        : "ನನ್ನ ಹೆಸರು ಪರೀಕ್ಷಾ ರವಿ.";
      const health = english
        ? "I have a headache and I have BP."
        : "ನನಗೆ ಎರಡು ದಿನದಿಂದ ಕೆಮ್ಮು ಇದೆ.";
      const note = english
        ? "The household prefers morning visits."
        : "ನಾವು ನಲ್ಲಿಯಿಂದ ಕುಡಿಯುವ ನೀರು ತರುತ್ತೇವೆ.";
      result = decodeProviderWire(
        {
          familySize: english ? 3 : null,
          familySizeEvidence: english
            ? "There are three family members."
            : null,
          familySizeCorrection: null,
          members: [
            {
              memberId: null,
              slot: english ? 1 : 2,
              evidence: segment.text,
              uncertain: false,
              attribution: {
                kind: "name",
                reference: person,
                evidence: introduction,
                segmentId: segment.id,
              },
              corrections: [],
              fields: [
                { fieldId: "name", value: person, evidence: introduction },
                {
                  fieldId: "healthStatus",
                  value: "concerns",
                  evidence: health,
                },
                { fieldId: "healthHistory", value: health, evidence: health },
                ...(english
                  ? [
                      {
                        fieldId: "hypertension",
                        value: "yes",
                        evidence: health,
                      },
                    ]
                  : []),
              ],
            },
          ],
          householdFields: [
            { fieldId: "householdNotes", value: note, evidence: note },
          ],
          notes: [],
          uncertainties: [],
        },
        survey,
        segment,
      );
    } else if (calls === 3) {
      await secondResponse;
      result = {
        familySize: null,
        members: [
          {
            memberId: survey.members[0].id,
            name: "Suggested Fixture Name",
            age: 42,
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
    "There are three family members. My name is Extracted Fixture Person. I have a headache and I have BP. The household prefers morning visits.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel(/^Family members/)).toHaveValue("3");
  await selectHealthMember(page, "Extracted Fixture Person");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("I have a headache and I have BP.");
  await expect(
    page.getByRole("combobox", {
      name: "High blood pressure reported",
      exact: true,
    }),
  ).toHaveValue("yes");
  dialog = await beginText(
    page,
    "ನನ್ನ ಹೆಸರು ಪರೀಕ್ಷಾ ರವಿ. ನನಗೆ ಎರಡು ದಿನದಿಂದ ಕೆಮ್ಮು ಇದೆ. ನಾವು ನಲ್ಲಿಯಿಂದ ಕುಡಿಯುವ ನೀರು ತರುತ್ತೇವೆ.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await selectHealthMember(page, "ಪರೀಕ್ಷಾ ರವಿ");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("ನನಗೆ ಎರಡು ದಿನದಿಂದ ಕೆಮ್ಮು ಇದೆ.");
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "The household prefers morning visits.\nನಾವು ನಲ್ಲಿಯಿಂದ ಕುಡಿಯುವ ನೀರು ತರುತ್ತೇವೆ.",
  );
  await expect(page.locator(".survey-content textarea")).toHaveCount(1);
  await expect(page.locator(".captured-note")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await page
    .locator(".household-card")
    .filter({ hasText: "E2E-EXTRACT" })
    .click();
  await page
    .getByRole("button", { name: "Continue visit", exact: true })
    .click();
  await selectHealthMember(page, "Extracted Fixture Person");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("I have a headache and I have BP.");
  await selectHealthMember(page, "ಪರೀಕ್ಷಾ ರವಿ");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("ನನಗೆ ಎರಡು ದಿನದಿಂದ ಕೆಮ್ಮು ಇದೆ.");
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
    "Correction for Manual Fixture Name: the name is Suggested Fixture Name and the age is 42.",
  );
  await expect.poll(() => calls).toBe(3);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const age = first.getByLabel(/^Age/);
  await age.focus();
  const beforeBox = await age.boundingBox();
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
  await expect(age).toHaveValue("");
  await expect(age).toBeFocused();
  const afterBox = await age.boundingBox();
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
  await expect(
    page.getByText("Your edit is protected", { exact: true }),
  ).toHaveCount(0);
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
  expect(calls).toBe(4);
  await page.locator(".app-sidebar nav button").first().click();
  await addHousehold(page, "Synthetic Ajay Regression Household", "E2E-AJAY");
  await startVisit(page);
  let ajayCalls = 0;
  await page.route("**/api/extract", async (route) => {
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    const call = ++ajayCalls;
    const introduction = survey.transcripts.find((item) =>
      item.text.includes("My name is Ajay."),
    )!;
    const fields =
      call === 1
        ? [
            { fieldId: "name", value: "Ajay", evidence: "My name is Ajay." },
            {
              fieldId: "relation",
              value: "self",
              evidence: "My name is Ajay.",
            },
            { fieldId: "sex", value: "male", evidence: "I am the husband." },
          ]
        : call === 2
          ? [
              {
                fieldId: "name",
                value: "Anisha",
                evidence: "My wife's name is Anisha.",
              },
              {
                fieldId: "relation",
                value: "wife",
                evidence: "My wife's name is Anisha.",
              },
              { fieldId: "age", value: "20", evidence: "Her age is 20." },
              {
                fieldId: "sex",
                value: "male",
                evidence: "My wife's name is Anisha.",
              },
            ]
          : call === 3
            ? [{ fieldId: "age", value: "21", evidence: segment.text }]
            : call === 4
              ? [
                  {
                    fieldId: "healthStatus",
                    value: "concerns",
                    evidence: segment.text,
                  },
                  {
                    fieldId: "healthHistory",
                    value: segment.text,
                    evidence: segment.text,
                  },
                  { fieldId: "feverDays", value: "7", evidence: segment.text },
                ]
              : [
                  {
                    fieldId: "healthHistory",
                    value: segment.text,
                    evidence: segment.text,
                  },
                  {
                    fieldId: "breathingDifficulty",
                    value: "yes",
                    evidence: segment.text,
                  },
                ];
    const result = decodeProviderWire(
      {
        familySize: call === 1 ? 2 : null,
        familySizeEvidence: call === 1 ? "There are two family members." : null,
        familySizeCorrection: null,
        members: [
          {
            memberId: call <= 2 ? null : survey.members[0].id,
            slot: call === 2 ? 2 : 1,
            fields,
            evidence: segment.text,
            uncertain: false,
            attribution: {
              kind: call <= 2 ? "introduction" : "context",
              reference: call === 2 ? "Anisha" : "Ajay",
              evidence:
                call === 2 ? "My wife's name is Anisha." : "My name is Ajay.",
              segmentId: call === 2 ? segment.id : introduction.id,
            },
            corrections: [],
          },
        ],
        householdFields: [],
        notes: [],
        uncertainties: [],
      },
      survey,
      segment,
    );
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
  for (const text of [
    "There are two family members. My name is Ajay. I am the husband.",
    "My wife's name is Anisha. Her age is 20.",
    "My age is 21.",
    "I have fever since a week.",
    "I am experiencing difficulty in breathing also.",
  ]) {
    const entry = await beginText(page, text);
    await expect(
      entry.getByLabel("Add conversation text", { exact: true }),
    ).toHaveValue("");
    await entry.getByRole("button", { name: "Close dialog" }).click();
  }
  await saved(page);
  await page.reload();
  await page.locator(".household-card").filter({ hasText: "E2E-AJAY" }).click();
  await page
    .getByRole("button", { name: "Continue visit", exact: true })
    .click();
  await section(page, "Family");
  const ajay = page.getByRole("region", { name: "Ajay", exact: true }),
    wife = page.getByRole("region", { name: "Anisha", exact: true });
  await expect(ajay.getByLabel(/^Age/)).toHaveValue("21");
  await expect(wife.getByLabel(/^Age/)).toHaveValue("20");
  await expect(
    wife.getByRole("combobox", { name: "Relationship", exact: true }),
  ).toHaveValue("wife");
  await expect(
    wife.getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("female");
  await selectHealthMember(page, "Ajay");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue(
    "I have fever since a week.\nI am experiencing difficulty in breathing also.",
  );
  await expect(page.getByLabel(/^Fever duration/)).toHaveValue("7");
  await expect(
    page.getByRole("combobox", {
      name: "Breathing difficulty reported",
      exact: true,
    }),
  ).toHaveValue("yes");
  await selectHealthMember(page, "Anisha");
  await expect(
    page.getByRole("combobox", { name: "Health discussion", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      /changed in another tab|newer version of this survey is open/i,
    ),
  ).toHaveCount(0);
  expect(ajayCalls).toBe(5);
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

test("pregnancy follow-up is gated, preserves prior care, schedules fourteen days and verifies identity before fresh monsoon care", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date("2026-11-14T10:00:00.000Z") });
  await openWorkspace(page);
  await addHousehold(page, "Health Navigation Fixture", "E2E-HEALTH");
  await expect(
    page.getByRole("button", { name: "Pregnancy follow-up", exact: true }),
  ).toHaveCount(0);
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
  await expect(
    page.getByLabel("Next planned care visit", { exact: true }),
  ).toHaveValue("2026-11-28");
  await page
    .getByLabel("Next planned care visit", { exact: true })
    .fill("2026-12-03");
  await page.getByLabel(/^Pregnancy duration/).fill("11");
  await noOverflow(page);
  await capture(page, testInfo, "health-expanded-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section(page, "Review");
  const issue = page
    .locator(".review-issues > div")
    .filter({ hasText: /pregnancy duration.*between 0 and 10/i });
  await expect(issue).toHaveCount(1);
  await expect(issue).toContainText("Fixture Mother");
  await issue.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Fixture Mother", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Pregnancy duration/)).toBeFocused();
  await page.getByLabel(/^Pregnancy duration/).fill("5");
  await page
    .getByRole("combobox", {
      name: "Mother and Child Protection card",
      exact: true,
    })
    .selectOption("has-card");
  await page
    .getByLabel("Food and nutrition reported", { exact: true })
    .fill("Synthetic report: rice, vegetables and lentils.");
  await page.getByLabel("Injections received", { exact: true }).fill("1");
  await page
    .getByRole("checkbox", { name: "MCP card discussed", exact: true })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Nutrition and supplements discussed",
      exact: true,
    })
    .check();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await capture(page, testInfo, "pregnancy-care-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await section(page, "Review");
  await expect(
    page.getByText(/pregnancy duration.*between 0 and 10/i),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to households", exact: true })
    .click();
  await page
    .locator(".household-card")
    .filter({ hasText: "E2E-HEALTH" })
    .click();
  await page
    .getByRole("button", { name: "Pregnancy follow-up", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirm household members",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I confirmed who lives in this household.",
      exact: true,
    })
    .click();
  await selectHealthMember(page, "Fixture Mother");
  await expect(
    page.getByText(
      "Previous care details are shown for reference. Review and update them for this visit.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel(/^Pregnancy duration/)).toHaveValue("5");
  await expect(
    page.getByRole("combobox", {
      name: "Mother and Child Protection card",
      exact: true,
    }),
  ).toHaveValue("has-card");
  await expect(
    page.getByLabel("Next planned care visit", { exact: true }),
  ).toHaveValue("2026-11-28");
  await expect(
    page.getByRole("checkbox", { name: "MCP card discussed", exact: true }),
  ).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await capture(page, testInfo, "pregnancy-followup-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section(page, "Review");
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to households", exact: true })
    .click();
  await page
    .locator(".household-card")
    .filter({ hasText: "E2E-HEALTH" })
    .click();
  await page
    .getByRole("button", { name: "Monsoon visit", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Rainy-season visit");
  await expect(
    page.getByRole("heading", {
      name: "Confirm household members",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I confirmed who lives in this household.",
      exact: true,
    })
    .click();
  await section(page, "Health");
  await expect(page.locator(".health-member-row")).toHaveCount(2);
  await expect(
    page.locator(".health-member-row").filter({ hasText: "Fixture Mother" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Stagnant water nearby", exact: true })
    .selectOption("yes");
  await page
    .getByLabel("Water collection locations", { exact: true })
    .fill("Synthetic report: beside the back wall.");
  await page
    .getByRole("checkbox", {
      name: "Standing water prevention discussed",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Mosquito prevention discussed",
      exact: true,
    })
    .check();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await capture(page, testInfo, "rainy-care-390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectHealthMember(page, "Fixture Mother");
  await expect(
    page.getByRole("combobox", { name: "Health discussion", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/^Pregnancy duration/)).toHaveCount(0);
  await section(page, "Review");
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All recorded.", exact: true }),
  ).toBeVisible();
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
    const stepLabelOverflow = await page
      .locator(".survey-progress button")
      .evaluateAll((buttons) =>
        buttons.flatMap((button) => {
          const label = button.querySelector("strong");
          if (!label) return [{ label: "Missing step label" }];
          const bounds = button.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(label);
          return [...text.getClientRects()]
            .filter(
              (line) =>
                line.width > 0 &&
                (line.left < bounds.left - 1 || line.right > bounds.right + 1),
            )
            .map((line) => ({
              label: label.textContent,
              textLeft: line.left,
              textRight: line.right,
              buttonLeft: bounds.left,
              buttonRight: bounds.right,
            }));
        }),
      );
    expect(
      stepLabelOverflow,
      `${language} survey labels fit their steps`,
    ).toEqual([]);
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

test("simultaneous extraction, backfill and manual saves keep the latest answers without false other-tab errors", async ({
  page,
}) => {
  test.setTimeout(60000);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let checks = 0,
    liveCalls = 0;
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  let releaseLive: () => void = () => {};
  const liveGate = new Promise<void>((resolve) => {
    releaseLive = resolve;
  });
  await page.route("**/api/extract", async (route) => {
    const { survey, segment } = route.request().postDataJSON() as {
      survey: Survey;
      segment: SurveyTranscript;
    };
    const liveCall = ++liveCalls;
    if (liveCall === 2) await liveGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        surveyId: survey.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        baseRevision: survey.revision,
        result: {
          familySize: null,
          members:
            liveCall === 2
              ? [
                  {
                    memberId: survey.members[0].id,
                    healthHistory: segment.text,
                    evidence: segment.text,
                    attribution: {
                      kind: "name",
                      reference: "Backfill Fixture Person",
                      evidence: segment.text,
                      segmentId: segment.id,
                    },
                  },
                ]
              : [],
          notes: [],
        },
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
              householdFields: [
                {
                  fieldId: "householdPhone",
                  value: "9876543210",
                  evidence: segment.text,
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
    page.getByText("Checking the conversation for these answers…", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Age is required.", { exact: true }),
  ).toBeVisible();
  await section(page, "Family");
  await page.getByLabel(/^Age/).fill("31");
  await selectHealthMember(page, "Backfill Fixture Person");
  await page
    .getByRole("combobox", { name: "Health discussion", exact: true })
    .selectOption("concerns");
  await page.getByLabel(/^Weight/).fill("63.05");
  await section(page, "Household");
  await page
    .getByLabel("Household phone number", { exact: true })
    .fill("1234567890");
  await page.getByLabel("Household phone number", { exact: true }).fill("");
  const liveDialog = await beginText(
    page,
    "Backfill Fixture Person reports a cough.",
  );
  await expect.poll(() => liveCalls).toBe(2);
  await liveDialog.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Notes");
  await page
    .getByLabel("Household notes", { exact: true })
    .fill("Manual note entered while both requests were pending.");
  releaseLive();
  release();
  await section(page, "Review");
  await expect.poll(() => checks).toBe(2);
  await section(page, "Family");
  await expect(page.getByLabel(/^Age/)).toHaveValue("31");
  await expect(
    page.getByRole("combobox", { name: "Relationship", exact: true }),
  ).toHaveValue("father");
  await expect(
    page.getByRole("combobox", { name: "Sex", exact: true }),
  ).toHaveValue("male");
  await selectHealthMember(page, "Backfill Fixture Person");
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63.05");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("Backfill Fixture Person reports a cough.");
  await section(page, "Household");
  await expect(
    page.getByLabel("Household phone number", { exact: true }),
  ).toHaveValue("");
  expect(checks).toBe(2);
  await saved(page);
  await expect(
    page.getByText(
      /changed in another tab|newer version of this survey is open|could not be saved/i,
    ),
  ).toHaveCount(0);
  await page.reload();
  await page
    .locator(".household-card")
    .filter({ hasText: "E2E-BACKFILL" })
    .click();
  await page
    .getByRole("button", { name: "Continue visit", exact: true })
    .click();
  await section(page, "Family");
  await expect(page.getByLabel(/^Age/)).toHaveValue("31");
  await selectHealthMember(page, "Backfill Fixture Person");
  await expect(page.getByLabel(/^Weight/)).toHaveValue("63.05");
  await expect(
    page.getByLabel("Reported symptoms and health history", { exact: true }),
  ).toHaveValue("Backfill Fixture Person reports a cough.");
  await section(page, "Notes");
  await expect(page.getByLabel("Household notes", { exact: true })).toHaveValue(
    "Manual note entered while both requests were pending.",
  );
  expect(browserErrors).toEqual([]);
});

test("transient conversation checks retry automatically and Finish reviews recovered answers without an extra acknowledgment", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install();
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
  const firstFailure = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/reconcile") && response.status() === 503,
  );
  const dialog = await beginText(
    page,
    "Finishing Fixture Person is the father.",
  );
  await expect(
    dialog.getByLabel("Add conversation text", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Review");
  await (await firstFailure).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("checkbox", {
      name: "I checked the conversation and answers manually.",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Conversation not checked", { exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => checks).toBe(1);
  await page.clock.fastForward(21000);
  await expect.poll(() => checks).toBe(2);
  await page
    .getByRole("checkbox", { name: "I have reviewed this visit.", exact: true })
    .check();
  await page.getByRole("button", { name: "Finish visit", exact: true }).click();
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
