import type { SurveyAnswerRecord, SurveyFieldDefinition } from "./survey";

export const PREGNANCY_CHECKLIST_IDS = [
  "careMcpDiscussed",
  "careInjectionsDiscussed",
  "careNutritionDiscussed",
  "careAncDiscussed",
  "careBirthPlanDiscussed",
  "carePostnatalDiscussed",
] as const;
export const RAINY_CHECKLIST_IDS = [
  "rainyFeverDiscussed",
  "rainyWaterDiscussed",
  "rainyMosquitoDiscussed",
  "rainyReferralDiscussed",
] as const;
export const PREGNANCY_FIELD_IDS = [
  "pregnancyStatus",
  "maternalStage",
  "pregnancyMonths",
  "pregnancyWeeks",
  "mcpCardStatus",
  "pregnancyNutrition",
  "pregnancySupplements",
  "pregnancyInjections",
  "pregnancyInjectionCount",
  "lastAncVisit",
  "nextCareVisit",
  "careFacility",
  "deliveryDate",
  ...PREGNANCY_CHECKLIST_IDS,
] as const;
export const RAINY_FIELD_IDS = [
  "stagnantWater",
  "waterLocations",
  ...RAINY_CHECKLIST_IDS,
] as const;
export const CARE_CHECKLIST_IDS: readonly string[] = [
  ...PREGNANCY_CHECKLIST_IDS,
  ...RAINY_CHECKLIST_IDS,
];
const options = (pairs: string[][]) =>
  pairs.map(([value, label]) => ({ value, label }));
