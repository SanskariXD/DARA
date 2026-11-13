/** Canonical relationship values; no names or voices are used to infer sex. */
export const RELATIONSHIP_OPTIONS = [
  ["self", "Self"],
  ["husband", "Husband"],
  ["wife", "Wife"],
  ["spouse", "Spouse"],
  ["father", "Father"],
  ["mother", "Mother"],
  ["son", "Son"],
  ["daughter", "Daughter"],
  ["brother", "Brother"],
  ["sister", "Sister"],
  ["grandfather", "Grandfather"],
  ["grandmother", "Grandmother"],
  ["grandson", "Grandson"],
  ["granddaughter", "Granddaughter"],
  ["uncle", "Uncle"],
  ["aunt", "Aunt"],
  ["nephew", "Nephew"],
  ["niece", "Niece"],
  ["cousin-male", "Cousin · male"],
  ["cousin-female", "Cousin · female"],
  ["cousin", "Cousin"],
  ["father-in-law", "Father-in-law"],
  ["mother-in-law", "Mother-in-law"],
  ["son-in-law", "Son-in-law"],
  ["daughter-in-law", "Daughter-in-law"],
  ["brother-in-law", "Brother-in-law"],
  ["sister-in-law", "Sister-in-law"],
  ["parent", "Parent"],
  ["child", "Child"],
  ["sibling", "Sibling"],
  ["grandparent", "Grandparent"],
  ["grandchild", "Grandchild"],
  ["relative", "Other relative"],
  ["other", "Other"],
].map(([value, label]) => ({ value, label }));
const aliases: Record<string, string[]> = {
  self: ["self", "myself", "ಸ್ವತಃ", "ನಾನು", "मैं", "खुद", "నేను", "நான்", "ഞാൻ"],
  husband: [
    "husband",
    "pati",
    "ಗಂಡ",
    "ಗಂಡನ",
    "ಗಂಡನಿಗೆ",
    "ಪತಿ",
    "ಪತಿಗೆ",
    "ಯಜಮಾನ",
    "ಯಜಮಾನರು",
    "ಯಜಮಾನರಿಗೆ",
    "ಯಜಮಾನನಿಗೆ",
    "ಯಜಮಾನರ",
    "पति",
    "पति को",
    "पती",
    "భర్త",
    "கணவர்",
    "ഭർത്താവ്",
  ],
  wife: [
    "wife",
    "patni",
    "ಹೆಂಡತಿ",
    "ಹೆಂಡತಿಗೆ",
    "ಪತ್ನಿ",
    "ಪತ್ನಿಗೆ",
    "पत्नी",
    "बीवी",
    "భార్య",
    "மனைவி",
    "ഭാര്യ",
  ],
  father: [
    "father",
    "dad",
    "appa",
    "papa",
    "ಅಪ್ಪ",
    "ಅಪ್ಪನ",
    "ಅಪ್ಪನಿಗೆ",
    "ತಂದೆ",
    "ತಂದೆಗೆ",
    "पिता",
    "पापा",
    "बाप",
    "నాన్న",
    "తండ్రి",
    "அப்பா",
    "தந்தை",
    "അച്ഛൻ",
  ],
  mother: [
    "mother",
    "mum",
    "mom",
    "amma",
    "ಅಮ್ಮ",
    "ಅಮ್ಮನ",
    "ಅಮ್ಮನಿಗೆ",
    "ತಾಯಿ",
    "ತಾಯಿಗೆ",
    "माता",
    "माँ",
    "मां",
    "అమ్మ",
    "తల్లి",
    "அம்மா",
    "தாய்",
    "അമ്മ",
  ],
  son: ["son", "maga", "ಮಗ", "ಮಗನ", "ಮಗನಿಗೆ", "बेटा", "बेटे", "కొడుకు", "மகன்", "മകൻ"],
  daughter: [
    "daughter",
    "magalu",
    "ಮಗಳು",
    "ಮಗಳಿಗೆ",
    "बेटी",
    "కూతురు",
    "மகள்",
    "മകൾ",
  ],
  brother: [
    "brother",
    "anna",
    "thamma",
    "ಅಣ್ಣ",
    "ಅಣ್ಣನಿಗೆ",
    "ತಮ್ಮ",
    "ಸಹೋದರ",
    "भाई",
    "అన్న",
    "తమ్ముడు",
    "அண்ணன்",
    "தம்பி",
    "സഹോദരൻ",
  ],
  sister: [
    "sister",
    "akka",
    "thangi",
    "ಅಕ್ಕ",
    "ತಂಗಿ",
    "ಸಹೋದರಿ",
    "बहन",
    "అక్క",
    "చెల్లి",
    "அக்கா",
    "தங்கை",
    "സഹോദരി",
  ],
  grandfather: [
    "grandfather",
    "grand father",
    "ತಾತ",
    "ಅಜ್ಜ",
    "ದಾದಾ",
    "दादा",
    "नाना",
    "తాత",
    "தாத்தா",
    "മുത്തച്ഛൻ",
  ],
  grandmother: [
    "grandmother",
    "grand mother",
    "ಅಜ್ಜಿ",
    "दादी",
    "नानी",
    "అమ్మమ్మ",
    "నానమ్మ",
    "பாட்டி",
    "മുത്തശ്ശി",
  ],
  grandson: ["grandson", "ಮೊಮ್ಮಗ", "पोता", "नाती", "మనవడు", "பேரன்", "ചെറുമകൻ"],
  granddaughter: [
    "granddaughter",
    "ಮೊಮ್ಮಗಳು",
    "पोती",
    "नातिन",
    "మనవరాలు",
    "பேத்தி",
    "ചെറുമകൾ",
  ],
  uncle: [
    "uncle",
    "ಮಾಮ",
    "ಚಿಕ್ಕಪ್ಪ",
    "ದೊಡ್ಡಪ್ಪ",
    "चाचा",
    "मामा",
    "ताऊ",
    "మామయ్య",
    "சித்தப்பா",
    "അമ്മാവൻ",
  ],
  aunt: [
    "aunt",
    "aunty",
    "ಚಿಕ್ಕಮ್ಮ",
    "ದೊಡ್ಡಮ್ಮ",
    "ಮಾವಿ",
    "ಚाची",
    "मामी",
    "मौसी",
    "சித்தி",
    "அத்தை",
    "അമ്മായി",
  ],
  nephew: ["nephew", "ಸೋದರಳಿಯ", "भतीजा", "भांजा"],
  niece: ["niece", "ಸೋದರಸೊಸೆ", "भतीजी", "भांजी"],
  "cousin-male": [
    "cousin-male",
    "male cousin",
    "cousin brother",
    "ಚಿಕ್ಕಪ್ಪನ ಮಗ",
    "चचेरा भाई",
    "ममेरा भाई",
  ],
  "cousin-female": [
    "cousin-female",
    "female cousin",
    "cousin sister",
    "ಚಿಕ್ಕಪ್ಪನ ಮಗಳು",
    "चचेरी बहन",
    "ममेरी बहन",
  ],
  "father-in-law": ["father-in-law", "father in law", "ಮಾವನವರು", "ससुर"],
  "mother-in-law": ["mother-in-law", "mother in law", "सास"],
  "son-in-law": ["son-in-law", "son in law", "ಅಳಿಯ", "दामाद"],
  "daughter-in-law": ["daughter-in-law", "daughter in law", "ಸೊಸೆ", "बहू"],
  "brother-in-law": ["brother-in-law", "brother in law", "ಬಾವ", "देवर", "जीजा"],
  "sister-in-law": ["sister-in-law", "sister in law", "ಅತ್ತಿಗೆ", "भाभी", "ननद"],
  spouse: ["spouse", "partner"],
  parent: ["parent"],
  child: ["child"],
  sibling: ["sibling"],
  grandparent: ["grandparent"],
  grandchild: ["grandchild"],
  cousin: ["cousin"],
  relative: ["relative", "other relative"],
  other: ["other"],
};
export const normalizeIdentityText = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");
const lookup = new Map(
  Object.entries(aliases).flatMap(([canonical, words]) =>
    words.map((word) => [normalizeIdentityText(word), canonical] as const),
  ),
);
export function normalizeRelationship(value: string): string {
  return (
    lookup.get(normalizeIdentityText(value)) ?? value.trim().toLocaleLowerCase()
  );
}
export function relationshipSex(value: string): "female" | "male" | null {
  const relation = normalizeRelationship(value);
  if (
    [
      "husband",
      "father",
      "son",
      "brother",
      "grandfather",
      "grandson",
      "uncle",
      "nephew",
      "cousin-male",
      "father-in-law",
      "son-in-law",
      "brother-in-law",
    ].includes(relation)
  )
    return "male";
  if (
    [
      "wife",
      "mother",
      "daughter",
      "sister",
      "grandmother",
      "granddaughter",
      "aunt",
      "niece",
      "cousin-female",
      "mother-in-law",
      "daughter-in-law",
      "sister-in-law",
    ].includes(relation)
  )
    return "female";
  return null;
}
/** Unicode-aware token boundaries avoid matching e.g. “son” inside “Wilson”. */
export function containsIdentityReference(
  text: string,
  reference: string,
): boolean {
  const source = normalizeIdentityText(text),
    needle = normalizeIdentityText(reference);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{M}\\p{N}])${escaped}($|[^\\p{L}\\p{M}\\p{N}])`,
    "u",
  ).test(source);
}
export function mentionedRelationships(text: string): string[] {
  // Prefer longer compound relationships, so “cousin brother” is not brother.
  let remaining = normalizeIdentityText(text);
  const found = new Set<string>();
  const phrases = Object.entries(aliases)
    .flatMap(([relation, words]) =>
      words.map((word) => ({ relation, word: normalizeIdentityText(word) })),
    )
    .sort((a, b) => b.word.length - a.word.length);
  for (const { relation, word } of phrases) {
    if (containsIdentityReference(remaining, word)) {
      found.add(relation);
      remaining = remaining.split(word).join(" ");
    }
  }
  return [...found];
}
export function evidenceSupportsRelationship(
  text: string,
  relationship: string,
): boolean {
  return mentionedRelationships(text).some((mentioned) =>
    relationshipsCompatible(mentioned, relationship),
  );
}

/** Generic spouse and a gendered spouse are compatible, never husband and wife. */
export function relationshipsCompatible(left: string, right: string): boolean {
  const a = normalizeRelationship(left),
    b = normalizeRelationship(right);
  return (
    a === b ||
    (a === "spouse" && ["husband", "wife"].includes(b)) ||
    (b === "spouse" && ["husband", "wife"].includes(a))
  );
}
export function lastRelationshipReferenceIndex(
  text: string,
  relationship: string,
): number {
  const source = normalizeIdentityText(text);
  return Math.max(
    -1,
    ...Object.entries(aliases)
      .filter(([relation]) => relationshipsCompatible(relation, relationship))
      .flatMap(([, words]) =>
        words
          .filter((word) => containsIdentityReference(source, word))
          .map((word) => source.lastIndexOf(normalizeIdentityText(word))),
      ),
  );
}
