"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Home,
  House,
  Info,
  ListFilter,
  MapPin,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import type {
  Household,
  Visit,
  FieldId,
  FieldValue,
  Member,
  ReviewIssue,
} from "@/lib/types";
import {
  acknowledgeAlert,
  addTranscriptSegment,
  applyPatch,
  completeVisit,
  createVisit,
  editField,
  resolveConflict,
  reviewVisit,
} from "@/lib/engine";
import { FIELD_DEFINITIONS } from "@/lib/schema";
import { getDemoSegments } from "@/data/demo";
import { DEMO_HOUSEHOLDS } from "@/data/households";
import { extractDemo } from "@/lib/extraction-client";

type Tab = "households" | "visits" | "followups" | "settings";
type View = Tab | "household" | "visit" | "review" | "finished";
type DemoState = "idle" | "playing" | "paused" | "done";
const navItems = [
  { id: "households", label: "Households", icon: House },
  { id: "visits", label: "Visits", icon: BookOpen },
  { id: "followups", label: "Follow-ups", icon: ClipboardCheck },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
const sectionNames = {
  profile: "Personal details",
  health: "Health observations",
  maternal: "Maternal health",
  notes: "Visit notes",
};
const sectionCopy = {
  profile: "Confirm who you are speaking with.",
  health: "Record what the family tells you.",
  maternal: "Complete only when relevant to this person.",
  notes: "Anything else to carry into the next visit.",
};
function formatDate(value: string | null, fallback = "Not visited yet") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function shortDate(value: string | null) {
  if (!value) return "Not visited";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
}
function fieldLabel(id: FieldId) {
  return FIELD_DEFINITIONS.find((f) => f.id === id)?.label ?? id;
}
function displayValue(v: FieldValue | undefined) {
  if (v === null || v === undefined || v === "") return "Not recorded";
  return typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path
            d="M6 5.5h6.5c5 0 8 2.7 8 7.5s-3 7.5-8 7.5H6v-15Z"
            stroke="currentColor"
            strokeWidth="2.3"
          />
          <path
            d="M10.4 9.5h2.1c2.5 0 3.8 1.3 3.8 3.5s-1.3 3.5-3.8 3.5h-2.1v-7Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span>DARA</span>
    </span>
  );
}
function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
function Empty({
  icon: Icon = Search,
  title,
  children,
  action,
}: {
  icon?: typeof Search;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
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
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener("cancel", onCancel);
    return () => {
      el?.removeEventListener("cancel", onCancel);
      el?.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function DaraApp() {
  const workspace = useWorkspace();
  const {
    ready,
    error,
    households,
    visits,
    settings,
    saveHousehold,
    saveVisit,
    finishVisit,
    saveSettings,
    resetDemo,
    exportData,
  } = workspace;
  const [entered, setEntered] = useState(false),
    [view, setView] = useState<View>("households"),
    [tab, setTab] = useState<Tab>("households");
  const [householdId, setHouseholdId] = useState<string | null>(null),
    [visit, setVisit] = useState<Visit | null>(null),
    [memberId, setMemberId] = useState<string>("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"all" | "due" | "upcoming">("all"),
    [visitFilter, setVisitFilter] = useState<"draft" | "completed">("draft");
  const [modal, setModal] = useState<
      "add" | "connect" | "reset" | "install" | null
    >(null),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(false);
  const [demo, setDemo] = useState<DemoState>("idle"),
    [demoIndex, setDemoIndex] = useState(0),
    [transcriptOpen, setTranscriptOpen] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const workspaceRef = useRef({ households, visits }),
    viewRef = useRef(view),
    scrollPositions = useRef<Record<string, number>>({});
  workspaceRef.current = { households, visits };
  viewRef.current = view;
  const visitRef = useRef<Visit | null>(null),
    saveFnRef = useRef(saveVisit),
    protectedRef = useRef<Set<string>>(new Set()),
    demoBusy = useRef(false),
    demoRef = useRef<DemoState>("idle"),
    installPrompt = useRef<any>(null);
  visitRef.current = visit;
  saveFnRef.current = saveVisit;
  demoRef.current = demo;
  const household = households.find((h) => h.id === householdId) ?? null;
  const activeMember =
    household?.members.find((m) => m.id === memberId) ?? household?.members[0];
  const activeRecord =
    activeMember && visit ? visit.members[activeMember.id] : null;
  const sampleHousehold = DEMO_HOUSEHOLDS.find((h) => h.id === household?.id);
  const fixtures = useMemo(
    () =>
      visit && sampleHousehold
        ? getDemoSegments(visit.id, sampleHousehold)
        : [],
    [visit?.id, sampleHousehold],
  );
  const followups = useMemo(
    () =>
      visits.flatMap((v) =>
        v.alerts
          .filter((a) => !a.acknowledged)
          .map((a) => ({
            visit: v,
            alert: a,
            household: households.find((h) => h.id === v.householdId),
          })),
      ),
    [visits, households],
  );
  const issues = useMemo(() => (visit ? reviewVisit(visit) : []), [visit]);
  const setCurrent = useCallback((value: Visit | ((prev: Visit) => Visit)) => {
    const current = visitRef.current;
    if (!current && typeof value === "function") return;
    const next = typeof value === "function" ? value(current!) : value;
    if (next === current) return;
    visitRef.current = next;
    setVisit(next);
    setReviewed(false);
    setSaveStatus("saving");
  }, []);
  const navigate = useCallback(
    (next: View, nextHousehold?: string) => {
      const current = visitRef.current;
      scrollPositions.current[
        `${viewRef.current}:${current?.id ?? householdId}`
      ] = window.scrollY;
      setView(next);
      if (["households", "visits", "followups", "settings"].includes(next))
        setTab(next as Tab);
      if (nextHousehold) setHouseholdId(nextHousehold);
      setNotice("");
      if (next !== "visit") setDemo((v) => (v === "playing" ? "paused" : v));
      const visitId = ["visit", "review", "finished"].includes(next)
        ? current?.id
        : undefined;
      window.history.pushState(
        { daraView: next, householdId: nextHousehold ?? householdId, visitId },
        "",
        `#${next}`,
      );
      const restore =
        next === "visit" && viewRef.current === "review"
          ? (scrollPositions.current[`visit:${current?.id}`] ?? 0)
          : 0;
      requestAnimationFrame(() =>
        window.scrollTo({ top: restore, behavior: "instant" }),
      );
    },
    [householdId],
  );
  useEffect(() => {
    setEntered(sessionStorage.getItem("dara-demo-entered") === "yes");
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const install = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event;
    };
    window.addEventListener("beforeinstallprompt", install);
    const back = (event: PopStateEvent) => {
      let target: View = event.state?.daraView ?? "households";
      const targetId = event.state?.visitId;
      if (["visit", "review", "finished"].includes(target)) {
        const restored =
          visitRef.current?.id === targetId
            ? visitRef.current
            : workspaceRef.current.visits.find((v) => v.id === targetId);
        if (restored) {
          visitRef.current = restored;
          setVisit(restored);
          setHouseholdId(restored.householdId);
          setMemberId(Object.keys(restored.members)[0] ?? "");
          setReviewed(false);
        } else target = event.state?.householdId ? "household" : "households";
      }
      setView(target);
      if (event.state?.householdId) setHouseholdId(event.state.householdId);
      if (["households", "visits", "followups", "settings"].includes(target))
        setTab(target as Tab);
      setDemo("idle");
      const position =
        scrollPositions.current[
          `${target}:${targetId ?? event.state?.householdId}`
        ] ?? 0;
      requestAnimationFrame(() =>
        window.scrollTo({ top: position, behavior: "instant" }),
      );
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("popstate", back);
    };
  }, []);
  useEffect(() => {
    if (!visit) return;
    const id = visit.id,
      revision = visit.revision;
    saveFnRef
      .current(visit)
      .then(() => {
        if (
          visitRef.current?.id === id &&
          visitRef.current?.revision === revision
        )
          setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("error"));
  }, [visit]);
  useEffect(() => {
    if (demo !== "playing" || !visit || view !== "visit") return;
    if (demoIndex >= fixtures.length) {
      setDemo("done");
      return;
    }
    const timer = setTimeout(
      async () => {
        if (demoBusy.current || demoRef.current !== "playing") return;
        demoBusy.current = true;
        const fixture = fixtures[demoIndex],
          current = visitRef.current;
        if (!current) {
          demoBusy.current = false;
          return;
        }
        const withTranscript = addTranscriptSegment(current, fixture.segment);
        setCurrent(withTranscript);
        try {
          const patch = await extractDemo(
            withTranscript,
            fixture.segment,
            fixture.changes,
          );
          if (visitRef.current?.id === current.id) {
            setCurrent((latest) =>
              applyPatch(latest, patch, [...protectedRef.current]),
            );
            setDemoIndex((n) => n + 1);
          }
        } catch (e) {
          setDemo("paused");
          setNotice(
            e instanceof Error
              ? e.message
              : "The sample could not continue. Try again.",
          );
        } finally {
          demoBusy.current = false;
        }
      },
      demoIndex === 0 ? 800 : 2100,
    );
    return () => clearTimeout(timer);
  }, [demo, demoIndex, fixtures, view, visit?.id, setCurrent]);
  function enter() {
    sessionStorage.setItem("dara-demo-entered", "yes");
    setEntered(true);
    window.history.replaceState({ daraView: "households" }, "", "#households");
  }
  function openVisit(h: Household, existing?: Visit) {
    const next =
      existing ??
      visits.find((v) => v.householdId === h.id && v.status === "draft") ??
      createVisit(h);
    setCurrent(next);
    setHouseholdId(h.id);
    setMemberId(h.members[0]?.id ?? "");
    setDemo("idle");
    setDemoIndex(
      getDemoSegments(next.id, h).findIndex(
        (f) => !next.processedSegmentIds.includes(f.segment.id),
      ) < 0
        ? getDemoSegments(next.id, h).length
        : getDemoSegments(next.id, h).findIndex(
            (f) => !next.processedSegmentIds.includes(f.segment.id),
          ),
    );
    setReviewed(false);
    setTranscriptOpen(false);
    navigate("visit", h.id);
    setTab("households");
  }
  function edit(field: FieldId, value: FieldValue) {
    if (!activeMember) return;
    setCurrent((v) => editField(v, activeMember.id, field, value));
    setReviewed(false);
  }
  async function finish() {
    if (!visit) return;
    setBusy(true);
    setNotice("");
    try {
      const completed = completeVisit(visitRef.current!);
      const h = households.find((h) => h.id === completed.householdId);
      if (!h)
        throw new Error(
          "The household could not be found. Please return to the directory.",
        );
      await finishVisit(completed, {
        ...h,
        lastVisit: completed.completedAt,
        status: "visited",
      });
      visitRef.current = completed;
      setVisit(completed);
      setSaveStatus("saved");
      navigate("finished");
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not save the visit. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function doExport() {
    try {
      await exportData();
      setNotice("Your workspace has been exported.");
    } catch {
      setNotice("Could not export. Please try again.");
    }
  }
  function goIssue(issue: ReviewIssue) {
    if (issue.memberId) setMemberId(issue.memberId);
    navigate("visit");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = document.getElementById(
          `field-${issue.field ?? "symptoms"}`,
        );
        target?.scrollIntoView({ block: "center" });
        target?.focus();
      }),
    );
  }
  const closeModal = useCallback(() => setModal(null), []);

  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!entered)
    return (
      <div className="entry">
        <header className="entry-header">
          <Brand />
          <span className="entry-caption">Made for the work that matters.</span>
        </header>
        <main className="entry-main">
          <div className="entry-copy">
            <span className="eyebrow">A little less paperwork.</span>
            <h1>
              More time
              <br />
              for people.
            </h1>
            <p className="entry-description">
              Your households, conversations, and care.
              <br className="desktop-only" /> Together in one quiet, thoughtful
              workspace.
            </p>
            <button className="button primary entry-button" onClick={enter}>
              Open demo workspace <ArrowRight size={19} />
            </button>
            <p className="entry-note">
              <ShieldCheck size={16} /> Sample households. Changes stay on this
              device.
            </p>
          </div>
          <div className="entry-preview" aria-hidden="true">
            <div className="preview-sheet">
              <div className="preview-top">
                <span className="preview-house">
                  <House size={29} strokeWidth={1.5} />
                </span>
                <span className="preview-id">H-014</span>
              </div>
              <h2>
                Every family.
                <br />A clearer picture.
              </h2>
              <p>Lakshmi Devi & family</p>
              <div className="preview-people">
                <span>LD</span>
                <span>RK</span>
                <span>AD</span>
                <small>3 family members</small>
              </div>
              <div className="preview-divider" />
              <div className="preview-field">
                <span>Age</span>
                <strong>
                  28 years <Check size={15} />
                </strong>
              </div>
              <div className="preview-field">
                <span>Visit notes</span>
                <strong>
                  Recorded with care <Check size={15} />
                </strong>
              </div>
              <div className="preview-footer">
                <FileText size={17} />
                <span>
                  A register that listens.
                  <br />
                  <b>And lets you lead.</b>
                </span>
              </div>
            </div>
            <span className="preview-caption">
              Familiar records. A simpler way to keep them.
            </span>
          </div>
        </main>
        <footer className="entry-footer">
          <span>Digital Assisted Recordkeeping for ASHA Workers</span>
          <span>DARA · Demo workspace</span>
        </footer>
      </div>
    );

  return (
    <div
      className={`app-shell ${settings.textSize === "large" ? "large-text" : ""}`}
    >
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">FIELD WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.id === "followups" && followups.length > 0 && (
                <span className="nav-count">{followups.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <ShieldCheck size={16} />
            <span>Demo workspace</span>
          </div>
          <p>Sample records, stored on this device.</p>
          <button
            className="worker-profile"
            onClick={() => navigate("settings")}
          >
            <span className="avatar worker-avatar">
              {initials(settings.workerName)}
            </span>
            <span>
              <strong>{settings.workerName}</strong>
              <small>ASHA worker</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-location">
            <MapPin size={15} />
            <span>{settings.area}</span>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">Demo workspace</span>
            <button
              className="icon-button mobile-settings"
              aria-label="Open settings"
              onClick={() => navigate("settings")}
            >
              <UserRound size={19} />
            </button>
            <span className="topbar-date">
              {new Intl.DateTimeFormat("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Asia/Kolkata",
              }).format(new Date())}
            </span>
          </div>
        </header>
        {offline && (
          <div className="connection-banner">
            <WifiOff size={17} /> Offline. You can continue editing on this
            device.
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <Info size={17} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="notice-banner" role="status">
            <Info size={17} />
            <span>{notice}</span>
            <button
              className="icon-button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <main className={`page page-${view}`} id="main-content">
          {view === "households" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR COMMUNITY</span>
                  <h1>Households</h1>
                  <p>Find a family, review their details, or begin a visit.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("add")}
                >
                  <Plus size={19} /> Add household
                </button>
              </div>
              <div className="directory-summary">
                <span>
                  <strong>{households.length}</strong> households
                </span>
                <span>
                  <strong>
                    {households.reduce((n, h) => n + h.members.length, 0)}
                  </strong>{" "}
                  people
                </span>
                <span>
                  <strong>
                    {households.filter((h) => h.status === "due").length}
                  </strong>{" "}
                  visits due
                </span>
                <span className="summary-note">
                  <MapPin size={14} />
                  {settings.area}
                </span>
              </div>
              <div className="directory-controls">
                <div className="segmented" aria-label="Filter households">
                  {(
                    [
                      ["all", "All households"],
                      ["due", "Visit due"],
                      ["upcoming", "Upcoming"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      className={filter === key ? "selected" : ""}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="Search households"
                    placeholder="Search name, house, or area"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="register">
                <div className="register-header">
                  <span>HOUSEHOLD</span>
                  <span>MEMBERS</span>
                  <span>LAST VISIT</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {households
                  .filter(
                    (h) =>
                      (filter === "all" || h.status === filter) &&
                      `${h.familyName} ${h.code} ${h.address} ${h.area} ${h.members.map((m) => m.name).join(" ")}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((h) => {
                    const draft = visits.find(
                      (v) => v.householdId === h.id && v.status === "draft",
                    );
                    return (
                      <button
                        className="household-row"
                        key={h.id}
                        onClick={() => navigate("household", h.id)}
                      >
                        <span className={`house-tile tone-${h.color}`}>
                          <House size={23} strokeWidth={1.5} />
                        </span>
                        <span className="household-primary">
                          <strong>{h.familyName}</strong>
                          <small>
                            {h.code}
                            <span>·</span>
                            {h.area}
                          </small>
                        </span>
                        <span className="household-members">
                          <UsersRound size={16} />
                          {h.members.length}
                          <span className="mobile-only"> members</span>
                        </span>
                        <span className="household-last">
                          {shortDate(h.lastVisit)}
                        </span>
                        <span className="household-status">
                          {draft ? (
                            <Tag tone="blue">Draft</Tag>
                          ) : (
                            <Tag
                              tone={
                                h.status === "due"
                                  ? "amber"
                                  : h.status === "visited"
                                    ? "green"
                                    : "neutral"
                              }
                            >
                              {h.status === "due"
                                ? "Visit due"
                                : h.status === "visited"
                                  ? "Visited"
                                  : "Upcoming"}
                            </Tag>
                          )}
                        </span>
                        <ChevronRight className="row-chevron" size={17} />
                      </button>
                    );
                  })}
                {households.filter(
                  (h) =>
                    (filter === "all" || h.status === filter) &&
                    `${h.familyName} ${h.code} ${h.address} ${h.area} ${h.members.map((m) => m.name).join(" ")}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ).length === 0 && (
                  <Empty title="No households found">
                    Try a different name, house number, or filter.
                  </Empty>
                )}
              </div>
              <div className="directory-footer">
                <span>All household records are sample data.</span>
                <span>
                  <ShieldCheck size={14} /> Kept on this device
                </span>
              </div>
            </>
          )}

          {view === "household" && household && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("households")}
              >
                <ArrowLeft size={17} /> Households
              </button>
              <div className="family-heading">
                <div className={`house-tile large tone-${household.color}`}>
                  <House size={32} strokeWidth={1.4} />
                </div>
                <div>
                  <span className="eyebrow">
                    {household.code} · HOUSEHOLD RECORD
                  </span>
                  <h1>{household.familyName}</h1>
                  <p>
                    <MapPin size={15} />
                    {household.address}, {household.area}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => openVisit(household)}
                >
                  {visits.some(
                    (v) =>
                      v.householdId === household.id && v.status === "draft",
                  )
                    ? "Continue draft"
                    : "Start visit"}
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="detail-grid">
                <div>
                  <div className="section-title">
                    <h2>Family members</h2>
                    <span>{household.members.length} people</span>
                  </div>
                  <div className="surface member-list">
                    {household.members.map((m, i) => (
                      <div key={m.id} className="member-row">
                        <span className={`avatar person-${i % 4}`}>
                          {initials(m.name)}
                        </span>
                        <div>
                          <h3>{m.name}</h3>
                          <p>
                            {m.relation} · {m.age} years
                          </p>
                          {m.conditions.length > 0 && (
                            <div className="condition-list">
                              {m.conditions.map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <UserRound size={17} className="muted" />
                      </div>
                    ))}
                  </div>
                  <div className="section-title history-heading">
                    <h2>Visit history</h2>
                    <span>
                      {
                        visits.filter(
                          (v) =>
                            v.householdId === household.id &&
                            v.status === "completed",
                        ).length
                      }{" "}
                      completed
                    </span>
                  </div>
                  <div className="surface">
                    {visits.filter(
                      (v) =>
                        v.householdId === household.id &&
                        v.status === "completed",
                    ).length ? (
                      visits
                        .filter(
                          (v) =>
                            v.householdId === household.id &&
                            v.status === "completed",
                        )
                        .map((v) => (
                          <button
                            className="history-row"
                            key={v.id}
                            onClick={() => openVisit(household, v)}
                          >
                            <span className="small-icon">
                              <FileText size={20} />
                            </span>
                            <span>
                              <strong>Household visit</strong>
                              <small>{formatDate(v.completedAt)}</small>
                            </span>
                            <Tag tone="green">Completed</Tag>
                            <ChevronRight size={17} />
                          </button>
                        ))
                    ) : (
                      <Empty
                        icon={BookOpen}
                        title="A fresh page for this family"
                      >
                        Completed visits will appear here. Start a visit to make
                        the first entry.
                      </Empty>
                    )}
                  </div>
                </div>
                <aside className="detail-aside">
                  <div className="surface information-card">
                    <span className="small-icon blue">
                      <ClipboardCheck size={22} />
                    </span>
                    <h3>Ready for your next visit</h3>
                    <p>
                      Existing family details are already here. You can focus on
                      what has changed.
                    </p>
                    <dl>
                      <div>
                        <dt>Last visit</dt>
                        <dd>{shortDate(household.lastVisit)}</dd>
                      </div>
                      <div>
                        <dt>Next visit</dt>
                        <dd>{shortDate(household.nextVisit)}</dd>
                      </div>
                      <div>
                        <dt>House number</dt>
                        <dd>{household.code}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="quiet-note">
                    <ShieldCheck size={18} />
                    <p>
                      This is a sample household. Your changes are saved only on
                      this device.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {(view === "visit" || view === "review") && household && visit && (
            <>
              <button
                className="back-link"
                onClick={() =>
                  navigate(
                    view === "review" ? "visit" : "household",
                    household.id,
                  )
                }
              >
                <ArrowLeft size={17} />
                {view === "review" ? "Return to form" : household.familyName}
              </button>
              <div className="visit-heading">
                <div>
                  <span className="eyebrow">
                    {household.code} ·{" "}
                    {visit.status === "completed"
                      ? "COMPLETED VISIT"
                      : "HOUSEHOLD VISIT"}
                  </span>
                  <h1>
                    {view === "review"
                      ? "A moment to review."
                      : visit.status === "completed"
                        ? "Visit record"
                        : "Household visit"}
                  </h1>
                  <p>
                    {view === "review"
                      ? "Check the details before you finish this visit."
                      : visit.status === "completed"
                        ? formatDate(visit.completedAt)
                        : "Record each family member’s answers."}
                  </p>
                </div>
                <div className="visit-heading-actions">
                  <span
                    className={`save-state ${saveStatus === "error" ? "error" : ""}`}
                  >
                    {saveStatus === "saved" ? (
                      <Check size={14} />
                    ) : saveStatus === "error" ? (
                      <Info size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}{" "}
                    {saveStatus === "saved"
                      ? "Saved on this device"
                      : saveStatus === "error"
                        ? "Not saved"
                        : "Saving…"}
                  </span>
                  {view === "visit" && visit.status === "draft" && (
                    <button
                      className="button primary"
                      onClick={() => {
                        setDemo((s) => (s === "playing" ? "paused" : s));
                        setReviewed(false);
                        navigate("review");
                      }}
                    >
                      Review visit <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              </div>
              {view === "visit" && (
                <>
                  <div className="member-picker" aria-label="Family member">
                    {household.members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMemberId(m.id)}
                        className={activeMember?.id === m.id ? "selected" : ""}
                      >
                        <span className="avatar mini-avatar">
                          {initials(m.name)}
                        </span>
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.relation}</small>
                        </span>
                        {activeMember?.id === m.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                  <div className="visit-layout">
                    <div className="visit-form">
                      <div className="form-intro">
                        <div>
                          <h2>{activeMember?.name}</h2>
                          <p>
                            {visit.status === "completed"
                              ? "A read-only record of this visit."
                              : "Review or edit any detail as you go."}
                          </p>
                        </div>
                        <span className="form-person">
                          <UserRound size={18} />
                        </span>
                      </div>
                      {(
                        ["profile", "health", "maternal", "notes"] as const
                      ).map((section) => (
                        <section
                          className="form-section"
                          key={section}
                          aria-labelledby={`section-${section}`}
                        >
                          <div className="form-section-heading">
                            <h3 id={`section-${section}`}>
                              {sectionNames[section]}
                            </h3>
                            <p>{sectionCopy[section]}</p>
                          </div>
                          <div className="field-group">
                            {FIELD_DEFINITIONS.filter(
                              (f) => f.section === section,
                            ).map((f) => {
                              const value = activeRecord?.values[f.id];
                              const meta = activeRecord?.meta[f.id];
                              const problem = issues.find(
                                (i) =>
                                  i.memberId === activeMember?.id &&
                                  i.field === f.id &&
                                  i.kind === "invalid",
                              );
                              const attrs = {
                                id: `field-${f.id}`,
                                disabled: visit.status === "completed",
                                "aria-describedby": `help-${f.id}`,
                                "aria-invalid": !!problem,
                                onFocus: () =>
                                  activeMember &&
                                  protectedRef.current.add(
                                    `${activeMember.id}.${f.id}`,
                                  ),
                                onBlur: () =>
                                  activeMember &&
                                  protectedRef.current.delete(
                                    `${activeMember.id}.${f.id}`,
                                  ),
                              };
                              return (
                                <div
                                  className={`field ${f.type === "textarea" ? "field-wide" : ""} ${problem ? "field-invalid" : ""}`}
                                  key={`${activeMember?.id}.${f.id}`}
                                >
                                  <label htmlFor={`field-${f.id}`}>
                                    {f.label}
                                    {f.unit && (
                                      <span className="unit">{f.unit}</span>
                                    )}
                                  </label>
                                  {f.type === "textarea" ? (
                                    <textarea
                                      {...attrs}
                                      rows={3}
                                      value={
                                        value === null || value === undefined
                                          ? ""
                                          : String(value)
                                      }
                                      placeholder="Not recorded yet"
                                      onChange={(e) =>
                                        edit(f.id, e.target.value)
                                      }
                                    />
                                  ) : f.type === "select" ? (
                                    <select
                                      {...attrs}
                                      value={
                                        value === null || value === undefined
                                          ? ""
                                          : String(value)
                                      }
                                      onChange={(e) =>
                                        edit(
                                          f.id,
                                          e.target.value === ""
                                            ? null
                                            : e.target.value === "true"
                                              ? true
                                              : e.target.value === "false"
                                                ? false
                                                : e.target.value,
                                        )
                                      }
                                    >
                                      <option value="">Not recorded</option>
                                      {f.options?.map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      {...attrs}
                                      type={f.id === "phone" ? "tel" : "text"}
                                      inputMode={
                                        f.type === "number"
                                          ? "decimal"
                                          : f.id === "phone"
                                            ? "tel"
                                            : "text"
                                      }
                                      autoComplete="off"
                                      value={
                                        value === null || value === undefined
                                          ? ""
                                          : String(value)
                                      }
                                      placeholder="Not recorded"
                                      onChange={(e) =>
                                        edit(
                                          f.id,
                                          f.type === "number"
                                            ? e.target.value.trim() === ""
                                              ? null
                                              : e.target.value
                                            : e.target.value,
                                        )
                                      }
                                    />
                                  )}
                                  <div
                                    className="field-help"
                                    id={`help-${f.id}`}
                                  >
                                    {problem ? (
                                      <span className="field-error">
                                        {problem.message}
                                      </span>
                                    ) : meta?.manuallyProtected ? (
                                      <span>Edited by you</span>
                                    ) : meta?.source === "extracted" ? (
                                      <span>
                                        <Check size={12} /> From conversation
                                      </span>
                                    ) : meta?.source === "existing" ? (
                                      <span>From household record</span>
                                    ) : (
                                      <span>&nbsp;</span>
                                    )}
                                  </div>
                                  <div className="field-evidence-slot">
                                    {meta?.evidence && (
                                      <details className="field-evidence">
                                        <summary>View source</summary>
                                        <p>“{meta.evidence}”</p>
                                      </details>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                    <aside
                      className={`conversation-rail ${transcriptOpen ? "is-open" : ""}`}
                    >
                      <div className="conversation-header">
                        <span className="small-icon">
                          <FileText size={19} />
                        </span>
                        <h3>Conversation</h3>
                        <button
                          className="icon-button mobile-only"
                          aria-label="Close conversation"
                          onClick={() => setTranscriptOpen(false)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                      <p className="conversation-subtitle">
                        The words behind the record.
                      </p>
                      {visit.transcripts.length === 0 ? (
                        <div className="conversation-empty">
                          <div className="conversation-lines">
                            <span />
                            <span />
                            <span />
                          </div>
                          <h4>Room for the conversation.</h4>
                          <p>
                            Try the sample below to see spoken details become
                            form entries.
                          </p>
                          <span className="sample-disclaimer">
                            Sample text · No microphone used
                          </span>
                        </div>
                      ) : (
                        <div className="transcript-list">
                          {visit.transcripts.map((t, i) => (
                            <div className="transcript-turn" key={t.id}>
                              <div>
                                <span>
                                  {t.source === "demo"
                                    ? "Sample conversation"
                                    : "Conversation"}
                                </span>
                                <small>{String(i + 1).padStart(2, "0")}</small>
                              </div>
                              <p>{t.text}</p>
                              <span className="transcript-person">
                                {household.members.find(
                                  (m) => m.id === t.memberId,
                                )?.name ?? "Family member"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {visit.alerts.length > 0 && (
                        <div className="conversation-concerns">
                          <h4>For your attention</h4>
                          {visit.alerts.map((a) => (
                            <div className="concern-note" key={a.id}>
                              <Info size={17} />
                              <p>{a.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </aside>
                  </div>
                  {visit.status === "draft" && (
                    <div className="recording-bar">
                      <div className="recording-description">
                        <span className="recording-icon">
                          <Mic size={21} />
                        </span>
                        <span>
                          <strong>
                            {demo === "playing"
                              ? "Sample conversation is running"
                              : demo === "paused"
                                ? "Sample conversation paused"
                                : demo === "done" ||
                                    demoIndex >= fixtures.length
                                  ? "Sample conversation complete"
                                  : "Record the visit"}
                          </strong>
                          <small>
                            {demo === "playing"
                              ? `${Math.min(demoIndex + 1, fixtures.length)} of ${fixtures.length} sample passages`
                              : "Speech services are not connected yet."}
                          </small>
                        </span>
                      </div>
                      <div className="recording-actions">
                        <button
                          className="button secondary transcript-toggle"
                          onClick={() => setTranscriptOpen((v) => !v)}
                        >
                          <FileText size={17} />
                          <span>Conversation</span>
                          {visit.transcripts.length > 0 && (
                            <b>{visit.transcripts.length}</b>
                          )}
                        </button>
                        <button
                          className="button text-button recording-connect"
                          onClick={() => setModal("connect")}
                        >
                          Start recording
                        </button>
                        {!sampleHousehold ? (
                          <span className="custom-sample-note">
                            Sample conversation is available for the original
                            demo households.
                          </span>
                        ) : demo === "playing" ? (
                          <button
                            className="button primary"
                            onClick={() => setDemo("paused")}
                          >
                            <Pause size={16} /> Pause sample
                          </button>
                        ) : demoIndex >= fixtures.length ? (
                          <button
                            className="button secondary"
                            onClick={() => navigate("review")}
                          >
                            <Check size={17} /> Review sample
                          </button>
                        ) : (
                          <button
                            className="button primary"
                            onClick={() => setDemo("playing")}
                          >
                            <Play size={16} />
                            {demo === "paused"
                              ? "Resume sample"
                              : "Try sample conversation"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {view === "review" && (
                <div className="review-layout">
                  <div>
                    <div className="review-summary surface">
                      <span
                        className={`review-symbol ${issues.length ? "amber" : "green"}`}
                      >
                        {issues.length ? (
                          <ClipboardCheck size={27} />
                        ) : (
                          <CheckCircle2 size={27} />
                        )}
                      </span>
                      <div>
                        <h2>
                          {issues.length
                            ? `${issues.length} ${issues.length === 1 ? "detail needs" : "details need"} your attention`
                            : "Everything is ready to save"}
                        </h2>
                        <p>
                          {issues.length
                            ? "A quick check makes a better record."
                            : "The required details are complete and ready for your confirmation."}
                        </p>
                      </div>
                    </div>
                    {issues.length > 0 && (
                      <div className="surface review-issues">
                        {issues.map((issue) => (
                          <div className="review-issue" key={issue.id}>
                            <span
                              className={`issue-icon ${issue.kind === "follow-up" ? "amber" : ""}`}
                            >
                              <Info size={18} />
                            </span>
                            <div>
                              <small>
                                {household.members.find(
                                  (m) => m.id === issue.memberId,
                                )?.name ?? "Household"}{" "}
                                ·{" "}
                                {issue.kind === "follow-up"
                                  ? "Follow-up"
                                  : issue.kind === "conflict"
                                    ? "Conflicting entry"
                                    : "Check detail"}
                              </small>
                              <strong>{issue.message}</strong>
                            </div>
                            {issue.kind === "follow-up" ? (
                              <button
                                className="button small secondary"
                                onClick={() => {
                                  const a = visit.alerts.find(
                                    (a) => a.id === issue.id,
                                  );
                                  if (a)
                                    setCurrent((v) =>
                                      acknowledgeAlert(v, a.id),
                                    );
                                }}
                              >
                                Reviewed
                              </button>
                            ) : issue.kind === "conflict" ? null : (
                              <button
                                className="button small secondary"
                                onClick={() => goIssue(issue)}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {visit.conflicts
                      .filter((c) => !c.resolved)
                      .map((c) => (
                        <div className="surface conflict-card" key={c.id}>
                          <Tag tone="amber">Your edit is protected</Tag>
                          <h3>
                            {fieldLabel(c.field)} ·{" "}
                            {
                              household.members.find((m) => m.id === c.memberId)
                                ?.name
                            }
                          </h3>
                          <div className="conflict-comparison">
                            <div>
                              <small>Your entry</small>
                              <strong>{displayValue(c.currentValue)}</strong>
                            </div>
                            <div>
                              <small>From conversation</small>
                              <strong>{displayValue(c.proposedValue)}</strong>
                            </div>
                          </div>
                          <p>“{c.evidence}”</p>
                          <div className="button-row">
                            <button
                              className="button secondary"
                              onClick={() =>
                                setCurrent((v) =>
                                  resolveConflict(v, c.id, "keep"),
                                )
                              }
                            >
                              Keep my entry
                            </button>
                            <button
                              className="button primary"
                              onClick={() => {
                                try {
                                  setCurrent((v) =>
                                    resolveConflict(v, c.id, "accept"),
                                  );
                                } catch (e) {
                                  setNotice(
                                    e instanceof Error
                                      ? e.message
                                      : "This value needs to be corrected manually.",
                                  );
                                }
                              }}
                            >
                              Use conversation
                            </button>
                          </div>
                        </div>
                      ))}
                    <div className="section-title">
                      <h2>The visit at a glance</h2>
                      <span>{household.members.length} family members</span>
                    </div>
                    <div className="surface review-members">
                      {household.members.map((m) => (
                        <div className="review-member" key={m.id}>
                          <div className="review-member-heading">
                            <span className="avatar mini-avatar">
                              {initials(m.name)}
                            </span>
                            <h3>
                              {displayValue(visit.members[m.id]?.values.name)}
                            </h3>
                            <span>
                              {displayValue(visit.members[m.id]?.values.age)}{" "}
                              years
                            </span>
                          </div>
                          <dl>
                            {(
                              [
                                "symptoms",
                                "feverDays",
                                "pregnancyStatus",
                                "pregnancyWeeks",
                                "notes",
                              ] as FieldId[]
                            )
                              .filter(
                                (f) =>
                                  visit.members[m.id]?.values[f] !==
                                    undefined &&
                                  visit.members[m.id]?.values[f] !== null &&
                                  visit.members[m.id]?.values[f] !== "",
                              )
                              .map((f) => (
                                <div key={f}>
                                  <dt>{fieldLabel(f)}</dt>
                                  <dd>
                                    {displayValue(
                                      visit.members[m.id]?.values[f],
                                    )}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </div>
                  <aside className="review-aside surface">
                    <ShieldCheck size={28} />
                    <h3>A record you can trust.</h3>
                    <p>
                      Take a moment to confirm the names, observations, and any
                      follow-up before finishing.
                    </p>
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      <span>I have reviewed this visit.</span>
                    </label>
                    <button
                      className="button primary full-width"
                      disabled={!reviewed || issues.length > 0 || busy}
                      onClick={finish}
                    >
                      {busy ? "Saving visit…" : "Finish visit"}
                      <Check size={18} />
                    </button>
                    {issues.length > 0 && (
                      <small>Resolve the details above to finish.</small>
                    )}
                    <button
                      className="button text-button full-width"
                      onClick={() => navigate("visit")}
                    >
                      Return to form
                    </button>
                  </aside>
                </div>
              )}
            </>
          )}

          {view === "finished" && household && visit && (
            <div className="finished-view">
              <span className="finished-check">
                <Check size={40} />
              </span>
              <span className="eyebrow">VISIT COMPLETE</span>
              <h1>Visit saved.</h1>
              <p>
                {household.familyName}
                <br />
                {formatDate(visit.completedAt)}
              </p>
              <div className="finish-meta">
                <ShieldCheck size={17} /> Stored on this device
              </div>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => navigate("visit")}
                >
                  View visit
                </button>
                <button
                  className="button primary"
                  onClick={() => navigate("households")}
                >
                  Back to households
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}

          {view === "visits" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">VISIT REGISTER</span>
                  <h1>Visits</h1>
                  <p>Pick up where you left off. Look back when you need to.</p>
                </div>
                <button className="button secondary" onClick={doExport}>
                  <ArrowDownToLine size={17} /> Export records
                </button>
              </div>
              <div className="segmented visits-filter">
                {(["draft", "completed"] as const).map((f) => (
                  <button
                    key={f}
                    className={visitFilter === f ? "selected" : ""}
                    aria-pressed={visitFilter === f}
                    onClick={() => setVisitFilter(f)}
                  >
                    {f === "draft" ? "Drafts" : "Completed"}
                    <span>{visits.filter((v) => v.status === f).length}</span>
                  </button>
                ))}
              </div>
              <div className="surface">
                {visits.filter((v) => v.status === visitFilter).length ? (
                  visits
                    .filter((v) => v.status === visitFilter)
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    .map((v) => {
                      const h = households.find((h) => h.id === v.householdId);
                      if (!h) return null;
                      return (
                        <button
                          key={v.id}
                          className="visit-row"
                          onClick={() => openVisit(h, v)}
                        >
                          <span className="small-icon blue">
                            <FileText size={22} />
                          </span>
                          <span>
                            <strong>{h.familyName}</strong>
                            <small>
                              {h.code} ·{" "}
                              {formatDate(v.completedAt ?? v.startedAt)}
                            </small>
                          </span>
                          <Tag tone={v.status === "draft" ? "blue" : "green"}>
                            {v.status === "draft"
                              ? "Continue draft"
                              : "Completed"}
                          </Tag>
                          <ChevronRight size={17} />
                        </button>
                      );
                    })
                ) : (
                  <Empty
                    icon={BookOpen}
                    title={
                      visitFilter === "draft"
                        ? "Nothing left unfinished."
                        : "Your visit history starts here."
                    }
                  >
                    {visitFilter === "draft"
                      ? "New visits are automatically saved here as drafts."
                      : "Finish a household visit to see its completed record here."}
                  </Empty>
                )}
              </div>
            </>
          )}

          {view === "followups" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">OBSERVATIONS TO REVIEW</span>
                  <h1>Follow-ups</h1>
                  <p>Keep the things that need another look in sight.</p>
                </div>
                <Tag tone={followups.length ? "amber" : "green"}>
                  {followups.length} to review
                </Tag>
              </div>
              {followups.length ? (
                <div className="followup-list">
                  {followups.map(({ visit: v, alert, household: h }) => (
                    <div
                      className="surface followup-card"
                      key={`${v.id}-${alert.id}`}
                    >
                      <div className="followup-icon">
                        <ClipboardCheck size={23} />
                      </div>
                      <div>
                        <span className="eyebrow">
                          {h?.code} · {h?.familyName}
                        </span>
                        <h2>
                          {h?.members.find((m) => m.id === alert.memberId)
                            ?.name ?? "Family member"}
                        </h2>
                        <p>{alert.message}</p>
                        <blockquote>“{alert.evidence}”</blockquote>
                        <small>
                          Reported {formatDate(v.startedAt)} · Review
                          observation; no diagnosis made.
                        </small>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => h && openVisit(h, v)}
                      >
                        Open visit
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={ClipboardCheck} title="No observations to review">
                  There are no unreviewed observations right now. Concerns
                  captured during a visit will appear here.
                </Empty>
              )}
              <div className="quiet-note followup-note">
                <Info size={18} />
                <p>
                  DARA records observations for review. It does not diagnose
                  conditions or replace clinical judgement.
                </p>
              </div>
            </>
          )}

          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR WORKSPACE</span>
                  <h1>Settings</h1>
                  <p>Manage your profile, preferences, and saved records.</p>
                </div>
              </div>
              <div className="settings-layout">
                <section>
                  <h2 className="settings-title">Your workspace</h2>
                  <div className="surface settings-group">
                    <label className="setting-field">
                      <span>
                        <strong>Your name</strong>
                        <small>Shown in this workspace</small>
                      </span>
                      <input
                        aria-label="Your name"
                        value={settings.workerName}
                        onChange={(e) =>
                          saveSettings({
                            ...settings,
                            workerName: e.target.value,
                          }).catch(() => {})
                        }
                      />
                    </label>
                    <label className="setting-field">
                      <span>
                        <strong>Assigned area</strong>
                        <small>Your locality or service area</small>
                      </span>
                      <input
                        aria-label="Assigned area"
                        value={settings.area}
                        onChange={(e) =>
                          saveSettings({
                            ...settings,
                            area: e.target.value,
                          }).catch(() => {})
                        }
                      />
                    </label>
                    <label className="setting-field">
                      <span>
                        <strong>Text size</strong>
                        <small>Make details easier to read</small>
                      </span>
                      <select
                        aria-label="Text size"
                        value={settings.textSize}
                        onChange={(e) =>
                          saveSettings({
                            ...settings,
                            textSize: e.target.value as "default" | "large",
                          }).catch(() => {})
                        }
                      >
                        <option value="default">Default</option>
                        <option value="large">Larger</option>
                      </select>
                    </label>
                    <label className="setting-field">
                      <span>
                        <strong>Conversation language</strong>
                        <small>
                          Preference for future speech connection; interface is
                          English
                        </small>
                      </span>
                      <select
                        aria-label="Conversation language"
                        value={settings.language}
                        onChange={(e) =>
                          saveSettings({
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
                  </div>
                  <h2 className="settings-title">On this device</h2>
                  <div className="surface settings-group">
                    <button
                      className="setting-action"
                      onClick={() => {
                        if (installPrompt.current) {
                          installPrompt.current.prompt();
                          installPrompt.current = null;
                        } else setModal("install");
                      }}
                    >
                      <span className="small-icon">
                        <ArrowDownToLine size={20} />
                      </span>
                      <span>
                        <strong>Install DARA</strong>
                        <small>Keep your workspace a tap away</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                    <button className="setting-action" onClick={doExport}>
                      <span className="small-icon">
                        <FileText size={20} />
                      </span>
                      <span>
                        <strong>Export workspace</strong>
                        <small>
                          Download your households and visits as JSON
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                    <button
                      className="setting-action danger-action"
                      onClick={() => setModal("reset")}
                    >
                      <span className="small-icon">
                        <ArrowLeft size={20} />
                      </span>
                      <span>
                        <strong>Reset demo records</strong>
                        <small>
                          Remove local changes and restore sample households
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </section>
                <aside className="settings-about surface">
                  <Brand small />
                  <h3>
                    A little less paperwork.
                    <br />A little more care.
                  </h3>
                  <p>Digital Assisted Recordkeeping for ASHA Workers.</p>
                  <hr />
                  <Tag>Demo workspace</Tag>
                  <p>
                    Records are sample data, saved in this browser. Speech, AI
                    extraction, sign-in, and cloud storage are not connected.
                  </p>
                  <p>
                    Use synthetic details while exploring. This is not a live
                    patient-record system.
                  </p>
                  <small>Version 0.1 · Built with care</small>
                </aside>
              </div>
            </>
          )}
        </main>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {modal === "add" && (
        <AddHousehold
          onClose={closeModal}
          existing={households}
          save={async (h) => {
            await saveHousehold(h);
            setModal(null);
            navigate("household", h.id);
          }}
        />
      )}
      {modal === "connect" && (
        <Modal title="Recording is not connected yet" onClose={closeModal}>
          <div className="modal-content">
            <span className="modal-symbol">
              <Mic size={28} />
            </span>
            <p>
              Live speech will be available when the Gnani connection is
              configured. No microphone is being used.
            </p>
            <p>
              You can still edit every field and try a sample conversation to
              see how the record updates.
            </p>
            {sampleHousehold && demoIndex < fixtures.length && (
              <button
                className="button primary full-width"
                onClick={() => {
                  setModal(null);
                  setDemo("playing");
                }}
              >
                Try sample conversation
                <Play size={16} />
              </button>
            )}
            <button
              className="button text-button full-width"
              onClick={closeModal}
            >
              Continue editing
            </button>
          </div>
        </Modal>
      )}
      {modal === "install" && (
        <Modal title="Keep DARA close" onClose={closeModal}>
          <div className="modal-content">
            <p>
              In Chrome on Android, open the browser menu and choose{" "}
              <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </p>
            <p>
              On iPhone, open the Share menu in Safari and choose{" "}
              <strong>Add to Home Screen</strong>.
            </p>
            <p>
              On desktop, look for the install button in your browser’s address
              bar. If DARA is already installed, you can open it from your apps.
            </p>
            <button className="button primary full-width" onClick={closeModal}>
              Got it
            </button>
          </div>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="Reset this workspace?" onClose={closeModal}>
          <div className="modal-content">
            <p>
              This removes all households, visits, and edits saved in this
              browser and restores the original sample records.
            </p>
            <p>Export your workspace first if you want to keep a copy.</p>
            <div className="button-row">
              <button className="button secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await resetDemo();
                    setVisit(null);
                    visitRef.current = null;
                    setModal(null);
                    navigate("households");
                  } catch {
                    setNotice("Could not reset the workspace. Try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Resetting…" : "Reset demo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddHousehold({
  onClose,
  save,
  existing,
}: {
  onClose: () => void;
  save: (h: Household) => Promise<void>;
  existing: Household[];
}) {
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [area, setArea] = useState(""),
    [address, setAddress] = useState(""),
    [age, setAge] = useState(""),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !name.trim() ||
      !code.trim() ||
      !area.trim() ||
      !address.trim() ||
      !age
    ) {
      setError("Please complete the household details.");
      return;
    }
    if (!Number.isFinite(Number(age)) || Number(age) < 0 || Number(age) > 120) {
      setError("Enter an age between 0 and 120.");
      return;
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      setError("Enter a 10-digit phone number, or leave it empty.");
      return;
    }
    if (
      existing.some((h) => h.code.toLowerCase() === code.trim().toLowerCase())
    ) {
      setError("That house number already exists. Choose another.");
      return;
    }
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await save({
        id,
        code: code.trim(),
        familyName: `${name.trim()} & family`,
        area: area.trim(),
        address: address.trim(),
        members: [
          {
            id: crypto.randomUUID(),
            name: name.trim(),
            relation: "Head of household",
            age: Number(age),
            sex: "other",
            phone: phone || undefined,
            conditions: [],
          },
        ],
        lastVisit: null,
        nextVisit: null,
        status: "due",
        color: "blue",
      });
    } catch {
      setError("The household could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add a household" onClose={onClose}>
      <form className="add-form" onSubmit={submit}>
        <p>
          Start with the person you know. These details can be reviewed during a
          visit.
        </p>
        <label>
          Primary member name
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </label>
        <div className="form-pair">
          <label>
            House number
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. H-023"
            />
          </label>
          <label>
            Age
            <input
              required
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Years"
            />
          </label>
        </div>
        <label>
          Address
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street or landmark"
          />
        </label>
        <label>
          Area
          <input
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Village or locality"
          />
        </label>
        <label>
          Phone number <span className="optional">Optional</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add household"}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
