"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { LanguageProvider, useLanguage } from "@/lib/i18n-react";
import {
  translate,
  translateFieldLabel,
  translateOptionLabel,
  translateMessage,
  localeTag,
  LANGUAGE_OPTIONS,
  type AppLanguage,
} from "@/lib/i18n";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  House,
  Info,
  LockKeyhole,
  MapPin,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import { useSurveys } from "@/hooks/use-surveys";
import { useRecorder } from "@/hooks/use-recorder";
import { useSurveyReconciliation } from "@/hooks/use-survey-reconciliation";
import {
  addCustomSurveyField,
  addSurveyMember,
  addSurveyTranscript,
  applySurveyExtraction,
  completeSurvey,
  createSurvey,
  createRainySurveyFromPrior,
  editSurveyField,
  getMemberHealthStatus,
  isSurveyFieldVisible,
  isPregnancyCareRelevant,
  PREGNANCY_FIELD_IDS,
  PREGNANCY_CHECKLIST_IDS,
  RAINY_FIELD_IDS,
  RAINY_CHECKLIST_IDS,
  migrateDraftSurvey,
  removeSurveyMember,
  resolveSurveyConflict,
  resolveSurveyUncertainty,
  reviewSurvey,
  reviewSurveyNote,
} from "@/lib/survey";
import type {
  Survey,
  SurveyAnswerRecord,
  SurveyFieldDefinition,
  SurveyMember,
  SurveyReviewIssue,
  SurveyTranscript,
  SurveyValue,
} from "@/lib/survey";
import type { SurveyHousehold, SurveySettings } from "@/lib/survey-db";
import { extractSurvey } from "@/lib/survey-extraction-client";

type Tab = "households" | "visits" | "settings";
type View = Tab | "household" | "survey" | "finished";
type Step = "household" | "family" | "health" | "notes" | "review";
type Dialog =
  | "access"
  | "add-household"
  | "edit-household"
  | "custom-field"
  | "consent"
  | "transcript"
  | "install"
  | "delete-household"
  | "reset-entries"
  | null;
