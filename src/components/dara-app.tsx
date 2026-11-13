"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
import {
  addCustomSurveyField,
  addSurveyMember,
  addSurveyTranscript,
  applySurveyExtraction,
  completeSurvey,
  createSurvey,
  editSurveyField,
  removeSurveyMember,
  resolveSurveyConflict,
  resolveSurveyUncertainty,
  reviewSurvey,
  reviewSurveyNote,
} from "@/lib/survey";
import type {
  Survey,
  SurveyFieldDefinition,
  SurveyMember,
  SurveyReviewIssue,
  SurveyTranscript,
  SurveyValue,
} from "@/lib/survey";
import type { SurveyHousehold } from "@/lib/survey-db";
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
  | null;
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
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const valueText = (value: SurveyValue | undefined) =>
  value === null || value === undefined || value === ""
    ? "Not recorded"
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);
const memberName = (member: SurveyMember, index: number) =>
  String(member.values.name || `Family member ${index + 1}`);
const iconInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button className="dara-brand" onClick={onClick} aria-label="DARA home">
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
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-handle" />
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
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
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Icon size={34} strokeWidth={1.35} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function PhonePreview() {
  return (
    <div
      className="phone-preview"
      aria-label="Preview of DARA’s blank household visit form"
    >
      <div className="phone-camera" />
      <div className="phone-status">
        <span>9:41</span>
        <span>••• ▰</span>
      </div>
      <div className="phone-screen">
        <div className="phone-top">
          <ArrowLeft size={18} />
          <span>Household visit</span>
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
          Let’s start
          <br />
          with the family.
        </h3>
        <p>How many people live in this household?</p>
        <div className="phone-field">
          <span>Family members</span>
          <strong>Enter a number</strong>
          <UsersRound size={21} />
        </div>
        <div className="phone-note">
          <Mic size={20} />
          <span>
            Ask naturally.
            <br />
            Keep the conversation going.
          </span>
        </div>
        <div className="phone-bottom">
          Continue <ArrowRight size={16} />
        </div>
      </div>
      <div className="phone-home" />
    </div>
  );
}
function Landing({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
  return (
    <div className="landing" id="dara-top">
      <header className="landing-nav">
        <Brand
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <nav aria-label="Introduction">
          <a href="#how-it-works">How it works</a>
          <a href="#your-workspace">Your workspace</a>
        </nav>
        <Button onClick={onOpen} disabled={busy}>
          Open workspace <ArrowRight size={17} />
        </Button>
      </header>
      <main>
        <section className="landing-hero">
          <span className="intro-label">A helping hand for ASHA workers</span>
          <h1>
            <span>Less paperwork.</span>
            <br />
            More time with families.
          </h1>
          <p>
            A conversation can hold everything you need.
            <br className="desktop-only" /> DARA helps you turn it into a clear,
            complete visit record.
          </p>
          <div className="hero-actions">
            <Button onClick={onOpen} disabled={busy}>
              {busy ? "Opening…" : "Open workspace"} <ArrowRight size={18} />
            </Button>
            <a className="hero-link" href="#how-it-works">
              See how it works <ChevronDown size={16} />
            </a>
          </div>
          <div className="hero-product">
            <div className="hero-note note-left">
              <span>
                <Mic size={22} />
              </span>
              <div>
                <strong>Your questions.</strong>
                <p>Your conversation.</p>
              </div>
            </div>
            <PhonePreview />
            <div className="hero-note note-right">
              <span>
                <ClipboardCheck size={22} />
              </span>
              <div>
                <strong>A clearer record.</strong>
                <p>Ready for your review.</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="landing-how">
          <div>
            <span className="intro-label">Made around your visit</span>
            <h2>
              A few simple steps.
              <br />A little less to carry.
            </h2>
          </div>
          <div className="how-items">
            <article>
              <span className="how-icon">
                <House size={25} />
              </span>
              <h3>Choose a household</h3>
              <p>Open a family’s record or add a new house to your register.</p>
            </article>
            <article>
              <span className="how-icon">
                <Mic size={25} />
              </span>
              <h3>Have the conversation</h3>
              <p>
                Record with permission. Answers find their place while you keep
                talking.
              </p>
            </article>
            <article>
              <span className="how-icon">
                <Check size={25} />
              </span>
              <h3>Review and save</h3>
              <p>
                Check the details, make your edits, and finish the visit in your
                own time.
              </p>
            </article>
          </div>
        </section>
        <section id="your-workspace" className="landing-workspace">
          <div>
            <span className="intro-label">
              Your register, thoughtfully organised
            </span>
            <h2>
              One place for the
              <br />
              whole visit.
            </h2>
            <p>
              Family details, health observations, and the notes that matter.
              Easy to find. Always yours to edit.
            </p>
            <Button onClick={onOpen} disabled={busy}>
              Open workspace <ArrowRight size={17} />
            </Button>
          </div>
          <div className="workspace-preview">
            <div>
              <span className="preview-house-icon">
                <House size={26} />
              </span>
              <span>
                <strong>Household visit</strong>
                <small>Questions, answers, and your notes</small>
              </span>
              <span className="preview-status">Draft</span>
            </div>
            <div className="preview-section">
              <span>Family details</span>
              <ChevronRight size={17} />
            </div>
            <div className="preview-section">
              <span>Health observations</span>
              <ChevronRight size={17} />
            </div>
            <div className="preview-section">
              <span>Visit notes</span>
              <ChevronRight size={17} />
            </div>
            <p>
              <Check size={15} /> Every entry can be reviewed and edited.
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <p>Digital Assisted Recordkeeping for ASHA Workers</p>
        <a href="#dara-top">
          Back to top <ArrowRight size={14} />
        </a>
      </footer>
    </div>
  );
}

export default function DaraApp() {
  const workspace = useSurveys();
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
  } = workspace;
  const [entered, setEntered] = useState(false),
    [opening, setOpening] = useState(false),
    [view, setView] = useState<View>("households"),
    [tab, setTab] = useState<Tab>("households"),
    [householdId, setHouseholdId] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null),
    [step, setStep] = useState<Step>("household"),
    [memberId, setMemberId] = useState<string>(""),
    [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState(""),
    [visitFilter, setVisitFilter] = useState<"all" | "draft" | "completed">(
      "all",
    ),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(false),
    [reviewed, setReviewed] = useState(false),
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
    completing = useRef(false),
    draftCache = useRef(new Map<string, Survey>());
  currentRef.current = survey;
  if (survey) draftCache.current.set(survey.id, survey);
  workspaceRef.current = { households, surveys };
  viewRef.current = view;
  stepRef.current = step;
  saveRef.current = saveSurvey;
  const household = households.find((h) => h.id === householdId) ?? null;
  const activeMember =
    survey?.members.find((m) => m.id === memberId) ?? survey?.members[0];
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
    async (text: string) => {
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
        language: settings.language,
        source: "gnani",
      };
      const withTranscript = addSurveyTranscript(current, segment);
      try {
        await commitToSurvey(withTranscript);
      } catch {
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
    [recordingSurveyId, settings.language, commitToSurvey],
  );
  const recorder = useRecorder({
    language: settings.language,
    onTranscript: processTranscript,
  });
  const recording =
    recorder.status === "recording" ||
    recorder.status === "paused" ||
    recorder.status === "processing";
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const closeDialog = useCallback(() => setDialog(null), []);
  async function navigate(next: View, homeId?: string, currentSurvey?: Survey) {
    if (completing.current && next !== "finished") return;
    if (next !== "survey" && recording) await recorder.stop();
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
      if (completing.current) return;
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
  ) {
    if (completing.current) return;
    await recorderRef.current.stop();
    const next =
      existing ??
      createSurvey({ householdId: home.id, ...(repeatOf ? { repeatOf } : {}) });
    update(next);
    setHouseholdId(home.id);
    setMemberId(next.members[0]?.id ?? "");
    setStep(next.status === "completed" ? "review" : "household");
    setReviewed(false);
    setSeconds(0);
    setTab("households");
    navigate("survey", home.id, next);
  }
  function changeStep(next: Step) {
    if (completing.current) return;
    setStep(next);
    setReviewed(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function edit(member: string | null, field: string, value: SurveyValue) {
    update((s) => editSurveyField(s, member, field, value));
  }
  async function finish() {
    const current = currentRef.current;
    if (!current || recording || extracting || !reviewed) return;
    completing.current = true;
    setBusy(true);
    try {
      const completed = completeSurvey(current);
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
      setBusy(false);
    }
  }
  async function startRecording() {
    if (!survey || survey.status === "completed") return;
    if (!consented.current.has(survey.id)) {
      setDialog("consent");
      return;
    }
    setNotice("");
    await recorder.start();
  }
  async function retryTranscript(segment: SurveyTranscript) {
    const current = currentRef.current;
    if (!current) return;
    pendingExtractions.current++;
    setExtracting(true);
    try {
      const envelope = await extractSurvey(current, segment);
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
      setNotice("The conversation has been processed.");
    } catch (e) {
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
  function editIssue(issue: SurveyReviewIssue) {
    if (issue.memberId) {
      setMemberId(issue.memberId);
      const definition = survey?.fields.find((f) => f.id === issue.fieldId);
      setStep(
        definition?.section === "health"
          ? "health"
          : definition?.section === "notes"
            ? "notes"
            : "family",
      );
    } else setStep(issue.fieldId === "notes" ? "notes" : "household");
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
  function renderField(field: SurveyFieldDefinition, member: string | null) {
    if (!survey) return null;
    const record = member
      ? survey.members.find((m) => m.id === member)
      : survey.household;
    if (!record) return null;
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
        <p>Opening your register…</p>
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
        <nav aria-label="Workspace navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} strokeWidth={1.7} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-wordmark">
            A little less
            <br />
            to carry.
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
              <strong>{settings.workerName || "Your workspace"}</strong>
              <small>{settings.area || "ASHA field register"}</small>
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
              "Household care, thoughtfully recorded."
            )}
          </span>
          <div className="header-right">
            <span>
              {new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "long",
                timeZone: "Asia/Kolkata",
              }).format(new Date())}
            </span>
            <button
              className="icon-button"
              aria-label="Open settings"
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
              You’re offline. You can keep editing saved records on this device.
            </span>
          </div>
        )}
        {error && (
          <div className="status-banner error-banner" role="alert">
            <Info size={18} />
            <span>{error}</span>
            <Button kind="secondary" onClick={exportRecords}>
              Export records
            </Button>
          </div>
        )}
        {(notice || recorder.error) && (
          <div className="status-banner" role="status">
            <Info size={18} />
            <span>{notice || recorder.error}</span>
            {/unlock|access code|workspace code/i.test(
              notice || recorder.error || "",
            ) && (
              <Button kind="secondary" onClick={() => setDialog("access")}>
                Unlock workspace
              </Button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss message"
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
                  <span className="eyebrow">YOUR REGISTER</span>
                  <h1>Households</h1>
                  <p>Every visit begins with a family.</p>
                </div>
                <Button onClick={() => setDialog("add-household")}>
                  <Plus size={19} />
                  Add household
                </Button>
              </div>
              {households.length > 0 && (
                <div className="list-toolbar">
                  <label className="search-control">
                    <Search size={19} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, house number, or address"
                      aria-label="Search households"
                    />
                    {search && (
                      <button
                        aria-label="Clear search"
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
                    title="Your first household starts here."
                    action={
                      <Button onClick={() => setDialog("add-household")}>
                        <Plus size={18} />
                        Add a household
                      </Button>
                    }
                  >
                    Add a house number or address. Family details can be filled
                    in naturally during the visit.
                  </Empty>
                  <div className="welcome-bottom">
                    <span>
                      <House size={18} />
                      Add a household
                    </span>
                    <ArrowRight size={16} />
                    <span>
                      <Mic size={18} />
                      Have a conversation
                    </span>
                    <ArrowRight size={16} />
                    <span>
                      <Check size={18} />
                      Review the record
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
                              <span className="pill purple">Draft visit</span>
                            ) : latest ? (
                              <span className="pill green">Visited</span>
                            ) : (
                              <span className="pill">New household</span>
                            )}
                          </div>
                          <h2>{h.label}</h2>
                          <p>
                            {[h.code, h.address].filter(Boolean).join(" · ") ||
                              "Add address in household details"}
                          </p>
                          <div className="household-card-bottom">
                            <span>
                              {latest
                                ? `Last visit · ${date(latest.completedAt!)}`
                                : h.area || "Ready for the first visit"}
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
                        title="No households found."
                        action={
                          <Button
                            kind="secondary"
                            onClick={() => setSearch("")}
                          >
                            Clear search
                          </Button>
                        }
                      >
                        Try a different name, house number, or address.
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
                Households
              </button>
              <div className="household-detail-heading">
                <span className="home-symbol big">
                  <House size={35} strokeWidth={1.4} />
                </span>
                <div>
                  <span className="eyebrow">HOUSEHOLD RECORD</span>
                  <h1>{household.label}</h1>
                  <p>
                    {[household.code, household.address, household.area]
                      .filter(Boolean)
                      .join(" · ") || "Address not recorded"}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Edit household"
                  onClick={() => setDialog("edit-household")}
                >
                  <Settings2 size={22} />
                </button>
              </div>
              <div className="household-detail-grid">
                <section>
                  <div className="section-heading">
                    <h2>Visits</h2>
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
                            <span>{date(s.createdAt)}</span>
                            <span
                              className={`pill ${s.status === "completed" ? "green" : "purple"}`}
                            >
                              {s.status === "completed"
                                ? "Completed"
                                : "In progress"}
                            </span>
                          </div>
                          <h3>
                            {s.repeatOf
                              ? "Repeat household visit"
                              : "Household visit"}
                          </h3>
                          <p>
                            {s.members.length
                              ? `${s.members.length} family ${s.members.length === 1 ? "member" : "members"}`
                              : "Family details not entered yet"}
                          </p>
                          <div className="visit-card-footer">
                            <span>
                              {s.status === "completed"
                                ? "View record"
                                : "Continue visit"}
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
                        title="A fresh record for this home."
                      >
                        Start a visit when you’re ready. The form begins blank,
                        so every answer belongs to this conversation.
                      </Empty>
                    </div>
                  )}
                </section>
                <aside className="start-visit-card">
                  <span className="round-symbol">
                    <Mic size={25} />
                  </span>
                  <h2>Ready when you are.</h2>
                  <p>
                    Ask your questions naturally. Record the answers, then
                    review them before saving.
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
                      ? "Continue visit"
                      : "Start visit"}
                    <ArrowRight size={17} />
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
                      Start repeat visit
                    </Button>
                  )}
                  <small>
                    Repeat visits start with blank answers and keep earlier
                    records unchanged.
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
                    ? "Saved on this device"
                    : saveStatus === "saving"
                      ? "Saving…"
                      : "Not saved"}
                </span>
              </div>
              <div className="survey-heading">
                <div>
                  <span className="eyebrow">
                    {survey.status === "completed"
                      ? "COMPLETED RECORD"
                      : survey.repeatOf
                        ? "REPEAT HOUSEHOLD VISIT"
                        : "HOUSEHOLD VISIT"}
                  </span>
                  <h1>
                    {survey.status === "completed"
                      ? "Your visit record."
                      : "Family health survey"}
                  </h1>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setDialog("transcript")}
                >
                  <FileText size={17} />
                  Conversation
                  {survey.transcripts.length > 0 && (
                    <span className="button-count">
                      {survey.transcripts.length}
                    </span>
                  )}
                </button>
              </div>
              <nav className="survey-progress" aria-label="Visit sections">
                {STEPS.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => changeStep(item.id)}
                    disabled={busy}
                    className={step === item.id ? "current" : ""}
                    aria-current={step === item.id ? "step" : undefined}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </nav>
              <div className="survey-layout">
                <section className="survey-content">
                  {step === "household" && (
                    <>
                      <div className="step-heading">
                        <h2>Let’s start with the household.</h2>
                        <p>
                          How many people live here? Each person gets a separate
                          section.
                        </p>
                      </div>
                      <div className="survey-fields household-fields">
                        {survey.fields
                          .filter(
                            (f) =>
                              f.scope === "household" &&
                              f.section === "household",
                          )
                          .map((f) => renderField(f, null))}
                      </div>
                      <div className="soft-info">
                        <UsersRound size={20} />
                        <p>
                          Family sections are added when the household size is
                          recorded. You can also add people in the next step.
                        </p>
                      </div>
                      <button
                        className="add-question"
                        disabled={survey.status === "completed"}
                        onClick={() => setDialog("custom-field")}
                      >
                        <Plus size={18} />
                        Add a question
                      </button>
                    </>
                  )}
                  {step === "family" && (
                    <>
                      <div className="step-heading">
                        <h2>Meet the family.</h2>
                        <p>
                          Names and ages help keep each person’s answers
                          together.
                        </p>
                      </div>
                      {survey.members.length === 0 ? (
                        <div className="surface">
                          <Empty
                            icon={UsersRound}
                            title="Who lives in this household?"
                            action={
                              survey.status === "draft" && (
                                <Button
                                  onClick={() =>
                                    update((s) => addSurveyMember(s))
                                  }
                                >
                                  <Plus size={18} />
                                  Add family member
                                </Button>
                              )
                            }
                          >
                            Record the number of family members, or add the
                            first person here.
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
                                    {memberName(m, index)}
                                  </h3>
                                  <p>
                                    {m.values.relation
                                      ? String(m.values.relation)
                                      : "Family member"}
                                  </p>
                                </div>
                                {survey.status === "draft" && (
                                  <button
                                    className="icon-button"
                                    aria-label={`Remove family member ${index + 1}`}
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
                            Add family member
                          </button>
                        )}
                    </>
                  )}
                  {step === "health" && (
                    <>
                      <div className="step-heading">
                        <h2>What would they like to share?</h2>
                        <p>
                          Keep observations in their own words. Leave anything
                          not discussed blank.
                        </p>
                      </div>
                      {survey.members.length > 0 ? (
                        <>
                          <MemberPicker
                            members={survey.members}
                            current={activeMember?.id}
                            onSelect={setMemberId}
                          />
                          <div className="health-card">
                            <div className="health-card-title">
                              <span className="round-symbol">
                                <UserMark />
                              </span>
                              <h3>
                                {memberName(
                                  activeMember!,
                                  survey.members.findIndex(
                                    (m) => m.id === activeMember?.id,
                                  ),
                                )}
                              </h3>
                            </div>
                            <div className="survey-fields">
                              {survey.fields
                                .filter(
                                  (f) =>
                                    f.scope === "member" &&
                                    f.section === "health",
                                )
                                .map((f) => renderField(f, activeMember!.id))}
                            </div>
                          </div>
                          <button
                            className="add-question"
                            disabled={survey.status === "completed"}
                            onClick={() => setDialog("custom-field")}
                          >
                            <Plus size={18} />
                            Add a question
                          </button>
                        </>
                      ) : (
                        <div className="surface">
                          <Empty
                            icon={UsersRound}
                            title="Add a family member first."
                            action={
                              <Button onClick={() => changeStep("family")}>
                                Go to family
                                <ArrowRight size={17} />
                              </Button>
                            }
                          >
                            Health observations are recorded for each person
                            individually.
                          </Empty>
                        </div>
                      )}
                    </>
                  )}
                  {step === "notes" && (
                    <>
                      <div className="step-heading">
                        <h2>Keep the details that matter.</h2>
                        <p>Add anything the next visit should pick up on.</p>
                      </div>
                      <div className="survey-fields household-fields">
                        {survey.fields
                          .filter(
                            (f) =>
                              f.scope === "household" && f.section === "notes",
                          )
                          .map((f) => renderField(f, null))}
                      </div>
                      {survey.members.length > 0 && (
                        <>
                          <div className="subsection-heading">
                            <h3>Notes for a family member</h3>
                          </div>
                          <MemberPicker
                            members={survey.members}
                            current={activeMember?.id}
                            onSelect={setMemberId}
                          />
                          <div className="survey-fields household-fields">
                            {survey.fields
                              .filter(
                                (f) =>
                                  f.scope === "member" && f.section === "notes",
                              )
                              .map((f) => renderField(f, activeMember!.id))}
                          </div>
                        </>
                      )}
                      {survey.notes.length > 0 && (
                        <div className="captured-notes">
                          <div className="subsection-heading">
                            <h3>From the conversation</h3>
                            <span>{survey.notes.length} notes</span>
                          </div>
                          {survey.notes.map((note) => (
                            <article className="captured-note" key={note.id}>
                              <span className="note-symbol">
                                <FileText size={19} />
                              </span>
                              <div>
                                <h4>
                                  {note.memberId
                                    ? memberName(
                                        survey.members.find(
                                          (m) => m.id === note.memberId,
                                        )!,
                                        survey.members.findIndex(
                                          (m) => m.id === note.memberId,
                                        ),
                                      )
                                    : "Household observation"}
                                </h4>
                                <p>{note.text}</p>
                                <details>
                                  <summary>View source</summary>
                                  <blockquote>“{note.evidence}”</blockquote>
                                </details>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      <button
                        className="add-question"
                        disabled={survey.status === "completed"}
                        onClick={() => setDialog("custom-field")}
                      >
                        <Plus size={18} />
                        Add a question
                      </button>
                    </>
                  )}
                  {step === "review" && (
                    <>
                      <div className="step-heading">
                        <h2>
                          {survey.status === "completed"
                            ? "The visit, all together."
                            : "A moment to review."}
                        </h2>
                        <p>
                          {survey.status === "completed"
                            ? `Completed on ${date(survey.completedAt!)}. This record is read-only.`
                            : "Check the details and any entries that need your attention."}
                        </p>
                      </div>
                      {survey.status === "draft" && (
                        <div
                          className={`review-notice ${issues.length ? "has-issues" : ""}`}
                        >
                          <span>
                            {issues.length ? (
                              <Info size={22} />
                            ) : (
                              <Check size={23} />
                            )}
                          </span>
                          <div>
                            <h3>
                              {issues.length
                                ? `${issues.length} ${issues.length === 1 ? "detail needs" : "details need"} attention`
                                : "Ready for your review"}
                            </h3>
                            <p>
                              {issues.length
                                ? "Complete the required answers or review the suggestions below."
                                : "The required answers are complete."}
                            </p>
                          </div>
                        </div>
                      )}
                      {issues.filter(
                        (i) => i.kind !== "conflict" && i.kind !== "uncertain",
                      ).length > 0 && (
                        <div className="review-issues">
                          {issues
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
                                        )
                                      : "Household"}
                                  </small>
                                  <strong>{issue.message}</strong>
                                </span>
                                <Button
                                  kind="secondary"
                                  onClick={() => editIssue(issue)}
                                >
                                  Edit
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
                              Your edit is protected
                            </span>
                            <h3>
                              {survey.fields.find((f) => f.id === c.fieldId)
                                ?.label ?? c.fieldId}
                            </h3>
                            <div className="conflict-values">
                              <div>
                                <small>Your entry</small>
                                <strong>{valueText(c.currentValue)}</strong>
                              </div>
                              <div>
                                <small>From conversation</small>
                                <strong>{valueText(c.proposedValue)}</strong>
                              </div>
                            </div>
                            <blockquote>“{c.evidence}”</blockquote>
                            <div className="button-row">
                              <Button
                                kind="secondary"
                                onClick={() =>
                                  update((s) =>
                                    resolveSurveyConflict(s, c.id, "keep"),
                                  )
                                }
                              >
                                Keep my entry
                              </Button>
                              <Button
                                onClick={() =>
                                  update((s) =>
                                    resolveSurveyConflict(s, c.id, "accept"),
                                  )
                                }
                              >
                                Use conversation
                              </Button>
                            </div>
                          </div>
                        ))}
                      {survey.uncertainties
                        .filter((u) => !u.resolved)
                        .map((u) => (
                          <div className="uncertainty-card" key={u.id}>
                            <span className="pill amber">Needs a check</span>
                            <h3>{u.message}</h3>
                            <blockquote>“{u.evidence}”</blockquote>
                            <Button
                              kind="secondary"
                              onClick={() =>
                                update((s) => resolveSurveyUncertainty(s, u.id))
                              }
                            >
                              I have checked this
                            </Button>
                          </div>
                        ))}
                      {survey.notes
                        .filter((n) => !n.reviewed)
                        .map((n) => (
                          <div className="uncertainty-card" key={n.id}>
                            <span className="pill purple">
                              Conversation note
                            </span>
                            <p>{n.text}</p>
                            <blockquote>“{n.evidence}”</blockquote>
                            <Button
                              kind="secondary"
                              onClick={() =>
                                update((s) => reviewSurveyNote(s, n.id))
                              }
                            >
                              Mark reviewed
                            </Button>
                          </div>
                        ))}
                      <div className="review-record">
                        <h3>Household details</h3>
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
                                <dt>{f.label}</dt>
                                <dd>
                                  {valueText(survey.household.values[f.id])}
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
                            {memberName(m, index)}
                          </h3>
                          <dl>
                            {survey.fields
                              .filter(
                                (f) =>
                                  f.scope === "member" &&
                                  m.values[f.id] !== undefined &&
                                  m.values[f.id] !== null &&
                                  m.values[f.id] !== "",
                              )
                              .map((f) => (
                                <div key={f.id}>
                                  <dt>{f.label}</dt>
                                  <dd>
                                    {valueText(m.values[f.id])}
                                    {f.unit && <small> {f.unit}</small>}
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
                              onChange={(e) => setReviewed(e.target.checked)}
                            />
                            <span>I have reviewed this visit.</span>
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
                            {busy ? "Saving visit…" : "Finish visit"}
                            <Check size={19} />
                          </Button>
                          {(recording || extracting) && (
                            <p>
                              Stop recording and wait for the remaining answers
                              before finishing.
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
                        Back
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
                        {step === "notes" ? "Review visit" : "Continue"}
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
                    Your questions.
                    <br />
                    Their answers.
                  </h3>
                  <p>
                    Record with permission, or enter answers directly. You can
                    edit any field at any time.
                  </p>
                  <div className="side-note-divider" />
                  <span className="side-label">THIS VISIT</span>
                  <strong>{household.label}</strong>
                  <p>
                    {survey.members.length
                      ? `${survey.members.length} family ${survey.members.length === 1 ? "member" : "members"}`
                      : "Family details not yet entered"}
                  </p>
                  {survey.transcripts.length > 0 && (
                    <button onClick={() => setDialog("transcript")}>
                      View conversation
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
                          ? "Recording conversation"
                          : recorder.status === "paused"
                            ? "Recording paused"
                            : recorder.status === "processing"
                              ? "Finishing the conversation"
                              : extracting
                                ? "Filling recorded answers"
                                : "Ready to listen"}
                      </strong>
                      <small>
                        {recording
                          ? `${Math.floor(seconds / 60)
                              .toString()
                              .padStart(
                                2,
                                "0",
                              )}:${(seconds % 60).toString().padStart(2, "0")} · You can keep editing`
                          : "Ask permission before recording."}
                      </small>
                    </span>
                  </div>
                  <div className="recorder-actions">
                    <button
                      className="button quiet add-text-button"
                      onClick={() => setDialog("transcript")}
                    >
                      <FileText size={18} />
                      Add text
                    </button>
                    {recorder.status === "recording" ? (
                      <>
                        <Button
                          kind="secondary"
                          onClick={() => recorder.pause()}
                        >
                          <Pause size={17} />
                          Pause
                        </Button>
                        <Button onClick={() => void recorder.stop()}>
                          <Square size={15} />
                          Stop
                        </Button>
                      </>
                    ) : recorder.status === "paused" ? (
                      <>
                        <Button
                          kind="secondary"
                          onClick={() => void recorder.stop()}
                        >
                          <Square size={15} />
                          Stop
                        </Button>
                        <Button onClick={() => void recorder.resume()}>
                          <Play size={17} />
                          Resume
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => void startRecording()}
                        disabled={offline || recorder.status === "processing"}
                      >
                        <Mic size={18} />
                        Start recording
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
              <span className="eyebrow">VISIT COMPLETE</span>
              <h1>All recorded.</h1>
              <p>
                {household.label}
                <br />
                {date(survey.completedAt!)}
              </p>
              <div className="button-row">
                <Button
                  kind="secondary"
                  onClick={() => {
                    setStep("review");
                    navigate("survey", household.id, survey);
                  }}
                >
                  View visit
                </Button>
                <Button onClick={() => navigate("households")}>
                  Back to households
                  <ArrowRight size={17} />
                </Button>
              </div>
              <button
                className="repeat-link"
                onClick={() => openSurvey(household, undefined, survey.id)}
              >
                Start a blank repeat visit
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {view === "visits" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR VISIT HISTORY</span>
                  <h1>Every visit, in one place.</h1>
                  <p>Continue a draft or look back at a completed record.</p>
                </div>
                <Button kind="secondary" onClick={exportRecords}>
                  <ArrowDownToLine size={18} />
                  Export
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
                      ? "All visits"
                      : filter === "draft"
                        ? "In progress"
                        : "Completed"}
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
                            <span>{date(s.createdAt)}</span>
                            <span
                              className={`pill ${s.status === "completed" ? "green" : "purple"}`}
                            >
                              {s.status === "completed"
                                ? "Completed"
                                : "In progress"}
                            </span>
                          </div>
                          <h3>{h.label}</h3>
                          <p>
                            {s.repeatOf
                              ? "Repeat household visit"
                              : "Household visit"}
                            {h.code ? ` · ${h.code}` : ""}
                          </p>
                          <div className="visit-card-footer">
                            <span>
                              {s.status === "completed"
                                ? "View record"
                                : "Continue visit"}
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
                        Go to households
                        <ArrowRight size={17} />
                      </Button>
                    }
                  >
                    Open a household to begin a new visit.
                  </Empty>
                </div>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR WORKSPACE</span>
                  <h1>Just the way you work.</h1>
                  <p>Manage your preferences and the records on this device.</p>
                </div>
              </div>
              <div className="settings-layout">
                <section>
                  <h2 className="settings-title">Your details</h2>
                  <div className="settings-group">
                    <label>
                      <span>
                        <strong>Your name</strong>
                        <small>Optional</small>
                      </span>
                      <input
                        aria-label="Your name"
                        placeholder="Enter your name"
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
                        <strong>Assigned area</strong>
                        <small>Village or locality</small>
                      </span>
                      <input
                        aria-label="Assigned area"
                        placeholder="Enter your area"
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
                        <strong>Conversation language</strong>
                        <small>The interface remains in English</small>
                      </span>
                      <select
                        aria-label="Conversation language"
                        value={settings.language}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            language: e.target.value as "en" | "kn" | "hi",
                          }).catch(() => {})
                        }
                      >
                        <option value="en">English</option>
                        <option value="kn">ಕನ್ನಡ · Kannada</option>
                        <option value="hi">हिन्दी · Hindi</option>
                      </select>
                    </label>
                    <label>
                      <span>
                        <strong>Text size</strong>
                        <small>Choose what’s comfortable</small>
                      </span>
                      <select
                        aria-label="Text size"
                        value={settings.textSize}
                        onChange={(e) =>
                          void saveSettings({
                            ...settings,
                            textSize: e.target.value as "default" | "large",
                          }).catch(() => {})
                        }
                      >
                        <option value="default">Default</option>
                        <option value="large">Larger</option>
                      </select>
                    </label>
                  </div>
                  <h2 className="settings-title">Your records</h2>
                  <div className="settings-group">
                    <button onClick={exportRecords}>
                      <span className="setting-icon">
                        <ArrowDownToLine size={21} />
                      </span>
                      <span>
                        <strong>Export records</strong>
                        <small>
                          Download a backup of households and visits
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
                        <strong>Install DARA</strong>
                        <small>Open your workspace from your home screen</small>
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
                        <strong>Back to DARA</strong>
                        <small>Return to the introduction</small>
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
                    Know where your
                    <br />
                    records live.
                  </h3>
                  <p>
                    Households and visits are saved in this browser on this
                    device. They are not automatically backed up or shared with
                    another device.
                  </p>
                  <p>
                    Export a copy regularly. Clearing browser storage can remove
                    saved records.
                  </p>
                  <hr />
                  <p>
                    When you record, audio is sent to the connected speech
                    service. Conversation text is sent to the connected AI
                    service to help fill the form. Ask the family’s permission
                    first.
                  </p>
                </aside>
              </div>
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
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
            await saveHousehold(value);
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
          busy={extracting}
          onClose={closeDialog}
          onAdd={async (text) => {
            const current = currentRef.current;
            if (!current) return;
            const segment: SurveyTranscript = {
              id: crypto.randomUUID(),
              index:
                Math.max(-1, ...current.transcripts.map((t) => t.index)) + 1,
              text,
              timestamp: new Date().toISOString(),
              language: settings.language,
              source: "manual",
            };
            update(addSurveyTranscript(current, segment));
            await retryTranscript(segment);
          }}
          onRetry={retryTranscript}
        />
      )}
      {dialog === "install" && (
        <Sheet title="Keep DARA close" onClose={closeDialog}>
          <div className="sheet-content">
            <span className="round-symbol">
              <House size={28} />
            </span>
            <p>
              On Android, open Chrome’s menu and choose{" "}
              <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </p>
            <p>
              On iPhone, open the Share menu in Safari and choose{" "}
              <strong>Add to Home Screen</strong>.
            </p>
            <p>
              On desktop, use the install icon in your browser’s address bar, if
              available.
            </p>
            <Button className="full-width" onClick={closeDialog}>
              Got it
            </Button>
          </div>
        </Sheet>
      )}
      {dialog === "delete-household" && household && (
        <Sheet title="Remove this household?" onClose={closeDialog}>
          <div className="sheet-content">
            <p>
              {household.label} will be removed from this device. Households
              with visit records cannot be removed.
            </p>
            <div className="button-row">
              <Button kind="secondary" onClick={closeDialog}>
                Keep household
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
                Remove household
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {removeMember && (
        <Sheet
          title="Remove this family member?"
          onClose={() => setRemoveMember(null)}
        >
          <div className="sheet-content">
            <p>
              Their answers in this draft will also be removed. The household
              count will be updated.
            </p>
            <div className="button-row">
              <Button kind="secondary" onClick={() => setRemoveMember(null)}>
                Keep member
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  update((s) => removeSurveyMember(s, removeMember, true));
                  setRemoveMember(null);
                }}
              >
                Remove member
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
function UserMark() {
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
  return (
    <div className="member-picker" aria-label="Choose family member">
      {members.map((m, index) => (
        <button
          key={m.id}
          className={m.id === current ? "selected" : ""}
          onClick={() => onSelect(m.id)}
          aria-pressed={m.id === current}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          {memberName(m, index)}
        </button>
      ))}
    </div>
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
        {field.label}
        {field.required && <span className="required-label">Required</span>}
        {field.unit && <span className="field-unit">{field.unit}</span>}
        {field.custom && <span className="custom-label">Added question</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...shared}
          rows={3}
          placeholder="Enter the answer"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          {...shared}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Select an answer</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={field.id === "phone" ? "tel" : "text"}
          inputMode={
            field.type === "number"
              ? "decimal"
              : field.id === "phone"
                ? "tel"
                : "text"
          }
          autoComplete="off"
          placeholder={
            field.type === "number" ? "Enter a number" : "Enter the answer"
          }
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
        />
      )}
      <div className="answer-help" id={`${id}-help`}>
        {issue ? (
          <span>{issue}</span>
        ) : needsReview ? (
          <span>Needs review</span>
        ) : meta?.manuallyProtected ? (
          <span>Edited by you</span>
        ) : meta?.source === "extracted" ? (
          <span>
            <Check size={13} />
            From conversation
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
      <div className="answer-source">
        {meta?.evidence && (
          <details>
            <summary>View source</summary>
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
      title="Open your workspace"
      onClose={onClose}
      className="access-sheet"
    >
      <form className="sheet-content" onSubmit={submit}>
        <span className="round-symbol">
          <LockKeyhole size={26} />
        </span>
        <p>Enter the workspace access code to continue.</p>
        <label className="form-label">
          Access code
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter access code"
          />
        </label>
        {(error || notice) && (
          <p className="inline-error" role="alert">
            {error || notice}
          </p>
        )}
        <Button type="submit" className="full-width" disabled={busy}>
          {busy ? "Opening…" : "Open workspace"}
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
          Start with a house number or address. Family members can be added
          during the visit.
        </p>
        <label className="form-label">
          Household name<span>Optional</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Family name or a familiar label"
          />
        </label>
        <label className="form-label">
          House number
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 14 / A"
          />
        </label>
        <label className="form-label">
          Address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street or nearby landmark"
          />
        </label>
        <label className="form-label">
          Area<span>Optional</span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Village or locality"
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="full-width" disabled={busy}>
          {busy ? "Saving…" : "Save household"}
          <Check size={18} />
        </Button>
        {household && canDelete && (
          <button className="remove-link" type="button" onClick={onDelete}>
            <Trash2 size={16} />
            Remove household
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
  const [label, setLabel] = useState(""),
    [scope, setScope] = useState(defaultScope),
    [type, setType] = useState<"text" | "number" | "select" | "textarea">(
      "text",
    ),
    [required, setRequired] = useState(false),
    [options, setOptions] = useState(""),
    [error, setError] = useState("");
  return (
    <Sheet title="Add a question" onClose={onClose}>
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
          Add a question for this visit. It will be available for manual answers
          and conversation filling.
        </p>
        <label className="form-label">
          Question
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What would you like to record?"
          />
        </label>
        <label className="form-label">
          Ask about
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "household" | "member")}
          >
            <option value="household">The household</option>
            <option value="member">Each family member</option>
          </select>
        </label>
        <label className="form-label">
          Answer type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="text">Short answer</option>
            <option value="textarea">Long answer</option>
            <option value="number">Number</option>
            <option value="select">Choose from a list</option>
          </select>
        </label>
        {type === "select" && (
          <label className="form-label">
            Choices
            <input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="Yes, No, Not known"
            />
            <small>Separate choices with a comma.</small>
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>Require an answer before finishing</span>
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="full-width">
          Add question
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
  const [checked, setChecked] = useState(false);
  return (
    <Sheet title="Before you start recording" onClose={onClose}>
      <div className="sheet-content consent-content">
        <span className="round-symbol">
          <Mic size={28} />
        </span>
        <h3>Make sure everyone is comfortable.</h3>
        <p>
          Let the family know you’re recording to help fill the visit record.
          Audio and conversation text will be sent to the connected speech and
          AI services.
        </p>
        <div className="consent-facts">
          <p>
            <Check size={17} />
            You can pause or stop at any time.
          </p>
          <p>
            <Check size={17} />
            You will review the answers before saving.
          </p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>The family has agreed to recording.</span>
        </label>
        <Button
          className="full-width"
          disabled={!checked}
          onClick={() => void onStart()}
        >
          Start recording
          <Mic size={18} />
        </Button>
        <Button kind="quiet" className="full-width" onClick={onClose}>
          Continue without recording
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
  const [text, setText] = useState(""),
    [adding, setAdding] = useState(false);
  return (
    <Sheet
      title="Conversation"
      onClose={onClose}
      className="conversation-sheet"
    >
      <div className="sheet-content">
        <p>
          Original words stay with the record, so you can check where an answer
          came from.
        </p>
        <div className="conversation-list">
          {survey.transcripts.length === 0 ? (
            <div className="conversation-empty">
              <FileText size={28} />
              <h3>No conversation recorded yet.</h3>
              <p>Start recording, or add the conversation text below.</p>
            </div>
          ) : (
            survey.transcripts.map((segment, index) => (
              <article key={segment.id}>
                <header>
                  <span>
                    {segment.source === "manual"
                      ? "Added text"
                      : "Recorded conversation"}
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
                      {busy ? "Processing…" : "Fill answers from this text"}
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
              Add conversation text
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Enter what was said, including who the answer refers to."
              />
            </label>
            <Button
              type="submit"
              className="full-width"
              disabled={!text.trim() || adding || busy}
            >
              {adding ? "Filling answers…" : "Fill answers from text"}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