const memberField = (
  id: string,
  label: string,
  type: SurveyFieldDefinition["type"] = "textarea",
  extra: Partial<SurveyFieldDefinition> = {},
): SurveyFieldDefinition => ({
  id,
  label,
  type,
  scope: "member",
  section: "health",
  required: false,
  ...extra,
});
const checklist = (
  id: string,
  label: string,
  scope: "household" | "member",
): SurveyFieldDefinition => ({
  id,
  label,
  scope,
  section: scope === "household" ? "household" : "health",
  type: "select",
  required: false,
  options: options([
    ["done", "Discussed"],
    ["pending", "Not yet discussed"],
  ]),
});
export const PREGNANCY_CARE_FIELDS: SurveyFieldDefinition[] = [
  memberField("maternalStage", "Maternal care stage", "select", {
    options: options([
      ["pregnant", "Pregnant"],
      ["postnatal", "After delivery"],
    ]),
  }),
  memberField("pregnancyMonths", "Pregnancy duration", "number", {
    unit: "months",
  }),
  memberField("mcpCardStatus", "Mother and Child Protection card", "select", {
    options: options([
      ["has-card", "Has a card"],
      ["needs-card", "Needs a card"],
      ["unknown", "Not known"],
    ]),
  }),
  memberField("pregnancyNutrition", "Food and nutrition reported"),
  memberField("pregnancySupplements", "Supplements reported"),
  memberField("pregnancyInjections", "Pregnancy injections reported"),
  memberField("pregnancyInjectionCount", "Injections received", "number"),
  memberField("lastAncVisit", "Last antenatal visit", "text"),
  memberField("nextCareVisit", "Next planned care visit", "text"),
  memberField("careFacility", "Care facility", "text"),
  memberField("deliveryDate", "Delivery date reported", "text"),
  ...PREGNANCY_CHECKLIST_IDS.map((id, index) =>
    checklist(
      id,
      [
        "MCP card discussed",
        "Injections discussed",
        "Nutrition and supplements discussed",
        "Antenatal visits discussed",
        "Birth plan discussed",
        "Postnatal care discussed",
      ][index],
      "member",
    ),
  ),
];
export const RAINY_SEASON_FIELDS: SurveyFieldDefinition[] = [
  {
    id: "stagnantWater",
    label: "Stagnant water nearby",
    scope: "household",
    section: "household",
    type: "select",
    required: false,
    options: options([
      ["yes", "Yes"],
      ["no", "No"],
      ["unknown", "Not known"],
    ]),
  },
  {
    id: "waterLocations",
    label: "Water collection locations",
    scope: "household",
    section: "household",
    type: "textarea",
    required: false,
  },
  ...RAINY_CHECKLIST_IDS.map((id, index) =>
    checklist(
      id,
      [
        "Fever care discussed",
        "Standing water prevention discussed",
        "Mosquito prevention discussed",
        "Seeking care discussed",
      ][index],
      "household",
    ),
  ),
];
export function isPregnancyCareRelevant(record: SurveyAnswerRecord): boolean {
  return (
    record.values.pregnancyStatus === "yes" ||
    record.values.maternalStage === "pregnant" ||
    record.values.maternalStage === "postnatal" ||
    PREGNANCY_FIELD_IDS.some(
      (id) =>
        !["pregnancyStatus", ...PREGNANCY_CHECKLIST_IDS].includes(id) &&
        record.values[id] != null &&
        String(record.values[id]).trim() !== "",
    )
  );
}
/** A topic or a future plan alone cannot mark counselling as completed. */
export function hasCompletedCounsellingEvidence(
  evidence: string,
  fieldId?: string,
): boolean {
  const topics: Record<string, RegExp> = {
    careMcpDiscussed: /mcp|card|ಕಾರ್ಡ್|कार्ड|కార్డు|அட்டை|കാർഡ്/iu,
    careInjectionsDiscussed:
      /inject|vaccin|\btd\b|\btt\b|ಲಸಿಕೆ|ಚುಚ್ಚು|ಇಂಜೆಕ್ಷನ್|टीक|इंजेक्शन|టీకా|సూది|தடுப்பூசி|ஊசி|കുത്തിവെപ്പ്/iu,
    careNutritionDiscussed:
      /nutri|food|diet|supplement|iron|folic|calcium|ಆಹಾರ|ಪೌಷ್ಟಿಕ|ಪೋಷಣ|ಮಾತ್ರೆ|पोषण|आहार|भोजन|गोली|ఆహార|పోషక|உணவு|ஊட்டச்சத்து|ഭക്ഷണ|പോഷക/iu,
    careAncDiscussed:
      /antenatal|\banc\b|visit|check.?up|ತಪಾಸಣೆ|ಪರೀಕ್ಷೆ|ಭೇಟಿ|जांच|जाँच|प्रसवपूर्व|పరీక్ష|பரிசோதனை|പരിശോധന/iu,
    careBirthPlanDiscussed:
      /birth|delivery|ಪ್ರಸವ|ಹೆರಿಗೆ|प्रसव|डिलीवरी|ప్రసవ|பிரசவ|പ്രസവ/iu,
    carePostnatalDiscussed:
      /postnatal|after delivery|ಹೆರಿಗೆ ನಂತರ|ಪ್ರಸವದ ನಂತರ|प्रसव के बाद|ప్రసవం తర్వాత|பிரசவத்திற்குப் பிறகு|പ്രസവശേഷം/iu,
    rainyFeverDiscussed: /fever|ಜ್ವರ|बुखार|జ్వర|காய்ச்சல்|പനി/iu,
    rainyWaterDiscussed:
      /water|drain|container|saucer|bucket|tyre|tire|ನೀರ|ನೀರು|ಚರಂಡಿ|पानी|जल|నీటి|నీరు|தண்ணீர்|நீர்|വെള്ള/iu,
    rainyMosquitoDiscussed: /mosquito|net|ಸೊಳ್ಳೆ|ಮಚ್ಚರ|मच्छर|దోమ|கொசு|കൊതുക/iu,
    rainyReferralDiscussed:
      /seek|refer|clinic|hospital|doctor|care|ಆಸ್ಪತ್ರೆ|ವೈದ್ಯ|ಚಿಕಿತ್ಸೆ|अस्पताल|डॉक्टर|चिकित्स|వైద్య|ఆసుపత్రి|மருத்துவ|ആശുപത്രി|ഡോക്ടർ/iu,
  };
  // Speaker labels are transcript formatting, not part of the spoken question.
  // Strip recognized worker labels while retaining patient statements verbatim.
  const text = evidence
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /(^|[.?!;\n]\s*)(?:asha(?: worker)?|anm|health worker|community health worker|worker|nurse|ಆಶಾ(?: ಕಾರ್ಯಕರ್ತೆ)?|आशा(?: कार्यकर्ता)?)\s*[:：]\s*/giu,
      "$1",
    );
  if (
    /(?:^|[?.!]\s*)(?:have|has|had|did|will|can|could)\s+.{0,45}\b(?:discuss|explain|advise|counsel|talk about)|ಚರ್ಚಿಸಿದ್ದೀರಾ|ವಿವರಿಸಿದ್ದೀರಾ|क्या.{0,25}(?:समझाया|चर्चा)/iu.test(
      text,
    )
  )
    return false;
  const clauses = text.split(
    /[.!;\n।]|\b(?:but|and)\s+(?=(?:i|we|she|he|the worker)\b)/iu,
  );
  return clauses.some((clause) => {
    if (
      /\b(?:will|shall|plan(?:ned)? to|need(?:s)? to|should)\s+(?:discuss|explain|advise|counsel|talk)\b|\b(?:not|never)\s+(?:yet\s+)?(?:discussed|explained|advised|counselled|counseled)\b|\b(?:did not|haven.t|hasn.t|didn.t)\s+(?:discuss|explain|advise|counsel)|ವಿವರಿಸಬೇಕು|ಚರ್ಚಿಸಬೇಕು|ನಂತರ ವಿವರಿಸ|ಚರ್ಚಿಸಿಲ್ಲ|ವಿವರಿಸಿಲ್ಲ|चर्चा करेंगे|समझाएंगे|समझाना है|बताएंगे|नहीं समझाया|नहीं बताया|ಚರ್ಚಿಸಿರಲಿಲ್ಲ/u.test(
        clause,
      )
    )
      return false;
    const completed =
      /\b(discussed|explained|advised|counselled|counseled|reviewed|demonstrated|taught)\b|ವಿವರಿಸಿ(?:ದೆ|ದ್ದ|ದ್ವಿ)|ತಿಳಿಸಿ(?:ದೆ|ದ್ದ)|ಚರ್ಚಿಸಿ(?:ದೆ|ದ್ದ)|ಸಲಹೆ ನೀಡಿ(?:ದೆ|ದ್ದ)|समझाया|बताया|चर्चा की|सलाह दी|వివరించా|తెలిపా|చర్చించా|விளக்கின|ஆலோசனை வழங்க|വിശദീകരിച്ചു|ചർച്ച ചെയ്തു/u.test(
        clause,
      );
    const directAdvice =
      /(?:^|[:,]\s*)\s*(?:(?:you should|you must|you need to|please|do not|don.t)\s+)?(?:include|let|bring|take|attend|visit|go to|seek|contact|call|empty|scrub|cover|remove|clean|use|keep|drink|eat|avoid|remember|wash|wear|check)\b|ನೋಡಿಕೊಳ್ಳಬೇಕು|ತಿನ್ನಬೇಕು|ತನ್ನಿ|ತರಬೇಕು|ತೆಗೆದುಕೊಳ್ಳಿ|ಹೋಗಿ|ಸಂಪರ್ಕಿಸಿ|ಸ್ವಚ್ಛಗೊಳಿಸಿ|ಮುಚ್ಚಿ|ಖಾಲಿ ಮಾಡಿ|ಬಳಸಿ|ಸೇವಿಸಿ|ತಿನ್ನಿ|ಲಾಯें|लाएं|लीजिए|करें|रखें|जाइए|తీసుకోండి|శుభ్రం చేయండి|மூடுங்கள்|கொண்டு வாருங்கள்|വൃത്തിയാക്കുക/iu.test(
        clause,
      );
    const directInquiry =
      /^\s*(?:(?:do|does|did|have|has|are|is|can)\s+(?:you|they|he|she|anyone|anybody|there|the)\b|(?:when|where|how|any|what)\b)|ಇದೆಯಾ|ಇದೆಯೇ|ಇದ್ದಾರಾ|ಇದೆಯೆ|ತೆಗೆದುಕೊಂಡಿದ್ದೀರಾ|ಹೋಗಿದ್ದೀರಾ|ಎಷ್ಟು|ಯಾವಾಗ|ಎಲ್ಲಿ|क्या|कब|कहाँ|कितने|ఎప్పుడు|ఉందా|எப்போது|இருக்கிறதா|ഉണ്ടോ/iu.test(
        clause,
      );
    return (
      (completed || directAdvice || directInquiry) &&
      (!fieldId || !topics[fieldId] || topics[fieldId].test(clause))
    );
  });
}
/** Values stored by DARA are Celsius; conversion must be supported by an explicit spoken unit. */
export function hasExplicitTemperatureUnit(evidence: string): boolean {
  return /°\s*[cf]\b|\b(?:celsius|centigrade|fahrenheit|degrees?\s*[cf])\b|ಸೆಲ್ಸಿಯಸ್|ಫ್ಯಾರನ್[ಹ್]?ಹೀಟ್|फारेनहाइट|फ़ारेनहाइट|सेल्सियस|సెల్సియస్|ఫారెన్‌హీట్|செல்சியஸ்|பாரன்ஹீட்|സെൽഷ്യസ്|ഫാരൻഹീറ്റ്/iu.test(
    evidence,
  );
}