type ReviewReport = {
  id: string;
  memberId: string | null;
  messages: string[];
  controlledMessages: string[];
  evidence: string[];
  uncertaintyIds: string[];
  noteIds: string[];
};
const STEPS: { id: Step; label: string }[] = [
  { id: "household", label: "Household" },
  { id: "family", label: "Family" },
  { id: "health", label: "Health" },
  { id: "notes", label: "Notes" },
  { id: "review", label: "Review" },
];
const NAV = [
  { id: "households", label: "Households", icon: House },
  { id: "visits", label: "Visits", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
const date = (value: string, language: AppLanguage = "en") =>
  new Intl.DateTimeFormat(localeTag(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const valueText = (
  value: SurveyValue | undefined,
  language: AppLanguage = "en",
) =>
  value === null || value === undefined || value === ""
    ? translate(language, "Not recorded")
    : typeof value === "boolean"
      ? translate(language, value ? "Yes" : "No")
      : typeof value === "number"
        ? new Intl.NumberFormat(localeTag(language)).format(value)
        : String(value);
const memberName = (
  member: SurveyMember,
  index: number,
  language: AppLanguage = "en",
) =>
  String(
    member.values.name ||
      translate(language, "Family member {count}", { count: index + 1 }),
  );
const healthStatusLabel = (
  member: SurveyMember,
  language: AppLanguage = "en",
) => {
  const status = getMemberHealthStatus(member);
  return translate(
    language,
    status === "no-concerns"
      ? "No concerns reported"
      : status === "concerns"
        ? "Concerns reported"
        : "Not discussed",
  );
};
const fieldValueText = (
  field: SurveyFieldDefinition | undefined,
  value: SurveyValue | undefined,
  language: AppLanguage = "en",
) => {
  const option = field?.options?.find(
    (option) => option.value === String(value),
  );
  return field && option
    ? translateOptionLabel(language, field, option)
    : valueText(value, language);
};
const iconInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Brand({ onClick }: { onClick?: () => void }) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <button
      className="dara-brand"
      onClick={onClick}
      aria-label={t("DARA home")}
    >
      <svg
        width="29"
        height="32"
        viewBox="0 0 29 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 25.8 15.5 5.4a2.7 2.7 0 0 1 4.7 2.7L8.8 28.4A2.7 2.7 0 0 1 4 25.8Z"
          fill="currentColor"
        />
        <path
          d="m18.5 19.5 5.3 8.8a2.1 2.1 0 0 0 3.7-2.1l-5.3-8.8a2.1 2.1 0 0 0-3.7 2.1Z"
          fill="currentColor"
          opacity=".55"
        />
      </svg>
      <span>DARA</span>
    </button>
  );
}
function Button({
  children,
  onClick,
  kind = "primary",
  className = "",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`button ${kind} ${className}`}
    >
      {children}
    </button>
  );
}
function Sheet({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const close = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el?.addEventListener("cancel", close);
    return () => {
      el?.removeEventListener("cancel", close);
      el?.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-label={t(title)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-handle" />
      <header>
        <h2>{t(title)}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close dialog")}
        >
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Empty({
  title,
  children,
  action,
  icon: Icon = House,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: typeof House;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Icon size={34} strokeWidth={1.35} />
      </span>
      <h2>{t(title)}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function PhonePreview() {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <div
      className="phone-preview"
      aria-label={t("Preview of DARA’s blank household visit form")}
    >
      <div className="phone-camera" />
      <div className="phone-status">
        <span>9:41</span>
        <span>••• ▰</span>
      </div>
      <div className="phone-screen">
        <div className="phone-top">
          <ArrowLeft size={18} />
          <span>{t("Household visit")}</span>
          <MoreHorizontal size={20} />
        </div>
        <div className="phone-steps">
          <b>01</b>
          <span>02</span>
          <span>03</span>
          <span>04</span>
          <span>05</span>
        </div>
        <h3>
          {t("Let’s start")}
          <br />
          {t("with the family.")}
        </h3>
        <p>{t("How many people live in this household?")}</p>
        <div className="phone-field">
          <span>{t("Family members")}</span>
          <strong>{t("Enter a number")}</strong>
          <UsersRound size={21} />
        </div>
        <div className="phone-note">
          <Mic size={20} />
          <span>
            {t("Ask naturally.")}
            <br />
            {t("Keep the conversation going.")}
          </span>
        </div>
        <div className="phone-bottom">
          {t("Continue")} <ArrowRight size={16} />
        </div>
      </div>
      <div className="phone-home" />
    </div>
  );
}
function Landing({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <div className="landing" id="dara-top">
      <header className="landing-nav">
        <Brand
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <nav aria-label={t("Introduction")}>
          <a href="#how-it-works">{t("How it works")}</a>
          <a href="#your-workspace">{t("Your workspace")}</a>
        </nav>
        <Button onClick={onOpen} disabled={busy}>
          {t("Open workspace")} <ArrowRight size={17} />
        </Button>
      </header>
      <main>
        <section className="landing-hero">
          <span className="intro-label">
            {t("A helping hand for ASHA workers")}
          </span>
          <h1>
            <span>{t("Less paperwork.")}</span>
            <br />
            {t("More time with families.")}
          </h1>
          <p>
            {t("A conversation can hold everything you need.")}
            <br className="desktop-only" />{" "}
            {t("DARA helps you turn it into a clear, complete visit record.")}
          </p>
          <div className="hero-actions">
            <Button onClick={onOpen} disabled={busy}>
              {busy ? t("Opening…") : t("Open workspace")}{" "}
              <ArrowRight size={18} />
            </Button>
            <a className="hero-link" href="#how-it-works">
              {t("See how it works")} <ChevronDown size={16} />
            </a>
          </div>
          <div className="hero-product">
            <div className="hero-note note-left">
              <span>
                <Mic size={22} />
              </span>
              <div>
                <strong>{t("Your questions.")}</strong>
                <p>{t("Your conversation.")}</p>
              </div>
            </div>
            <PhonePreview />
            <div className="hero-note note-right">
              <span>
                <ClipboardCheck size={22} />
              </span>
              <div>
                <strong>{t("A clearer record.")}</strong>
                <p>{t("Ready for your review.")}</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="landing-how">
          <div>
            <span className="intro-label">{t("Made around your visit")}</span>
            <h2>
              {t("A few simple steps.")}
              <br />
              {t("A little less to carry.")}
            </h2>
          </div>
          <div className="how-items">
            <article>
              <span className="how-icon">
                <House size={25} />
              </span>
              <h3>{t("Choose a household")}</h3>
              <p>
                {t(
                  "Open a family’s record or add a new house to your register.",
                )}
              </p>
            </article>
            <article>
              <span className="how-icon">
                <Mic size={25} />
              </span>
              <h3>{t("Have the conversation")}</h3>
              <p>
                {t(
                  "Record with permission. Answers find their place while you keep talking.",
                )}
              </p>
            </article>
            <article>
              <span className="how-icon">
                <Check size={25} />
              </span>
              <h3>{t("Review and save")}</h3>
              <p>
                {t(
                  "Check the details, make your edits, and finish the visit in your own time.",
                )}
              </p>
            </article>
          </div>
        </section>
        <section id="your-workspace" className="landing-workspace">
          <div>
            <span className="intro-label">
              {t("Your register, thoughtfully organised")}
            </span>
            <h2>
              {t("One place for the")}
              <br />
              {t("whole visit.")}
            </h2>
            <p>
              {t(
                "Family details, health observations, and the notes that matter. Easy to find. Always yours to edit.",
              )}
            </p>
            <Button onClick={onOpen} disabled={busy}>
              {t("Open workspace")} <ArrowRight size={17} />
            </Button>
          </div>
          <div className="workspace-preview">
            <div>
              <span className="preview-house-icon">
                <House size={26} />
              </span>
              <span>
                <strong>{t("Household visit")}</strong>
                <small>{t("Questions, answers, and your notes")}</small>
              </span>
              <span className="preview-status">{t("Draft")}</span>
            </div>
            <div className="preview-section">
              <span>{t("Family details")}</span>
              <ChevronRight size={17} />
            </div>
            <div className="preview-section">
              <span>{t("Health observations")}</span>
              <ChevronRight size={17} />
            </div>
            <div className="preview-section">
              <span>{t("Visit notes")}</span>
              <ChevronRight size={17} />
            </div>
            <p>
              <Check size={15} /> {t("Every entry can be reviewed and edited.")}
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <p>{t("Digital Assisted Recordkeeping for ASHA Workers")}</p>
        <a href="#dara-top">
          {t("Back to top")} <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  );
}

export default function DaraApp() {
  const workspace = useSurveys();
  return (
    <LanguageProvider language={workspace.settings.language}>
      <DaraWorkspace workspace={workspace} />
    </LanguageProvider>
  );
}
function DaraWorkspace({
  workspace,
}: {
  workspace: ReturnType<typeof useSurveys>;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const {
    ready,
    error,
    households,
    surveys,
    settings,
    saveHousehold,
    deleteHousehold,
    saveSurvey,
    completeSurvey: persistCompleted,
    saveSettings,
    exportData,
    resetUserEntries,
    resetting,
    generation,
  } = workspace;
  const [entered, setEntered] = useState(false),
    [opening, setOpening] = useState(false),
    [view, setView] = useState<View>("households"),
    [tab, setTab] = useState<Tab>("households"),
    [householdId, setHouseholdId] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null),
    [step, setStep] = useState<Step>("household"),
    [memberId, setMemberId] = useState<string>(""),
    [healthMemberId, setHealthMemberId] = useState<string | null>(null),
    [revealedFieldKey, setRevealedFieldKey] = useState<string | null>(null),
    [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState(""),
    [visitFilter, setVisitFilter] = useState<"all" | "draft" | "completed">(
      "all",
    ),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [assignReport, setAssignReport] = useState<ReviewReport | null>(null),
    [busy, setBusy] = useState(false),
    [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
      "saved",
    ),
    [extracting, setExtracting] = useState(false),
    [seconds, setSeconds] = useState(0),
    [removeMember, setRemoveMember] = useState<string | null>(null);
  const currentRef = useRef<Survey | null>(null),
    workspaceRef = useRef({ households, surveys }),
    viewRef = useRef(view),
    stepRef = useRef(step),
    protectedFields = useRef(new Set<string>()),
    saveRef = useRef(saveSurvey),
    savedRevision = useRef<string>(""),
    installPrompt = useRef<any>(null),
    consented = useRef(new Set<string>()),
    pendingExtractions = useRef(0),
    workspaceEpoch = useRef(0),
    completing = useRef(false),
    finishing = useRef(false),
    draftCache = useRef(new Map<string, Survey>());
  currentRef.current = survey;
  if (survey) draftCache.current.set(survey.id, survey);
  workspaceRef.current = { households, surveys };
  viewRef.current = view;
  stepRef.current = step;
  saveRef.current = saveSurvey;
  const household = households.find((h) => h.id === householdId) ?? null;
  const activeMember = survey?.members.find((m) => m.id === healthMemberId);
  const showPregnancyCare =
    !!activeMember &&
    (isPregnancyCareRelevant(activeMember) ||
      [...PREGNANCY_FIELD_IDS].some(
        (id) => revealedFieldKey === `${activeMember.id}.${id}`,
      ));
  const issues = useMemo(() => (survey ? reviewSurvey(survey) : []), [survey]);
  const selectedSurveys = useMemo(
    () =>
      surveys
        .filter((s) => s.householdId === householdId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [surveys, householdId],
  );
  const update = useCallback(
    (value: Survey | ((previous: Survey) => Survey)) => {
      if (completing.current) return;
      const previous = currentRef.current;
      if (!previous && typeof value === "function") return;
      try {
        const next = typeof value === "function" ? value(previous!) : value;
        if (next === previous) return;
        draftCache.current.set(next.id, next);
        currentRef.current = next;
        setSurvey(next);
        setReviewed(false);
        setSaveStatus("saving");
      } catch (e) {
        setNotice(
          e instanceof Error
            ? e.message
            : "This change could not be made. Please check the details.",
        );
      }
    },
    [],
  );
  const commitToSurvey = useCallback(
    async (next: Survey) => {
      draftCache.current.set(next.id, next);
      if (currentRef.current?.id === next.id) update(next);
      else await saveRef.current(next);
    },
    [update],
  );
  // The recorder captures this callback when it starts. Its target ID never
  // follows a later household selection, while the draft values remain current.
  const recordingSurveyId = survey?.id;
  const processTranscript = useCallback(
    async (text: string, detectedLanguage?: SurveyTranscript["language"]) => {
      const epoch = workspaceEpoch.current;
      const current =
        currentRef.current?.id === recordingSurveyId
          ? currentRef.current
          : (draftCache.current.get(recordingSurveyId ?? "") ??
            workspaceRef.current.surveys.find(
              (s) => s.id === recordingSurveyId,
            ));
      if (!current || current.status === "completed" || !text.trim()) return;
      const segment: SurveyTranscript = {
        id: crypto.randomUUID(),
        index: Math.max(-1, ...current.transcripts.map((t) => t.index)) + 1,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        language: detectedLanguage ?? "auto",
        source: "gnani",
      };
      const withTranscript = addSurveyTranscript(current, segment);
      try {
        await commitToSurvey(withTranscript);
      } catch {
        if (workspaceEpoch.current !== epoch) return;
        // The original segment remains in the draft cache and workspace's
        // recovery export. Resolve this callback so the recorder does not
        // ingest the same passage again under a new segment ID.
        setNotice(
          "This conversation is kept in memory but could not be saved on this device. Keep this page open and export your records before reloading.",
        );
        return;
      }
      pendingExtractions.current++;
      setExtracting(true);
      try {
        const envelope = await extractSurvey(withTranscript, segment);
        if (workspaceEpoch.current !== epoch) return;
        const latest =
          currentRef.current?.id === current.id
            ? currentRef.current
            : draftCache.current.get(current.id);
        if (latest)
          await commitToSurvey(
            applySurveyExtraction(
              latest,
              envelope,
              currentRef.current?.id === current.id
                ? [...protectedFields.current]
                : [],
            ),
          );
      } catch (e) {
        if (workspaceEpoch.current !== epoch) return;
        setNotice(
          e instanceof Error
            ? e.message
            : "The conversation was saved, but the answers could not be filled. You can retry from the conversation panel.",
        );
      } finally {
        pendingExtractions.current--;
        setExtracting(pendingExtractions.current > 0);
      }
    },
    [recordingSurveyId, commitToSurvey],
  );
  const recorder = useRecorder({
    language: "auto",
    onTranscript: processTranscript,
  });
  const recording =
    recorder.status === "recording" ||
    recorder.status === "paused" ||
    recorder.status === "processing";
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const getLatestSurvey = useCallback(() => currentRef.current, []);
  const getProtectedKeys = useCallback(() => [...protectedFields.current], []);
  const reconciliation = useSurveyReconciliation({
    survey,
    enabled:
      view === "survey" &&
      (step === "health" || step === "notes" || step === "review"),
    offline,
    getLatest: getLatestSurvey,
    commit: commitToSurvey,
    getProtectedKeys,
  });
  const checkUnavailable = offline || reconciliation.status === "error";
  const reviewIssues = issues;
  const reviewReports = useMemo(() => {
    const groups = new Map<string, ReviewReport>();
    const add = (
      item: {
        id: string;
        memberId: string | null;
        segmentId?: string;
        evidence: string;
      },
      kind: "uncertainty" | "note",
      text: string,
    ) => {
      const duplicate = [...groups.values()].find(
        (group) =>
          group.memberId === item.memberId &&
          group.evidence.includes(item.evidence),
      );
      const key =
        duplicate?.id ??
        `${item.memberId ?? "household"}:${item.segmentId ?? item.evidence}`;
      const group = groups.get(key) ?? {
        id: key,
        memberId: item.memberId,
        messages: [],
        controlledMessages: [],
        evidence: [],
        uncertaintyIds: [],
        noteIds: [],
      };
      if (text && !group.messages.includes(text)) group.messages.push(text);
      if (kind === "uncertainty" && !group.controlledMessages.includes(text))
        group.controlledMessages.push(text);
      if (item.evidence && !group.evidence.includes(item.evidence))
        group.evidence.push(item.evidence);
      (kind === "uncertainty" ? group.uncertaintyIds : group.noteIds).push(
        item.id,
      );
      groups.set(key, group);
    };
    survey?.uncertainties
      .filter((item) => !item.resolved)
      .forEach((item) => add(item, "uncertainty", item.message));
    survey?.notes
      .filter((item) => !item.reviewed)
      .forEach((item) => add(item, "note", item.text));
    return [...groups.values()];
  }, [survey]);
  useEffect(() => {
    if (view === "survey" && step === "review" && survey?.status === "draft") {
      void reconciliation.ensureReviewed();
    }
  }, [view, step, survey?.id]);
  const closeDialog = useCallback(() => setDialog(null), []);
  async function navigate(next: View, homeId?: string, currentSurvey?: Survey) {
    if ((completing.current || finishing.current) && next !== "finished")
      return;
    if (next !== "survey" && recording) await recorder.stop();
    if (next !== "survey") reconciliation.cancel();
    setView(next);
    if (homeId) setHouseholdId(homeId);
    if (NAV.some((n) => n.id === next)) setTab(next as Tab);
    setNotice("");
    const s = currentSurvey ?? currentRef.current;
    window.history.pushState(
      {
        daraView: next,
        householdId: homeId ?? householdId,
        surveyId: next === "survey" || next === "finished" ? s?.id : undefined,
      },
      "",
      `#${next}`,
    );
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    setEntered(sessionStorage.getItem("dara-workspace-entered") === "yes");
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    const install = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event;
    };
    window.addEventListener("beforeinstallprompt", install);
    const back = async (event: PopStateEvent) => {
      if (completing.current || finishing.current) return;
      await recorderRef.current.stop();
      let target = event.state?.daraView ?? "households";
      const id = event.state?.surveyId;
      if (target === "survey" || target === "finished") {
        const restored =
          currentRef.current?.id === id
            ? currentRef.current
            : workspaceRef.current.surveys.find((s) => s.id === id);
        if (restored) {
          currentRef.current = restored;
          setSurvey(restored);
          setHouseholdId(restored.householdId);
          setStep(restored.status === "completed" ? "review" : "household");
          setReviewed(false);
        } else target = "households";
      }
      if (event.state?.householdId) setHouseholdId(event.state.householdId);
      setView(target);
      if (NAV.some((n) => n.id === target)) setTab(target);
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("popstate", back);
    };
  }, []);
  useEffect(() => {
    if (!survey) return;
    const key = `${survey.id}:${survey.revision}`;
    if (savedRevision.current === key) {
      setSaveStatus("saved");
      return;
    }
    saveRef
      .current(survey)
      .then(() => {
        savedRevision.current = key;
        if (
          currentRef.current?.id === survey.id &&
          currentRef.current.revision === survey.revision
        )
          setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("error"));
  }, [survey]);
  useEffect(() => {
    if (recorder.status !== "recording") return;
    const timer = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [recorder.status]);
  useEffect(() => {
    if (!survey?.members.some((m) => m.id === memberId))
      setMemberId(survey?.members[0]?.id ?? "");
  }, [survey?.members, memberId]);
  async function openWorkspace() {
    setOpening(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const result = await response.json();
      if (result.authenticated) enter();
      else setDialog("access");
    } catch {
      if (sessionStorage.getItem("dara-workspace-entered") === "yes") enter();
      else {
        setDialog("access");
        setNotice(
          "Connect to the internet to open this workspace for the first time.",
        );
      }
    } finally {
      setOpening(false);
    }
  }
  function enter() {
    sessionStorage.setItem("dara-workspace-entered", "yes");
    setEntered(true);
    setDialog(null);
    window.history.replaceState({ daraView: "households" }, "", "#households");
  }
  async function openSurvey(
    home: SurveyHousehold,
    existing?: Survey,
    repeatOf?: string,
    templateId?: "family-health" | "pregnancy-follow-up" | "rainy-season",
  ) {
    if (completing.current || finishing.current) return;
    await recorderRef.current.stop();
    reconciliation.cancel();
    const priorSurvey = surveys
      .filter((item) => item.householdId === home.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const repeatSource = surveys.find((item) => item.id === repeatOf);
    const selectedTemplate =
      templateId ??
      (repeatSource?.templateId === "pregnancy-follow-up"
        ? "pregnancy-follow-up"
        : repeatSource?.templateId === "rainy-season"
          ? "rainy-season"
          : "family-health");
    const next = existing
      ? migrateDraftSurvey(existing)
      : selectedTemplate === "rainy-season"
        ? createRainySurveyFromPrior({
            householdId: home.id,
            priorSurvey: repeatSource ?? priorSurvey,
            workspaceGeneration: generation,
          })
        : createSurvey({
            householdId: home.id,
            workspaceGeneration: generation,
            ...(repeatOf ? { repeatOf } : {}),
            templateId: selectedTemplate,
          });
    update(next);
    setHouseholdId(home.id);
    setMemberId(next.members[0]?.id ?? "");
    setHealthMemberId(null);
    setRevealedFieldKey(null);
    setStep(
      next.status === "completed"
        ? "review"
        : next.templateId === "rainy-season" &&
            next.members.some((member) => member.values.name)
          ? "health"
          : "household",
    );
    setReviewed(false);
    setSeconds(0);
    setTab("households");
    navigate("survey", home.id, next);
  }
  function changeStep(next: Step) {
    if (completing.current || finishing.current) return;
    setStep(next);
    setRevealedFieldKey(null);
    setReviewed(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function edit(member: string | null, field: string, value: SurveyValue) {
    if (finishing.current) return;
    update((s) => editSurveyField(s, member, field, value));
  }
  async function finish() {
    const current = currentRef.current;
    if (!current || recording || extracting || !reviewed || finishing.current)
      return;
    const epoch = workspaceEpoch.current;
    finishing.current = true;
    setBusy(true);
    try {
      await recorder.stop();
      await reconciliation.ensureReviewed();
      const latest = currentRef.current;
      if (
        !latest ||
        latest.id !== current.id ||
        latest.workspaceGeneration !== current.workspaceGeneration ||
        workspaceEpoch.current !== epoch
      )
        return;
      if (latest.revision !== current.revision) {
        setReviewed(false);
        setNotice(
          "The conversation check updated this visit. Review the changes before finishing.",
        );
        return;
      }
      completing.current = true;
      const completed = completeSurvey(latest);
      await persistCompleted(completed);
      savedRevision.current = `${completed.id}:${completed.revision}`;
      currentRef.current = completed;
      draftCache.current.set(completed.id, completed);
      setSurvey(completed);
      setSaveStatus("saved");
      navigate("finished", completed.householdId, completed);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Your visit could not be saved. Please try again.",
      );
    } finally {
      completing.current = false;
      finishing.current = false;
      setBusy(false);
    }
  }
  async function startRecording() {
    if (finishing.current || completing.current) return;
    if (!survey || survey.status === "completed") return;
    if (!consented.current.has(survey.id)) {
      setDialog("consent");
      return;
    }
    setNotice("");
    await recorder.start();
  }
  async function retryTranscript(segment: SurveyTranscript) {
    if (finishing.current || completing.current) return;
    const epoch = workspaceEpoch.current;
    const current = currentRef.current;
    if (!current) return;
    pendingExtractions.current++;
    setExtracting(true);
    try {
      const envelope = await extractSurvey(current, segment);
      if (workspaceEpoch.current !== epoch) return;
      const latest =
        currentRef.current?.id === current.id
          ? currentRef.current
          : draftCache.current.get(current.id);
      if (latest)
        await commitToSurvey(
          applySurveyExtraction(
            latest,
            envelope,
            currentRef.current?.id === current.id
              ? [...protectedFields.current]
              : [],
          ),
        );
    } catch (e) {
      if (workspaceEpoch.current !== epoch) return;
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not process the conversation. Please try again.",
      );
    } finally {
      pendingExtractions.current--;
      setExtracting(pendingExtractions.current > 0);
    }
  }
  async function exportRecords() {
    try {
      await exportData();
      setNotice("Your records have been exported.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "The export could not be created.",
      );
    }
  }
  async function clearOwnEntries() {
    const previous = currentRef.current;
    setBusy(true);
    try {
      workspaceEpoch.current++;
      recorder.discard();
      reconciliation.cancel();
      currentRef.current = null;
      draftCache.current.clear();
      savedRevision.current = "";
      setSurvey(null);
      setHealthMemberId(null);
      setReviewed(false);
      await resetUserEntries();
      setDialog(null);
      setHouseholdId(null);
      await navigate("households");
      setNotice(
        "Your entries were cleared. Example households and preferences were kept.",
      );
    } catch (reason) {
      if (previous) {
        currentRef.current = previous;
        draftCache.current.set(previous.id, previous);
        setSurvey(previous);
      }
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Your entries could not be cleared. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function editIssue(issue: SurveyReviewIssue) {
    const definition = survey?.fields.find((f) => f.id === issue.fieldId);
    setRevealedFieldKey(`${issue.memberId ?? "household"}.${issue.fieldId}`);
    if (issue.memberId) {
      setMemberId(issue.memberId);
      if (definition?.section === "health") setHealthMemberId(issue.memberId);
      setStep(
        definition?.section === "health"
          ? "health"
          : definition?.section === "notes"
            ? "notes"
            : "family",
      );
    } else {
      if (definition && new Set<string>(RAINY_FIELD_IDS).has(definition.id)) {
        setStep("health");
        setHealthMemberId(null);
      } else setStep(definition?.section === "notes" ? "notes" : "household");
    }
    setReviewed(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document
          .getElementById(
            `answer-${issue.memberId ?? "household"}-${issue.fieldId}`,
          )
          ?.focus();
      }),
    );
  }
  function reviewReport(group: ReviewReport) {
    update((current) => {
      let next = current;
      for (const id of group.uncertaintyIds)
        next = resolveSurveyUncertainty(next, id);
      for (const id of group.noteIds) next = reviewSurveyNote(next, id);
      return next;
    });
  }
  function editReport(group: ReviewReport) {
    const field = survey?.fields.find((definition) =>
      group.messages.some(
        (text) =>
          text.toLowerCase().includes(definition.label.toLowerCase()) ||
          text.toLowerCase().includes(definition.id.toLowerCase()),
      ),
    );
    if (!group.memberId && field?.scope === "member") {
      setAssignReport(group);
      return;
    }
    editIssue({
      id: group.id,
      memberId: field?.scope === "household" ? null : group.memberId,
      fieldId:
        field?.id ?? (group.memberId ? "healthHistory" : "householdNotes"),
      kind: "uncertain",
      message: "",
    });
  }
  function renderField(field: SurveyFieldDefinition, member: string | null) {
    if (!survey) return null;
    const record = member
      ? survey.members.find((m) => m.id === member)
      : survey.household;
    if (!record) return null;
    if (
      !isSurveyFieldVisible(field, record) &&
      revealedFieldKey !== `${member ?? "household"}.${field.id}`
    )
      return null;
    return (
      <AnswerField
        key={`${member ?? "household"}.${field.id}`}
        field={field}
        memberId={member}
        value={record.values[field.id]}
        meta={record.meta[field.id]}
        disabled={survey.status === "completed" || busy}
        needsReview={survey.conflicts.some(
          (conflict) =>
            !conflict.resolved &&
            conflict.memberId === member &&
            conflict.fieldId === field.id,
        )}
        issue={
          issues.find(
            (i) =>
              i.memberId === member &&
              i.fieldId === field.id &&
              i.kind === "invalid",
          )?.message
        }
        onChange={(value) => edit(member, field.id, value)}
        onFocus={() =>
          protectedFields.current.add(`${member ?? "household"}.${field.id}`)
        }
        onBlur={() =>
          protectedFields.current.delete(`${member ?? "household"}.${field.id}`)
        }
      />
    );
  }
  function renderChecklist(
    ids: readonly string[],
    member: string | null,
    title: string,
  ) {
    if (!survey) return null;
    const record = member
      ? survey.members.find((item) => item.id === member)
      : survey.household;
    if (!record) return null;
    const fields = survey.fields.filter(
      (field) =>
        ids.includes(field.id) &&
        (isSurveyFieldVisible(field, record) ||
          revealedFieldKey === `${member ?? "household"}.${field.id}`),
    );
    if (!fields.length) return null;
    return (
      <CareChecklist
        title={title}
        fields={fields}
        record={record}
        memberId={member}
        disabled={survey.status === "completed" || busy}
        onChange={(field, value) => edit(member, field, value)}
        onFocus={(field) =>
          protectedFields.current.add(`${member ?? "household"}.${field}`)
        }
        onBlur={(field) =>
          protectedFields.current.delete(`${member ?? "household"}.${field}`)
        }
      />
    );
  }
  const accessSheet = dialog === "access" && (
    <AccessSheet
      onClose={closeDialog}
      onSuccess={() => {
        if (entered) {
          setDialog(null);
          setNotice("");
          recorder.clearError();
        } else enter();
      }}
      notice={notice}
    />
  );
  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <p>{t("Opening your register…")}</p>
      </div>
    );
  if (!entered)
    return (
      <>
        <Landing onOpen={openWorkspace} busy={opening} />
        {accessSheet}
      </>
    );

  return (
    <div
      className={`workspace ${settings.textSize === "large" ? "large-text" : ""}`}
    >
      <aside className="app-sidebar">
        <Brand
          onClick={() => {
            void recorder.stop();
            setEntered(false);
          }}
        />
        <nav aria-label={t("Workspace navigation")}>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} strokeWidth={1.7} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-wordmark">
            {t("A little less")}
            <br />
            {t("to carry.")}
          </div>
          <button
            className="profile-button"
            onClick={() => navigate("settings")}
          >
            <span>
              {settings.workerName ? (
                iconInitials(settings.workerName)
              ) : (
                <UserMark />
              )}
            </span>
            <div>
              <strong>{settings.workerName || t("Your workspace")}</strong>
              <small>{settings.area || t("ASHA field register")}</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="app-header">
          <div className="mobile-brand">
            <Brand
              onClick={() => {
                void recorder.stop();
                setEntered(false);
              }}
            />
          </div>
          <span className="area-label">
            {settings.area ? (
              <>
                <MapPin size={16} />
                {settings.area}
              </>
            ) : (
              t("Household care, thoughtfully recorded.")
            )}
          </span>
          <div className="header-right">
            <span>
              {new Intl.DateTimeFormat(localeTag(language), {
                day: "numeric",
                month: "long",
                timeZone: "Asia/Kolkata",
              }).format(new Date())}
            </span>
            <button
              className="icon-button"
              aria-label={t("Open settings")}
              onClick={() => navigate("settings")}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        {offline && (
          <div className="status-banner">
            <WifiOff size={18} />
            <span>
              {t(
                "You’re offline. You can keep editing saved records on this device.",
              )}
            </span>
          </div>
        )}
        {error && (
          <div className="status-banner error-banner" role="alert">
            <Info size={18} />
            <span>{message(error)}</span>
            <Button kind="secondary" onClick={exportRecords}>
              {t("Export records")}
            </Button>
          </div>
        )}
        {(notice || recorder.error) && (
          <div className="status-banner" role="status">
            <Info size={18} />
            <span>{message(notice || recorder.error || "")}</span>
            {/unlock|access code|workspace code/i.test(
              notice || recorder.error || "",
            ) && (
              <Button kind="secondary" onClick={() => setDialog("access")}>
                {t("Unlock workspace")}
              </Button>
            )}
            <button
              className="icon-button"
              aria-label={t("Dismiss message")}
              onClick={() => {
                setNotice("");
                recorder.clearError();
              }}
            >
              <X size={17} />
            </button>
          </div>
        )}
        <main className={`app-page view-${view}`}>
          {view === "households" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">{t("YOUR REGISTER")}</span>
                  <h1>{t("Households")}</h1>
                  <p>{t("Every visit begins with a family.")}</p>
                </div>
                <Button onClick={() => setDialog("add-household")}>
                  <Plus size={19} />
                  {t("Add household")}
                </Button>
              </div>
              {households.length > 0 && (
                <div className="list-toolbar">
                  <label className="search-control">
                    <Search size={19} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Search name, house number, or address")}
                      aria-label={t("Search households")}
                    />
                    {search && (
                      <button
                        aria-label={t("Clear search")}
                        onClick={() => setSearch("")}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </label>
                  <span>
                    {households.length}{" "}
                    {households.length === 1 ? "household" : "households"}
                  </span>
                </div>
              )}
              {households.length === 0 ? (
                <div className="welcome-card">
                  <Empty
                    title={t("Your first household starts here.")}
                    action={
                      <Button onClick={() => setDialog("add-household")}>
                        <Plus size={18} />
                        {t("Add a household")}
                      </Button>
                    }
                  >
                    {t(
                      "Add a house number or address. Family details can be filled in naturally during the visit.",
                    )}
                  </Empty>
                  <div className="welcome-bottom">
                    <span>
                      <House size={18} />
                      {t("Add a household")}
                    </span>
                    <ArrowRight size={16} />
                    <span>
                      <Mic size={18} />
                      {t("Have a conversation")}
                    </span>
                    <ArrowRight size={16} />
                    <span>
                      <Check size={18} />
                      {t("Review the record")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="household-grid">
                  {households
                    .filter((h) =>
                      `${h.label} ${h.code} ${h.address} ${h.area ?? ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((h, index) => {
                      const records = surveys.filter(
                        (s) => s.householdId === h.id,
                      );
                      const draft = records.find((s) => s.status === "draft");
                      const latest = records
                        .filter((s) => s.status === "completed")
                        .sort((a, b) =>
                          b.createdAt.localeCompare(a.createdAt),
                        )[0];
                      return (
                        <button
                          key={h.id}
                          className="household-card"
                          onClick={() => navigate("household", h.id)}
                        >
                          <div className="household-card-top">
                            <span className={`home-symbol color-${index % 4}`}>
                              <House size={27} strokeWidth={1.45} />
                            </span>
                            {draft ? (
                              <span className="pill purple">
                                {t("Draft visit")}
                              </span>
                            ) : latest ? (
                              <span className="pill green">{t("Visited")}</span>
                            ) : (
                              <span className="pill">{t("New household")}</span>
                            )}
                          </div>
                          <h2>
                            {h.label}
                            {h.source === "example" && (
                              <span className="example-label">
                                {t("Example")}
                              </span>
                            )}
                          </h2>
                          <p>
                            {[h.code, h.address].filter(Boolean).join(" · ") ||
                              t("Add address in household details")}
                          </p>
                          <div className="household-card-bottom">
                            <span>
                              {latest
                                ? t("Last visit · {date}", {
                                    date: date(latest.completedAt!, language),
                                  })
                                : h.area || t("Ready for the first visit")}
                            </span>
                            <ChevronRight size={19} />
                          </div>
                        </button>
                      );
                    })}
                  {households.filter((h) =>
                    `${h.label} ${h.code} ${h.address} ${h.area ?? ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ).length === 0 && (
                    <div className="surface full-grid">
                      <Empty
                        icon={Search}
                        title={t("No households found.")}
                        action={
                          <Button
                            kind="secondary"
                            onClick={() => setSearch("")}
                          >
                            {t("Clear search")}
                          </Button>
                        }
                      >
                        {t("Try a different name, house number, or address.")}
                      </Empty>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {view === "household" && household && (
            <>
              <button
                className="back-button"
                onClick={() => navigate("households")}
              >
                <ArrowLeft size={18} />
                {t("Households")}
              </button>
              <div className="household-detail-heading">
                <span className="home-symbol big">
                  <House size={35} strokeWidth={1.4} />
                </span>
                <div>
                  <span className="eyebrow">{t("HOUSEHOLD RECORD")}</span>
                  <h1>{household.label}</h1>
                  <p>
                    {[household.code, household.address, household.area]
                      .filter(Boolean)
                      .join(" · ") || t("Address not recorded")}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={t("Edit household")}
                  onClick={() => setDialog("edit-household")}
                >
                  <Settings2 size={22} />
                </button>
              </div>
              <div className="household-detail-grid">
                <section>
                  <div className="section-heading">
                    <h2>{t("Visits")}</h2>
                    <span>
                      {selectedSurveys.length}{" "}
                      {selectedSurveys.length === 1 ? "record" : "records"}
                    </span>
                  </div>
                  {selectedSurveys.length ? (
                    <div className="visit-list">
                      {selectedSurveys.map((s) => (
                        <button
                          className="visit-card"
                          key={s.id}
                          onClick={() => openSurvey(household, s)}
                        >
                          <div className="visit-card-header">
                            <span>{date(s.createdAt, language)}</span>
                            <span
                              className={`pill ${s.status === "completed" ? "green" : "purple"}`}
                            >
                              {s.status === "completed"
                                ? t("Completed")
                                : t("In progress")}
                            </span>
                          </div>
                          <h3>
                            {s.templateId === "pregnancy-follow-up"
                              ? t("Pregnancy survey")
                              : s.templateId === "rainy-season"
                                ? t("Rainy-season visit")
                                : s.repeatOf
                                  ? t("Repeat household visit")
                                  : t("Household visit")}
                          </h3>
                          <p>
                            {s.members.length
                              ? t(
                                  s.members.length === 1
                                    ? "{count} family member"
                                    : "{count} family members",
                                  { count: s.members.length },
                                )
                              : t("Family details not entered yet")}
                          </p>
                          <div className="visit-card-footer">
                            <span>
                              {s.status === "completed"
                                ? t("View record")
                                : t("Continue visit")}
                            </span>
                            <ArrowRight size={18} />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="surface">
                      <Empty
                        icon={FileText}
                        title={t("A fresh record for this home.")}
                      >
                        {t(
                          "Start a visit when you’re ready. The form begins blank, so every answer belongs to this conversation.",
                        )}
                      </Empty>
                    </div>
                  )}
                </section>
                <aside className="start-visit-card">
                  <span className="round-symbol">
                    <Mic size={25} />
                  </span>
                  <h2>{t("Ready when you are.")}</h2>
                  <p>
                    {t(
                      "Ask your questions naturally. Record the answers, then review them before saving.",
                    )}
                  </p>
                  <Button
                    className="full-width"
                    onClick={() =>
                      openSurvey(
                        household,
                        selectedSurveys.find((s) => s.status === "draft"),
                      )
                    }
                  >
                    {selectedSurveys.some((s) => s.status === "draft")
                      ? t("Continue visit")
                      : t("Start visit")}
                    <ArrowRight size={17} />
                  </Button>
                  <Button
                    kind="secondary"
                    className="full-width"
                    onClick={() =>
                      openSurvey(
                        household,
                        undefined,
                        undefined,
                        "pregnancy-follow-up",
                      )
                    }
                  >
                    {t("Start pregnancy survey")}
                  </Button>
                  <Button
                    kind="secondary"
                    className="full-width"
                    onClick={() =>
                      openSurvey(
                        household,
                        undefined,
                        undefined,
                        "rainy-season",
                      )
                    }
                  >
                    {t("Start rainy-season visit")}
                  </Button>
                  {selectedSurveys.some((s) => s.status === "completed") && (
                    <Button
                      kind="secondary"
                      className="full-width"
                      onClick={() =>
                        openSurvey(
                          household,
                          undefined,
                          selectedSurveys.find((s) => s.status === "completed")!
                            .id,
                        )
                      }
                    >
                      {t("Start repeat visit")}
                    </Button>
                  )}
                  <small>
                    {t(
                      "Repeat visits start with blank answers and keep earlier records unchanged.",
                    )}
                  </small>
                </aside>
              </div>
            </>
          )}
          {view === "survey" && survey && household && (
            <>
              <div className="survey-topline">
                <button
                  className="back-button"
                  onClick={() => navigate("household", household.id)}
                >
                  <ArrowLeft size={18} />
                  {household.label}
                </button>
                <span
                  className={`save-label ${saveStatus === "error" ? "is-error" : ""}`}
                >
                  {saveStatus === "saved" ? (
                    <Check size={15} />
                  ) : (
                    <FileText size={15} />
                  )}{" "}
                  {saveStatus === "saved"
                    ? t("Saved on this device")
                    : saveStatus === "saving"
                      ? t("Saving…")
                      : t("Not saved")}
                </span>
              </div>
              <div className="survey-heading">
                <div>
                  <span className="eyebrow">
                    {survey.status === "completed"
                      ? t("COMPLETED RECORD")
                      : survey.repeatOf
                        ? t("REPEAT HOUSEHOLD VISIT")
                        : t("HOUSEHOLD VISIT")}
                  </span>
                  <h1>
                    {survey.status === "completed"
                      ? t("Visit record")
                      : survey.templateId === "pregnancy-follow-up"
                        ? t("Pregnancy survey")
                        : survey.templateId === "rainy-season"
                          ? t("Rainy-season visit")
                          : t("Family health survey")}
                  </h1>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setDialog("transcript")}
                >
                  <FileText size={17} />
                  {t("Conversation")}
                  {survey.transcripts.length > 0 && (
                    <span className="button-count">
                      {survey.transcripts.length}
                    </span>
                  )}
                </button>
              </div>
              <nav className="survey-progress" aria-label={t("Visit sections")}>
                {STEPS.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => changeStep(item.id)}
                    disabled={busy}
                    className={step === item.id ? "current" : ""}
                    aria-current={step === item.id ? "step" : undefined}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{t(item.label)}</strong>
                  </button>
                ))}
              </nav>
              <div
                className={`survey-layout ${step === "health" && activeMember ? "has-health-detail" : ""}`}
              >
                <section className="survey-content">
                  {step === "household" && (
                    <>
                      <div className="step-heading">
                        <h2>{t("Household details")}</h2>
                        <p>
                          {t(
                            "How many people live here? Each person gets a separate section.",
                          )}
                        </p>
                      </div>
                      <div className="survey-fields household-fields">
                        {survey.fields
                          .filter(
                            (f) =>
                              f.scope === "household" &&
                              f.section === "household" &&
                              !new Set<string>(RAINY_FIELD_IDS).has(f.id),
                          )
                          .map((f) => renderField(f, null))}
                      </div>
                      <div className="soft-info">
                        <UsersRound size={20} />
                        <p>
                          {t(
                            "Family sections are added when the household size is recorded. You can also add people in the next step.",
                          )}
                        </p>
                      </div>
                      <button
                        className="add-question"
                        disabled={survey.status === "completed"}
                        onClick={() => setDialog("custom-field")}
                      >
                        <Plus size={18} />
                        {t("Add a question")}
                      </button>
                    </>
                  )}
                  {step === "family" && (
                    <>
                      <div className="step-heading">
                        <h2>{t("Family details")}</h2>
                        <p>
                          {t(
                            "Names and ages help keep each person’s answers together.",
                          )}
                        </p>
                      </div>
                      {survey.members.length === 0 ? (
                        <div className="surface">
                          <Empty
                            icon={UsersRound}
                            title={t("Who lives in this household?")}
                            action={
                              survey.status === "draft" && (
                                <Button
                                  onClick={() =>
                                    update((s) => addSurveyMember(s))
                                  }
                                >
                                  <Plus size={18} />
                                  {t("Add family member")}
                                </Button>
                              )
                            }
                          >
                            {t(
                              "Record the number of family members, or add the first person here.",
                            )}
                          </Empty>
                        </div>
                      ) : (
                        <div className="family-sections">
                          {survey.members.map((m, index) => (
                            <section
                              className="family-section"
                              key={m.id}
                              aria-labelledby={`family-title-${m.id}`}
                            >
                              <header>
                                <span className="member-number">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <div>
                                  <h3 id={`family-title-${m.id}`}>
                                    {memberName(m, index, language)}
                                  </h3>
                                  <p>
                                    {m.values.relation
                                      ? fieldValueText(
                                          survey.fields.find(
                                            (f) => f.id === "relation",
                                          ),
                                          m.values.relation,
                                          language,
                                        )
                                      : t("Family member")}
                                  </p>
                                </div>
                                {survey.status === "draft" && (
                                  <button
                                    className="icon-button"
                                    aria-label={t(
                                      "Remove family member {count}",
                                      { count: index + 1 },
                                    )}
                                    onClick={() => {
                                      if (
                                        Object.values(m.values).some(
                                          (v) =>
                                            v !== null &&
                                            v !== undefined &&
                                            v !== "",
                                        )
                                      )
                                        setRemoveMember(m.id);
                                      else
                                        update((s) =>
                                          removeSurveyMember(s, m.id),
                                        );
                                    }}
                                  >
                                    <X size={18} />
                                  </button>
                                )}
                              </header>
                              <div className="survey-fields">
                                {survey.fields
                                  .filter(
                                    (f) =>
                                      f.scope === "member" &&
                                      f.section === "family",
                                  )
                                  .map((f) => renderField(f, m.id))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                      {survey.members.length > 0 &&
                        survey.status === "draft" && (
                          <button
                            className="add-question"
                            onClick={() => update((s) => addSurveyMember(s))}
                          >
                            <Plus size={19} />
                            {t("Add family member")}
                          </button>
                        )}
                    </>
                  )}
                  {step === "health" && (
                    <>
                      <div className="step-heading">
                        <h2>
                          {activeMember
                            ? t("Health details")
                            : t("Health overview")}
                        </h2>
                        <p>
                          {t(
                            "Record what each person reports. An unanswered question stays not discussed.",
                          )}
                        </p>
                      </div>
                      {survey.members.length > 0 ? (
                        <>
                          {activeMember ? (
                            <>
                              <button
                                className="back-button health-back"
                                onClick={() => setHealthMemberId(null)}
                              >
                                <ArrowLeft size={18} />
                                {t("Back to health overview")}
                              </button>
                              <div className="selected-health-layout">
                                <section
                                  className="health-card"
                                  aria-labelledby={`health-title-${activeMember.id}`}
                                >
                                  <div className="health-card-title">
                                    <span className="round-symbol">
                                      <UserMark />
                                    </span>
                                    <div>
                                      <h3
                                        id={`health-title-${activeMember.id}`}
                                      >
                                        {memberName(
                                          activeMember,
                                          survey.members.indexOf(activeMember),
                                          language,
                                        )}
                                      </h3>
                                      <p>
                                        {healthStatusLabel(
                                          activeMember,
                                          language,
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="survey-fields">
                                    {survey.fields
                                      .filter(
                                        (f) =>
                                          (f.scope === "member" &&
                                            f.section === "health" &&
                                            !new Set<string>([
                                              ...PREGNANCY_FIELD_IDS,
                                              ...PREGNANCY_CHECKLIST_IDS,
                                            ]).has(f.id)) ||
                                          f.id === "pregnancyStatus",
                                      )
                                      .map((f) =>
                                        renderField(f, activeMember.id),
                                      )}
                                  </div>
                                </section>
                                {showPregnancyCare ? (
                                  <section
                                    className="pregnancy-care-panel"
                                    aria-labelledby={`pregnancy-title-${activeMember.id}`}
                                  >
                                    <div className="care-panel-heading">
                                      <h3
                                        id={`pregnancy-title-${activeMember.id}`}
                                      >
                                        {t("Pregnancy and postnatal care")}
                                      </h3>
                                      <p>
                                        {t(
                                          "Record the care discussed with this person.",
                                        )}
                                      </p>
                                    </div>
                                    <div className="survey-fields">
                                      {survey.fields
                                        .filter(
                                          (field) =>
                                            new Set<string>(
                                              PREGNANCY_FIELD_IDS,
                                            ).has(field.id) &&
                                            field.id !== "pregnancyStatus" &&
                                            !new Set<string>(
                                              PREGNANCY_CHECKLIST_IDS,
                                            ).has(field.id),
                                        )
                                        .map((field) =>
                                          renderField(field, activeMember.id),
                                        )}
                                    </div>
                                    {renderChecklist(
                                      PREGNANCY_CHECKLIST_IDS,
                                      activeMember.id,
                                      "Counselling checklist",
                                    )}
                                  </section>
                                ) : (
                                  <aside className="health-detail-guidance">
                                    <h3>{t("Health details")}</h3>
                                    <p>
                                      {t(
                                        "Record only what was discussed. Pregnancy and postnatal care appears here when relevant.",
                                      )}
                                    </p>
                                    {survey.status === "draft" && (
                                      <Button
                                        kind="secondary"
                                        onClick={() =>
                                          edit(
                                            activeMember.id,
                                            "maternalStage",
                                            "postnatal",
                                          )
                                        }
                                      >
                                        {t("Record postnatal care")}
                                      </Button>
                                    )}
                                  </aside>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="health-overview">
                              {survey.members.map((member, index) => (
                                <button
                                  className="health-member-row"
                                  key={member.id}
                                  onClick={() => setHealthMemberId(member.id)}
                                >
                                  <span className="member-number">
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <span className="health-member-copy">
                                    <strong>
                                      {memberName(member, index, language)}
                                    </strong>
                                    <span>
                                      {healthStatusLabel(member, language)}
                                    </span>
                                    {member.values.healthHistory && (
                                      <small>
                                        {String(member.values.healthHistory)}
                                      </small>
                                    )}
                                    {(member.values.pregnancyStatus === "yes" ||
                                      member.values.maternalStage ===
                                        "pregnant" ||
                                      member.values.maternalStage ===
                                        "postnatal") && (
                                      <small>
                                        {member.values.maternalStage ===
                                        "postnatal"
                                          ? t("After delivery")
                                          : t("Pregnancy")}
                                        {member.values.maternalStage !==
                                          "postnatal" &&
                                        member.values.pregnancyMonths
                                          ? ` · ${t("{count} months", { count: String(member.values.pregnancyMonths) })}`
                                          : member.values.maternalStage !==
                                                "postnatal" &&
                                              member.values.pregnancyWeeks
                                            ? ` · ${t("{count} weeks", { count: String(member.values.pregnancyWeeks) })}`
                                            : ""}
                                      </small>
                                    )}
                                  </span>
                                  <ChevronRight size={20} />
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            className="add-question"
                            disabled={survey.status === "completed"}
                            onClick={() => setDialog("custom-field")}
                          >
                            <Plus size={18} />
                            {t("Add a question")}
                          </button>
                        </>
                      ) : (
                        <div className="surface">
                          <Empty
                            icon={UsersRound}
                            title={t("Add a family member first.")}
                            action={
                              <Button onClick={() => changeStep("family")}>
                                {t("Go to family")}
                                <ArrowRight size={17} />
                              </Button>
                            }
                          >
                            {t(
                              "Health observations are recorded for each person individually.",
                            )}
                          </Empty>
                        </div>
                      )}
                      {survey.templateId === "rainy-season" && (
                        <section
                          className="rainy-care-panel"
                          aria-labelledby="rainy-care-title"
                        >
                          <div className="care-panel-heading">
                            <h3 id="rainy-care-title">
                              {t("Rainy-season visit")}
                            </h3>
                            <p>
                              {t(
                                "Check the household surroundings and record the guidance discussed.",
                              )}
                            </p>
                          </div>
                          <div className="survey-fields">
                            {survey.fields
                              .filter(
                                (field) =>
                                  new Set<string>(RAINY_FIELD_IDS).has(
                                    field.id,
                                  ) &&
                                  !new Set<string>(RAINY_CHECKLIST_IDS).has(
                                    field.id,
                                  ),
                              )
                              .map((field) => renderField(field, null))}
                          </div>
                          {renderChecklist(
                            RAINY_CHECKLIST_IDS,
                            null,
                            "Visit checklist",
                          )}
                        </section>
                      )}
                    </>
                  )}
                  {step === "notes" && (
                    <>
                      <div className="step-heading">
                        <h2>{t("Household notes")}</h2>
                        <p>
                          {t("Add anything the next visit should pick up on.")}
                        </p>
                      </div>
                      <div className="survey-fields household-fields">
                        {survey.fields
                          .filter(
                            (f) =>
                              f.scope === "household" && f.section === "notes",
                          )
                          .map((f) => renderField(f, null))}
                      </div>
                      <button
                        className="add-question"
                        disabled={survey.status === "completed"}
                        onClick={() => setDialog("custom-field")}
                      >
                        <Plus size={18} />
                        {t("Add a question")}
                      </button>
                    </>
                  )}
                  {step === "review" && (
                    <>
                      <div className="step-heading">
                        <h2>
                          {survey.status === "completed"
                            ? t("Visit record")
                            : t("Review visit")}
                        </h2>
                        <p>
                          {survey.status === "completed"
                            ? t(
                                "Completed on {date}. This record is read-only.",
                                { date: date(survey.completedAt!, language) },
                              )
                            : t(
                                "Check the details and any entries that need your attention.",
                              )}
                        </p>
                      </div>
                      {survey.status === "draft" &&
                        issues.some((issue) => issue.kind === "missing") && (
                          <div className="review-check-hint" role="status">
                            {reconciliation.status === "checking" ? (
                              <span>
                                {t(
                                  "Checking the conversation for these answers…",
                                )}
                              </span>
                            ) : checkUnavailable &&
                              !reconciliation.isCurrent ? (
                              <>
                                <span>
                                  {t(
                                    "You can enter the missing answers manually.",
                                  )}
                                </span>
                                <button
                                  disabled={offline}
                                  onClick={() => void reconciliation.retry()}
                                >
                                  {t("Retry check")}
                                </button>
                              </>
                            ) : null}
                          </div>
                        )}
                      {survey.status === "draft" && (
                        <div
                          className={`review-notice ${reviewIssues.length ? "has-issues" : ""}`}
                        >
                          <span>
                            {reviewIssues.length ? (
                              <Info size={22} />
                            ) : (
                              <Check size={23} />
                            )}
                          </span>
                          <div>
                            <h3>
                              {reviewIssues.length
                                ? t(
                                    reviewIssues.length === 1
                                      ? "{count} detail needs attention"
                                      : "{count} details need attention",
                                    { count: reviewIssues.length },
                                  )
                                : t("Ready for your review")}
                            </h3>
                            <p>
                              {reviewIssues.length
                                ? t(
                                    "Complete the required answers or review the suggestions below.",
                                  )
                                : t("The required answers are complete.")}
                            </p>
                          </div>
                        </div>
                      )}
                      {reviewIssues.filter(
                        (i) => i.kind !== "conflict" && i.kind !== "uncertain",
                      ).length > 0 && (
                        <div className="review-issues">
                          {reviewIssues
                            .filter(
                              (i) =>
                                i.kind !== "conflict" && i.kind !== "uncertain",
                            )
                            .map((issue) => (
                              <div key={issue.id}>
                                <Info size={18} />
                                <span>
                                  <small>
                                    {issue.memberId
                                      ? memberName(
                                          survey.members.find(
                                            (m) => m.id === issue.memberId,
                                          )!,
                                          survey.members.findIndex(
                                            (m) => m.id === issue.memberId,
                                          ),
                                          language,
                                        )
                                      : t("Household")}
                                  </small>
                                  <strong>
                                    {message(
                                      issue.message,
                                      survey.fields.find(
                                        (f) => f.id === issue.fieldId,
                                      ),
                                    )}
                                  </strong>
                                </span>
                                <Button
                                  kind="secondary"
                                  onClick={() => editIssue(issue)}
                                >
                                  {t("Edit")}
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                      {survey.conflicts
                        .filter((c) => !c.resolved)
                        .map((c) => (
                          <div className="conflict-card" key={c.id}>
                            <span className="pill purple">
                              {t("Your edit is protected")}
                            </span>
                            <p className="conflict-member">
                              {c.memberId
                                ? memberName(
                                    survey.members.find(
                                      (member) => member.id === c.memberId,
                                    )!,
                                    survey.members.findIndex(
                                      (member) => member.id === c.memberId,
                                    ),
                                    language,
                                  )
                                : t("Household")}
                            </p>
                            <h3>
                              {(() => {
                                const field = survey.fields.find(
                                  (f) => f.id === c.fieldId,
                                );
                                return field ? fieldLabel(field) : c.fieldId;
                              })()}
                            </h3>
                            <div className="conflict-values">
                              <div>
                                <small>{t("Your entry")}</small>
                                <strong>
                                  {fieldValueText(
                                    survey.fields.find(
                                      (field) => field.id === c.fieldId,
                                    )!,
                                    c.currentValue,
                                    language,
                                  )}
                                </strong>
                              </div>
                              <div>
                                <small>{t("From conversation")}</small>
                                <strong>
                                  {fieldValueText(
                                    survey.fields.find(
                                      (field) => field.id === c.fieldId,
                                    )!,
                                    c.proposedValue,
                                    language,
                                  )}
                                </strong>
                              </div>
                            </div>
                            <blockquote>“{c.evidence}”</blockquote>
                            <button
                              className="review-edit-link"
                              onClick={() =>
                                editIssue({
                                  id: c.id,
                                  memberId: c.memberId,
                                  fieldId: c.fieldId,
                                  kind: "conflict",
                                  message: c.reason,
                                })
                              }
                            >
                              {t("Edit this answer")}
                              <ArrowRight size={15} />
                            </button>
                            <div className="button-row">
                              <Button
                                kind="secondary"
                                onClick={() =>
                                  update((s) =>
                                    resolveSurveyConflict(s, c.id, "keep"),
                                  )
                                }
                              >
                                {t("Keep my entry")}
                              </Button>
                              <Button
                                onClick={() =>
                                  update((s) =>
                                    resolveSurveyConflict(s, c.id, "accept"),
                                  )
                                }
                              >
                                {t("Approve correction")}
                              </Button>
                            </div>
                          </div>
                        ))}
                      {reviewReports.length > 0 && (
                        <div className="review-report-list">
                          {reviewReports.map((group) => (
                            <section className="review-report" key={group.id}>
                              <header>
                                <h3>
                                  {group.memberId
                                    ? memberName(
                                        survey.members.find(
                                          (member) =>
                                            member.id === group.memberId,
                                        )!,
                                        survey.members.findIndex(
                                          (member) =>
                                            member.id === group.memberId,
                                        ),
                                        language,
                                      )
                                    : t("Household")}
                                </h3>
                                <span>{t("Needs review")}</span>
                              </header>
                              <ul>
                                {group.messages.map((text, index) => (
                                  <li key={index}>
                                    {group.controlledMessages.includes(text)
                                      ? message(text)
                                      : text}
                                  </li>
                                ))}
                              </ul>
                              <details className="report-source">
                                <summary>{t("View source")}</summary>
                                {group.evidence.map((quote, index) => (
                                  <blockquote key={index}>“{quote}”</blockquote>
                                ))}
                              </details>
                              <div className="report-actions">
                                <button onClick={() => editReport(group)}>
                                  {t("Edit details")}
                                </button>
                                {group.uncertaintyIds.length > 0 &&
                                  group.evidence.length > 0 && (
                                    <button
                                      onClick={() => setAssignReport(group)}
                                    >
                                      {t("Assign report")}
                                    </button>
                                  )}
                                <button onClick={() => reviewReport(group)}>
                                  {t("Mark reviewed")}
                                  <Check size={15} />
                                </button>
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                      <div className="review-record">
                        <h3>{t("Household details")}</h3>
                        <dl>
                          {survey.fields
                            .filter(
                              (f) =>
                                f.scope === "household" &&
                                survey.household.values[f.id] !== undefined &&
                                survey.household.values[f.id] !== null &&
                                survey.household.values[f.id] !== "",
                            )
                            .map((f) => (
                              <div key={f.id}>
                                <dt>{fieldLabel(f)}</dt>
                                <dd>
                                  {fieldValueText(
                                    f,
                                    survey.household.values[f.id],
                                    language,
                                  )}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                      {survey.members.map((m, index) => (
                        <div className="review-record" key={m.id}>
                          <h3>
                            <span className="member-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            {memberName(m, index, language)}
                          </h3>
                          <p className="review-member-health">
                            {healthStatusLabel(m, language)}
                          </p>
                          <dl>
                            {survey.fields
                              .filter(
                                (f) =>
                                  f.scope === "member" &&
                                  !(
                                    survey.status === "draft" &&
                                    survey.templateVersion >= 2 &&
                                    f.legacy
                                  ) &&
                                  m.values[f.id] !== undefined &&
                                  m.values[f.id] !== null &&
                                  m.values[f.id] !== "",
                              )
                              .map((f) => (
                                <div key={f.id}>
                                  <dt>
                                    {survey.status === "draft" &&
                                    f.section !== "notes" ? (
                                      <button
                                        className="review-field-link"
                                        onClick={() =>
                                          editIssue({
                                            id: `review-${m.id}-${f.id}`,
                                            memberId: m.id,
                                            fieldId: f.id,
                                            kind: "missing",
                                            message: "",
                                          })
                                        }
                                      >
                                        {fieldLabel(f)}
                                        <ChevronRight size={14} />
                                      </button>
                                    ) : (
                                      fieldLabel(f)
                                    )}
                                  </dt>
                                  <dd>
                                    {fieldValueText(
                                      f,
                                      m.values[f.id],
                                      language,
                                    )}
                                    {f.unit && (
                                      <small>
                                        {" "}
                                        {f.custom ? f.unit : t(f.unit)}
                                      </small>
                                    )}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      ))}
                      {survey.status === "draft" && (
                        <div className="finish-review">
                          <label>
                            <input
                              type="checkbox"
                              checked={reviewed}
                              disabled={busy}
                              onChange={(e) => setReviewed(e.target.checked)}
                            />
                            <span>{t("I have reviewed this visit.")}</span>
                          </label>
                          <Button
                            className="full-width"
                            disabled={
                              !reviewed ||
                              issues.length > 0 ||
                              busy ||
                              recording ||
                              extracting
                            }
                            onClick={finish}
                          >
                            {busy ? t("Saving visit…") : t("Finish visit")}
                            <Check size={19} />
                          </Button>
                          {(recording || extracting) && (
                            <p>
                              {t(
                                "Stop recording and wait for the remaining answers before finishing.",
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {step !== "review" && (
                    <div className="step-footer">
                      <Button
                        kind="quiet"
                        onClick={() =>
                          changeStep(
                            STEPS[
                              Math.max(
                                0,
                                STEPS.findIndex((s) => s.id === step) - 1,
                              )
                            ].id,
                          )
                        }
                        disabled={step === "household"}
                      >
                        <ArrowLeft size={17} />
                        {t("Back")}
                      </Button>
                      <Button
                        onClick={() =>
                          changeStep(
                            STEPS[
                              Math.min(
                                STEPS.length - 1,
                                STEPS.findIndex((s) => s.id === step) + 1,
                              )
                            ].id,
                          )
                        }
                      >
                        {step === "notes" ? t("Review visit") : t("Continue")}
                        <ArrowRight size={17} />
                      </Button>
                    </div>
                  )}
                </section>
                <aside className="visit-side-note">
                  <span className="round-symbol">
                    <Mic size={23} />
                  </span>
                  <h3>
                    {t("Your questions.")}
                    <br />
                    {t("Their answers.")}
                  </h3>
                  <p>
                    {t(
                      "Record with permission, or enter answers directly. You can edit any field at any time.",
                    )}
                  </p>
                  <div className="side-note-divider" />
                  <span className="side-label">{t("THIS VISIT")}</span>
                  <strong>{household.label}</strong>
                  <p>
                    {survey.members.length
                      ? t(
                          survey.members.length === 1
                            ? "{count} family member"
                            : "{count} family members",
                          { count: survey.members.length },
                        )
                      : t("Family details not yet entered")}
                  </p>
                  {survey.transcripts.length > 0 && (
                    <button onClick={() => setDialog("transcript")}>
                      {t("View conversation")}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </aside>
              </div>
              {survey.status === "draft" && (
                <div className="recorder-bar">
                  <div className="recorder-state">
                    <span
                      className={`recorder-icon ${recorder.status === "recording" ? "is-recording" : ""}`}
                    >
                      <Mic size={21} />
                    </span>
                    <span>
                      <strong>
                        {recorder.status === "recording"
                          ? t("Recording conversation")
                          : recorder.status === "paused"
                            ? t("Recording paused")
                            : recorder.status === "processing"
                              ? t("Finishing the conversation")
                              : extracting
                                ? t("Filling recorded answers")
                                : t("Ready to listen")}
                      </strong>
                      <small>
                        {recording
                          ? `${Math.floor(seconds / 60)
                              .toString()
                              .padStart(
                                2,
                                "0",
                              )}:${(seconds % 60).toString().padStart(2, "0")} · ${t("You can keep editing")}`
                          : t("Ask permission before recording.")}
                      </small>
                    </span>
                  </div>
                  <div className="recorder-actions">
                    <button
                      className="button quiet add-text-button"
                      disabled={busy}
                      onClick={() => setDialog("transcript")}
                    >
                      <FileText size={18} />
                      {t("Add text")}
                    </button>
                    {recorder.status === "recording" ? (
                      <>
                        <Button
                          kind="secondary"
                          onClick={() => recorder.pause()}
                        >
                          <Pause size={17} />
                          {t("Pause")}
                        </Button>
                        <Button onClick={() => void recorder.stop()}>
                          <Square size={15} />
                          {t("Stop")}
                        </Button>
                      </>
                    ) : recorder.status === "paused" ? (
                      <>
                        <Button
                          kind="secondary"
                          onClick={() => void recorder.stop()}
                        >
                          <Square size={15} />
                          {t("Stop")}
                        </Button>
                        <Button onClick={() => void recorder.resume()}>
                          <Play size={17} />
                          {t("Resume")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => void startRecording()}
                        disabled={
                          busy || offline || recorder.status === "processing"
                        }
                      >
                        <Mic size={18} />
                        {t("Start recording")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {view === "finished" && survey && household && (
            <div className="finished-view">
              <span className="finished-symbol">
                <Check size={41} />
              </span>
              <span className="eyebrow">{t("VISIT COMPLETE")}</span>
              <h1>{t("All recorded.")}</h1>
              <p>
                {household.label}
                <br />
                {date(survey.completedAt!, language)}
              </p>
              <div className="button-row">
                <Button
                  kind="secondary"
                  onClick={() => {
                    setStep("review");
                    navigate("survey", household.id, survey);
                  }}
                >
                  {t("View visit")}
                </Button>
                <Button onClick={() => navigate("households")}>
                  {t("Back to households")}
                  <ArrowRight size={17} />
                </Button>
              </div>
              <button
                className="repeat-link"
                onClick={() => openSurvey(household, undefined, survey.id)}
              >
                {t("Start a blank repeat visit")}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {view === "visits" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">{t("YOUR VISIT HISTORY")}</span>
                  <h1>{t("Every visit, in one place.")}</h1>
                  <p>
                    {t("Continue a draft or look back at a completed record.")}
                  </p>
                </div>
                <Button kind="secondary" onClick={exportRecords}>
                  <ArrowDownToLine size={18} />
                  {t("Export")}
                </Button>
              </div>
              <div className="segmented">
                {(["all", "draft", "completed"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={visitFilter === filter ? "selected" : ""}
                    onClick={() => setVisitFilter(filter)}
                    aria-pressed={visitFilter === filter}
                  >
                    {filter === "all"
                      ? t("All visits")
                      : filter === "draft"
                        ? t("In progress")
                        : t("Completed")}
                  </button>
                ))}
              </div>
              {surveys.filter(
                (s) => visitFilter === "all" || s.status === visitFilter,
              ).length ? (
                <div className="history-grid">
                  {surveys
                    .filter(
                      (s) => visitFilter === "all" || s.status === visitFilter,
                    )
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((s) => {
                      const h = households.find((h) => h.id === s.householdId);
                      if (!h) return null;
                      return (
                        <button
                          className="visit-card"
                          key={s.id}
                          onClick={() => openSurvey(h, s)}
                        >
                          <div className="visit-card-header">
                            <span>{date(s.createdAt, language)}</span>
                            <span
                              className={`pill ${s.status === "completed" ? "green" : "purple"}`}
                            >
                              {s.status === "completed"
                                ? t("Completed")
                                : t("In progress")}
                            </span>
                          </div>
                          <h3>{h.label}</h3>
                          <p>
                            {s.templateId === "pregnancy-follow-up"
                              ? t("Pregnancy survey")
                              : s.templateId === "rainy-season"
                                ? t("Rainy-season visit")
                                : s.repeatOf
                                  ? t("Repeat household visit")
                                  : t("Household visit")}
                            {h.code ? ` · ${h.code}` : ""}
                          </p>
                          <div className="visit-card-footer">
                            <span>
                              {s.status === "completed"
                                ? t("View record")
                                : t("Continue visit")}
                            </span>
                            <ArrowRight size={18} />
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : (
                <div className="surface">
                  <Empty
                    icon={FileText}
                    title={
                      visitFilter === "completed"
                        ? "Your completed visits will appear here."
                        : visitFilter === "draft"
                          ? "No visits in progress."
                          : "Your visit history starts here."
                    }
                    action={
                      <Button onClick={() => navigate("households")}>
                        {t("Go to households")}
                        <ArrowRight size={17} />
                      </Button>
                    }
                  >
                    {t("Open a household to begin a new visit.")}
                  </Empty>
                </div>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">{t("YOUR WORKSPACE")}</span>
                  <h1>{t("Settings")}</h1>
                  <p>
                    {t(
                      "Manage your preferences and the records on this device.",
                    )}
                  </p>
                </div>
              </div>
              <div className="settings-layout">
                <section>
                  <h2 className="settings-title">{t("Your details")}</h2>
                  <div className="settings-group">
                    <label>
                      <span>
                        <strong>{t("Your name")}</strong>
                        <small>{t("Optional")}</small>
                      </span>
                      <input
                        aria-label={t("Your name")}
                        placeholder={t("Enter your name")}
                        value={settings.workerName}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            workerName: e.target.value,
                          }).catch(() => {})
                        }
                      />
                    </label>
                    <label>
                      <span>
                        <strong>{t("Assigned area")}</strong>
                        <small>{t("Village or locality")}</small>
                      </span>
                      <input
                        aria-label={t("Assigned area")}
                        placeholder={t("Enter your area")}
                        value={settings.area}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            area: e.target.value,
                          }).catch(() => {})
                        }
                      />
                    </label>
                    <label>
                      <span>
                        <strong>{t("App language")}</strong>
                        <small>
                          {t("Choose the language for buttons and questions")}
                        </small>
                      </span>
                      <select
                        aria-label={t("App language")}
                        id="app-language"
                        value={settings.language}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            language: e.target
                              .value as SurveySettings["language"],
                          }).catch(() => {})
                        }
                      >
                        {LANGUAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>
                        <strong>{t("Text size")}</strong>
                        <small>{t("Choose what’s comfortable")}</small>
                      </span>
                      <select
                        aria-label={t("Text size")}
                        value={settings.textSize}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            textSize: e.target.value as "default" | "large",
                          }).catch(() => {})
                        }
                      >
                        <option value="default">{t("Default")}</option>
                        <option value="large">{t("Larger")}</option>
                      </select>
                    </label>
                  </div>
                  <h2 className="settings-title">{t("Your records")}</h2>
                  <div className="settings-group">
                    <button onClick={exportRecords}>
                      <span className="setting-icon">
                        <ArrowDownToLine size={21} />
                      </span>
                      <span>
                        <strong>{t("Export records")}</strong>
                        <small>
                          {t("Download a backup of households and visits")}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (installPrompt.current) {
                          void installPrompt.current.prompt();
                          installPrompt.current = null;
                        } else setDialog("install");
                      }}
                    >
                      <span className="setting-icon">
                        <House size={21} />
                      </span>
                      <span>
                        <strong>{t("Install DARA")}</strong>
                        <small>
                          {t("Open your workspace from your home screen")}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      onClick={() => setDialog("reset-entries")}
                      disabled={resetting || busy}
                    >
                      <span className="setting-icon">
                        <Trash2 size={21} />
                      </span>
                      <span>
                        <strong>{t("Clear my entries")}</strong>
                        <small>
                          {t("Keep example households and preferences")}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      onClick={() => {
                        void recorder.stop();
                        setEntered(false);
                      }}
                    >
                      <span className="setting-icon">
                        <ArrowLeft size={21} />
                      </span>
                      <span>
                        <strong>{t("Back to DARA")}</strong>
                        <small>{t("Return to the introduction")}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </section>
                <aside className="settings-note">
                  <span className="round-symbol">
                    <ShieldCheck size={25} />
                  </span>
                  <h3>
                    {t("Know where your")}
                    <br />
                    {t("records live.")}
                  </h3>
                  <p>
                    {t(
                      "Households and visits are saved in this browser on this device. They are not automatically backed up or shared with another device.",
                    )}
                  </p>
                  <p>
                    {t(
                      "Export a copy regularly. Clearing browser storage can remove saved records.",
                    )}
                  </p>
                  <hr />
                  <p>
                    {t(
                      "When you record, audio is sent to the connected speech service. Conversation text is sent to the connected AI service to help fill the form. Ask the family’s permission first.",
                    )}
                  </p>
                </aside>
              </div>
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} />
              <span>{t(item.label)}</span>
            </button>
          ))}
        </nav>
      </div>
      {accessSheet}
      {(dialog === "add-household" || dialog === "edit-household") && (
        <HouseholdSheet
          household={dialog === "edit-household" ? household : undefined}
          existing={households}
          onClose={closeDialog}
          onDelete={() => setDialog("delete-household")}
          canDelete={selectedSurveys.length === 0}
          onSave={async (value) => {
            await saveHousehold({ ...value, workspaceGeneration: generation });
            setDialog(null);
            navigate("household", value.id);
          }}
        />
      )}
      {dialog === "custom-field" && survey && (
        <CustomFieldSheet
          onClose={closeDialog}
          onAdd={(definition) => {
            update((s) => addCustomSurveyField(s, definition));
            setDialog(null);
          }}
          defaultScope={
            step === "health" || step === "family" ? "member" : "household"
          }
          section={
            step === "notes"
              ? "notes"
              : step === "family"
                ? "family"
                : step === "health"
                  ? "health"
                  : "household"
          }
        />
      )}
      {dialog === "consent" && (
        <ConsentSheet
          onClose={closeDialog}
          onStart={async () => {
            if (finishing.current || completing.current) return;
            if (!survey) return;
            consented.current.add(survey.id);
            setDialog(null);
            await recorder.start();
          }}
        />
      )}
      {dialog === "transcript" && survey && (
        <ConversationSheet
          survey={survey}
          busy={busy || extracting}
          onClose={closeDialog}
          onAdd={async (text) => {
            if (finishing.current || completing.current) return;
            const current = currentRef.current;
            if (!current) return;
            const segment: SurveyTranscript = {
              id: crypto.randomUUID(),
              index:
                Math.max(-1, ...current.transcripts.map((t) => t.index)) + 1,
              text,
              timestamp: new Date().toISOString(),
              language: "auto",
              source: "manual",
            };
            update(addSurveyTranscript(current, segment));
            await retryTranscript(segment);
          }}
          onRetry={retryTranscript}
        />
      )}
      {dialog === "install" && (
        <Sheet title={t("Keep DARA close")} onClose={closeDialog}>
          <div className="sheet-content">
            <span className="round-symbol">
              <House size={28} />
            </span>
            <p>
              {t("On Android, open Chrome’s menu and choose")}{" "}
              <strong>{t("Install app")}</strong> {t("or")}{" "}
              <strong>{t("Add to Home screen")}</strong>.
            </p>
            <p>
              {t("On iPhone, open the Share menu in Safari and choose")}{" "}
              <strong>{t("Add to Home Screen")}</strong>.
            </p>
            <p>
              {t(
                "On desktop, use the install icon in your browser’s address bar, if available.",
              )}
            </p>
            <Button className="full-width" onClick={closeDialog}>
              {t("Got it")}
            </Button>
          </div>
        </Sheet>
      )}
      {dialog === "reset-entries" && (
        <Sheet
          title={t("Clear your entries?")}
          onClose={busy || resetting ? () => {} : closeDialog}
        >
          <div className="sheet-content">
            <p>
              {t(
                "Your own households and visits will be removed from this device. The five example households will be restored and your preferences will be kept.",
              )}
            </p>
            <p>
              {t(
                "Export your records first if you need a backup. This cannot be undone.",
              )}
            </p>
            <Button
              kind="secondary"
              className="full-width"
              onClick={exportRecords}
              disabled={busy || resetting}
            >
              <ArrowDownToLine size={18} />
              {t("Export records")}
            </Button>
            <div className="button-row">
              <Button
                kind="secondary"
                onClick={closeDialog}
                disabled={busy || resetting}
              >
                {t("Keep my entries")}
              </Button>
              <Button
                kind="danger"
                onClick={() => void clearOwnEntries()}
                disabled={busy || resetting}
              >
                {busy || resetting ? t("Clearing…") : t("Clear entries")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {dialog === "delete-household" && household && (
        <Sheet title={t("Remove this household?")} onClose={closeDialog}>
          <div className="sheet-content">
            <p>
              {household.label}{" "}
              {t(
                "will be removed from this device. Households with visit records cannot be removed.",
              )}
            </p>
            <div className="button-row">
              <Button kind="secondary" onClick={closeDialog}>
                {t("Keep household")}
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  void deleteHousehold(household.id)
                    .then(() => {
                      setDialog(null);
                      navigate("households");
                    })
                    .catch((e) =>
                      setNotice(
                        e instanceof Error
                          ? e.message
                          : "Could not remove household.",
                      ),
                    );
                }}
              >
                {t("Remove household")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {assignReport && survey && (
        <AssignReportSheet
          group={assignReport}
          members={survey.members}
          onClose={() => setAssignReport(null)}
          onAssign={(member, destination) => {
            const current = currentRef.current;
            if (!current) return;
            const record = member
              ? current.members.find((item) => item.id === member)
              : current.household;
            if (!record)
              throw new Error(
                "Select a family member before adding the report.",
              );
            const previous = String(record.values[destination] ?? "");
            const report = assignReport.evidence
              .filter((quote) => !previous.includes(quote))
              .join("\n\n");
            const combined = [previous, report].filter(Boolean).join("\n\n");
            if (combined.length > 4000)
              throw new Error(
                "This report is too long for one answer. Edit the answer manually.",
              );
            let next = editSurveyField(current, member, destination, combined);
            if (
              member &&
              destination === "healthHistory" &&
              !record.values.healthStatus
            )
              next = editSurveyField(next, member, "healthStatus", "concerns");
            for (const id of assignReport.uncertaintyIds)
              next = resolveSurveyUncertainty(next, id);
            for (const id of assignReport.noteIds)
              next = reviewSurveyNote(next, id);
            update(next);
            setAssignReport(null);
          }}
        />
      )}
      {removeMember && (
        <Sheet
          title={t("Remove this family member?")}
          onClose={() => setRemoveMember(null)}
        >
          <div className="sheet-content">
            <p>
              {t(
                "Their answers in this draft will also be removed. The household count will be updated.",
              )}
            </p>
            <div className="button-row">
              <Button kind="secondary" onClick={() => setRemoveMember(null)}>
                {t("Keep member")}
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  update((s) => removeSurveyMember(s, removeMember, true));
                  setRemoveMember(null);
                }}
              >
                {t("Remove member")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
function UserMark() {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 20v-1.5a7 7 0 0 1 14 0V20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function MemberPicker({
  members,
  current,
  onSelect,
}: {
  members: SurveyMember[];
  current?: string;
  onSelect: (id: string) => void;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  return (
    <div className="member-picker" aria-label={t("Choose family member")}>
      {members.map((m, index) => (
        <button
          key={m.id}
          className={m.id === current ? "selected" : ""}
          onClick={() => onSelect(m.id)}
          aria-pressed={m.id === current}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          {memberName(m, index, language)}
        </button>
      ))}
    </div>
  );
}
function CareChecklist({
  title,
  fields,
  record,
  memberId,
  disabled,
  onChange,
  onFocus,
  onBlur,
}: {
  title: string;
  fields: SurveyFieldDefinition[];
  record: SurveyAnswerRecord;
  memberId: string | null;
  disabled: boolean;
  onChange: (field: string, value: SurveyValue) => void;
  onFocus: (field: string) => void;
  onBlur: (field: string) => void;
}) {
  const { t, fieldLabel } = useLanguage();
  return (
    <fieldset className="care-checklist">
      <legend>{t(title)}</legend>
      <p>{t("Tick each topic after discussing it.")}</p>
      {fields.map((field) => {
        const id = `answer-${memberId ?? "household"}-${field.id}`;
        const meta = record.meta[field.id];
        return (
          <div className="care-checklist-item" key={field.id}>
            <label htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={record.values[field.id] === "done"}
                disabled={disabled}
                onChange={(event) =>
                  onChange(field.id, event.target.checked ? "done" : "pending")
                }
                onFocus={() => onFocus(field.id)}
                onBlur={() => onBlur(field.id)}
              />
              <span>{fieldLabel(field)}</span>
            </label>
            <div className="checklist-meta">
              <span>
                {meta?.manuallyProtected
                  ? t("Edited by you")
                  : meta?.source === "extracted"
                    ? t("From conversation")
                    : ""}
              </span>
              {meta?.evidence && (
                <details>
                  <summary>{t("View source")}</summary>
                  <blockquote>“{meta.evidence}”</blockquote>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
function AssignReportSheet({
  group,
  members,
  onClose,
  onAssign,
}: {
  group: ReviewReport;
  members: SurveyMember[];
  onClose: () => void;
  onAssign: (
    member: string | null,
    destination: "householdNotes" | "healthHistory",
  ) => void;
}) {
  const { t, language, message } = useLanguage();
  const [target, setTarget] = useState(group.memberId ?? "");
  const [error, setError] = useState("");
  return (
    <Sheet title={t("Assign report")} onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (!target) return;
            onAssign(
              target === "household" ? null : target,
              target === "household" ? "householdNotes" : "healthHistory",
            );
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "The report could not be added.",
            );
          }
        }}
      >
        <p>
          {t(
            "Choose where this report belongs. The original words will be added to household notes or the person’s health history.",
          )}
        </p>
        <div className="assignment-evidence">
          {group.evidence.map((quote, index) => (
            <blockquote key={index}>“{quote}”</blockquote>
          ))}
        </div>
        <label className="form-label">
          {t("Record under")}
          <select
            value={target}
            required
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">{t("Choose a household or person")}</option>
            <option value="household">{t("Household notes")}</option>
            {members.map((member, index) => (
              <option key={member.id} value={member.id}>
                {memberName(member, index, language)}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {message(error)}
          </p>
        )}
        <Button type="submit" className="full-width" disabled={!target}>
          {t("Add report")}
        </Button>
      </form>
    </Sheet>
  );
}
function AnswerField({
  field,
  memberId,
  value,
  meta,
  disabled,
  needsReview,
  issue,
  onChange,
  onFocus,
  onBlur,
}: {
  field: SurveyFieldDefinition;
  memberId: string | null;
  value: SurveyValue | undefined;
  meta?: { source: string; manuallyProtected: boolean; evidence?: string };
  disabled: boolean;
  needsReview: boolean;
  issue?: string;
  onChange: (value: SurveyValue) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const id = `answer-${memberId ?? "household"}-${field.id}`;
  const shared = {
    id,
    disabled,
    onFocus,
    onBlur,
    "aria-describedby": `${id}-help`,
    "aria-invalid": !!issue,
  };
  return (
    <div
      className={`answer-field ${field.type === "textarea" ? "wide" : ""} ${issue ? "invalid" : ""}`}
    >
      <label htmlFor={id}>
        {fieldLabel(field)}
        {field.required && (
          <span className="required-label">{t("Required")}</span>
        )}
        {field.unit && (
          <span className="field-unit">
            {field.custom ? field.unit : t(field.unit)}
          </span>
        )}
        {field.custom && (
          <span className="custom-label">{t("Added question")}</span>
        )}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...shared}
          rows={3}
          placeholder={t("Enter the answer")}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          {...shared}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t("Select an answer")}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {optionLabel(field, o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={
            field.id === "phone" || field.id === "householdPhone"
              ? "tel"
              : "text"
          }
          inputMode={
            field.type === "number"
              ? "decimal"
              : field.id === "phone" || field.id === "householdPhone"
                ? "tel"
                : "text"
          }
          autoComplete="off"
          placeholder={t(
            field.type === "number" ? "Enter a number" : "Enter the answer",
          )}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
        />
      )}
      <div className="answer-help" id={`${id}-help`}>
        {issue ? (
          <span>{message(issue, field)}</span>
        ) : needsReview ? (
          <span>{t("Needs review")}</span>
        ) : meta?.manuallyProtected ? (
          <span>{t("Edited by you")}</span>
        ) : meta?.source === "extracted" ? (
          <span>
            <Check size={13} />
            {t("From conversation")}
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
      <div className="answer-source">
        {meta?.evidence && (
          <details>
            <summary>{t("View source")}</summary>
            <blockquote>“{meta.evidence}”</blockquote>
          </details>
        )}
      </div>
    </div>
  );
}
function AccessSheet({
  onClose,
  onSuccess,
  notice,
}: {
  onClose: () => void;
  onSuccess: () => void;
  notice: string;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok || !result.authenticated)
        throw new Error(
          (typeof result.error === "string"
            ? result.error
            : result.error?.message) ||
            "That access code could not be verified.",
        );
      onSuccess();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open the workspace. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={t("Open your workspace")}
      onClose={onClose}
      className="access-sheet"
    >
      <form className="sheet-content" onSubmit={submit}>
        <span className="round-symbol">
          <LockKeyhole size={26} />
        </span>
        <p>{t("Enter the workspace access code to continue.")}</p>
        <label className="form-label">
          {t("Access code")}
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("Enter access code")}
          />
        </label>
        {(error || notice) && (
          <p className="inline-error" role="alert">
            {message(error || notice)}
          </p>
        )}
        <Button type="submit" className="full-width" disabled={busy}>
          {busy ? t("Opening…") : t("Open workspace")}
          <ArrowRight size={17} />
        </Button>
      </form>
    </Sheet>
  );
}
function HouseholdSheet({
  household,
  existing,
  onClose,
  onSave,
  onDelete,
  canDelete,
}: {
  household?: SurveyHousehold | null;
  existing: SurveyHousehold[];
  onClose: () => void;
  onSave: (h: SurveyHousehold) => Promise<void>;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const [label, setLabel] = useState(household?.label ?? ""),
    [code, setCode] = useState(household?.code ?? ""),
    [address, setAddress] = useState(household?.address ?? ""),
    [area, setArea] = useState(household?.area ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() && !code.trim() && !address.trim()) {
      setError("Add a house number, address, or household name.");
      return;
    }
    if (
      code.trim() &&
      existing.some(
        (h) =>
          h.id !== household?.id &&
          h.code.trim().toLowerCase() === code.trim().toLowerCase(),
      )
    ) {
      setError("That house number is already in your register.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...household,
        id: household?.id ?? crypto.randomUUID(),
        label: label.trim() || code.trim() || address.trim().slice(0, 80),
        code: code.trim(),
        address: address.trim(),
        area: area.trim(),
        createdAt: household?.createdAt ?? new Date().toISOString(),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The household could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={household ? "Household details" : "Add a household"}
      onClose={onClose}
    >
      <form className="sheet-content" onSubmit={submit}>
        <p>
          {t(
            "Start with a house number or address. Family members can be added during the visit.",
          )}
        </p>
        <label className="form-label">
          {t("Household name")}
          <span>{t("Optional")}</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("Family name or a familiar label")}
          />
        </label>
        <label className="form-label">
          {t("House number")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("e.g. 14 / A")}
          />
        </label>
        <label className="form-label">
          {t("Address")}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("Street or nearby landmark")}
          />
        </label>
        <label className="form-label">
          {t("Area")}
          <span>{t("Optional")}</span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder={t("Village or locality")}
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {message(error)}
          </p>
        )}
        <Button type="submit" className="full-width" disabled={busy}>
          {busy ? t("Saving…") : t("Save household")}
          <Check size={18} />
        </Button>
        {household && canDelete && (
          <button className="remove-link" type="button" onClick={onDelete}>
            <Trash2 size={16} />
            {t("Remove household")}
          </button>
        )}
      </form>
    </Sheet>
  );
}
function CustomFieldSheet({
  onClose,
  onAdd,
  defaultScope,
  section,
}: {
  onClose: () => void;
  onAdd: (definition: {
    label: string;
    scope: "household" | "member";
    type: "text" | "number" | "select" | "textarea";
    required: boolean;
    options?: { value: string; label: string }[];
    section: "household" | "family" | "health" | "notes";
  }) => void;
  defaultScope: "household" | "member";
  section: "household" | "family" | "health" | "notes";
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const [label, setLabel] = useState(""),
    [scope, setScope] = useState(defaultScope),
    [type, setType] = useState<"text" | "number" | "select" | "textarea">(
      "text",
    ),
    [required, setRequired] = useState(false),
    [options, setOptions] = useState(""),
    [error, setError] = useState("");
  return (
    <Sheet title={t("Add a question")} onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) {
            setError("Enter the question you want to ask.");
            return;
          }
          const choices = options
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          if (type === "select" && choices.length < 2) {
            setError("Enter at least two choices, separated by commas.");
            return;
          }
          onAdd({
            label: label.trim(),
            scope,
            type,
            required,
            section:
              scope === "household"
                ? section === "notes"
                  ? "notes"
                  : "household"
                : section === "family"
                  ? "family"
                  : section === "notes"
                    ? "notes"
                    : "health",
            ...(type === "select"
              ? { options: choices.map((x) => ({ value: x, label: x })) }
              : {}),
          });
        }}
      >
        <p>
          {t(
            "Add a question for this visit. It will be available for manual answers and conversation filling.",
          )}
        </p>
        <label className="form-label">
          {t("Question")}
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("What would you like to record?")}
          />
        </label>
        <label className="form-label">
          {t("Ask about")}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "household" | "member")}
          >
            <option value="household">{t("The household")}</option>
            {section !== "notes" && (
              <option value="member">{t("Each family member")}</option>
            )}
          </select>
        </label>
        <label className="form-label">
          {t("Answer type")}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="text">{t("Short answer")}</option>
            <option value="textarea">{t("Long answer")}</option>
            <option value="number">{t("Number")}</option>
            <option value="select">{t("Choose from a list")}</option>
          </select>
        </label>
        {type === "select" && (
          <label className="form-label">
            {t("Choices")}
            <input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={t("Yes, No, Not known")}
            />
            <small>{t("Separate choices with a comma.")}</small>
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>{t("Require an answer before finishing")}</span>
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {message(error)}
          </p>
        )}
        <Button type="submit" className="full-width">
          {t("Add question")}
          <Plus size={18} />
        </Button>
      </form>
    </Sheet>
  );
}
function ConsentSheet({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: () => Promise<void>;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const [checked, setChecked] = useState(false);
  return (
    <Sheet title={t("Before you start recording")} onClose={onClose}>
      <div className="sheet-content consent-content">
        <span className="round-symbol">
          <Mic size={28} />
        </span>
        <h3>{t("Make sure everyone is comfortable.")}</h3>
        <p>
          {t(
            "Let the family know you’re recording to help fill the visit record. Audio and conversation text will be sent to the connected speech and AI services.",
          )}
        </p>
        <div className="consent-facts">
          <p>
            <Check size={17} />
            {t("You can pause or stop at any time.")}
          </p>
          <p>
            <Check size={17} />
            {t("You will review the answers before saving.")}
          </p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>{t("The family has agreed to recording.")}</span>
        </label>
        <Button
          className="full-width"
          disabled={!checked}
          onClick={() => void onStart()}
        >
          {t("Start recording")}
          <Mic size={18} />
        </Button>
        <Button kind="quiet" className="full-width" onClick={onClose}>
          {t("Continue without recording")}
        </Button>
      </div>
    </Sheet>
  );
}
function ConversationSheet({
  survey,
  busy,
  onClose,
  onAdd,
  onRetry,
}: {
  survey: Survey;
  busy: boolean;
  onClose: () => void;
  onAdd: (text: string) => Promise<void>;
  onRetry: (segment: SurveyTranscript) => Promise<void>;
}) {
  const { language, t, message, fieldLabel, optionLabel, formatDate } =
    useLanguage();
  const [text, setText] = useState(""),
    [adding, setAdding] = useState(false);
  return (
    <Sheet
      title={t("Conversation")}
      onClose={onClose}
      className="conversation-sheet"
    >
      <div className="sheet-content">
        <p>
          {t(
            "Original words stay with the record, so you can check where an answer came from.",
          )}
        </p>
        <div className="conversation-list">
          {survey.transcripts.length === 0 ? (
            <div className="conversation-empty">
              <FileText size={28} />
              <h3>{t("No conversation recorded yet.")}</h3>
              <p>{t("Start recording, or add the conversation text below.")}</p>
            </div>
          ) : (
            survey.transcripts.map((segment, index) => (
              <article key={segment.id}>
                <header>
                  <span>
                    {segment.source === "manual"
                      ? t("Added text")
                      : t("Recorded conversation")}
                  </span>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </header>
                <p>{segment.text}</p>
                {survey.status === "draft" &&
                  !survey.processedSegmentIds.includes(segment.id) && (
                    <Button
                      kind="secondary"
                      disabled={busy}
                      onClick={() => void onRetry(segment)}
                    >
                      {busy
                        ? t("Processing…")
                        : t("Fill answers from this text")}
                    </Button>
                  )}
              </article>
            ))
          )}
        </div>
        {survey.status === "draft" && (
          <form
            className="conversation-add"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim() || adding) return;
              setAdding(true);
              try {
                await onAdd(text.trim());
                setText("");
              } finally {
                setAdding(false);
              }
            }}
          >
            <label className="form-label">
              {t("Add conversation text")}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={t(
                  "Enter what was said, including who the answer refers to.",
                )}
              />
            </label>
            <Button
              type="submit"
              className="full-width"
              disabled={!text.trim() || adding || busy}
            >
              {adding ? t("Filling answers…") : t("Fill answers from text")}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
