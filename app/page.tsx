"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Build = { id: string; name: string; sequence: number; token: string };
type Issue = {
  id: string;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  status: "reported" | "ready" | "verified" | "reopened";
  reported_build_id: string;
  target_build_id: string | null;
  created_at: string;
  events: {
    id: string;
    kind: string;
    build_id: string | null;
    note: string;
    created_at: string;
  }[];
};
type Workspace = {
  project: { id: string; name: string };
  builds: Build[];
  issues: Issue[];
  mode: "demo" | "private";
};
const labels: Record<string, string> = {
  reported: "Reported",
  ready: "Ready to retest",
  verified: "Verified fixed",
  reopened: "Reopened",
};
async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function Icon({ name }: { name: "inbox" | "arrow" | "check" | "plus" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "inbox" ? (
        <>
          <path d="M4 4h16l2 12v4H2v-4L4 4Z" />
          <path d="M2 15h6l2 3h4l2-3h6" />
        </>
      ) : name === "arrow" ? (
        <>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </>
      ) : name === "check" ? (
        <path d="m5 12 4 4L19 6" />
      ) : (
        <path d="M12 5v14M5 12h14" />
      )}
    </svg>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status] || status.replaceAll("_", " ")}
    </span>
  );
}
type Role = "developer" | "tester";
const roleNames = {
  developer: { label: "Developer", mascot: "Byte" },
  tester: { label: "Tester", mascot: "Bug" },
} as const;

function RoleAvatar({ role }: { role: Role }) {
  return (
    <span className={`role-avatar-frame role-avatar--${role}`}>
      <Image
        className="role-avatar"
        src={`/mascots/${roleNames[role].mascot.toLowerCase()}.png`}
        alt=""
        width={94}
        height={94}
        unoptimized
      />
    </span>
  );
}

function RoleProfile({ role }: { role: Role }) {
  return (
    <div className={`role-profile role-profile--${role}`}>
      <RoleAvatar role={role} />
      <span className="role-profile-copy">
        <strong>{roleNames[role].mascot}</strong>
        <small>{roleNames[role].label}</small>
      </span>
    </div>
  );
}

function DateLabel({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time dateTime={value}>
      {isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
    </time>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoOnly, setDemoOnly] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [buildFilter, setBuildFilter] = useState("all");
  const [role, setRole] = useState<Role>("developer");
  const [showForm, setShowForm] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showBuild, setShowBuild] = useState(false);
  const [reportToken, setReportToken] = useState("");
  const [ticketToken, setTicketToken] = useState("");
  const [reportContext, setReportContext] = useState<{
    projectName: string;
    build: Build;
  } | null>(null);
  const [ticket, setTicket] = useState<Issue | null>(null);
  const [ticketBuilds, setTicketBuilds] = useState<Build[]>([]);
  const [projectName, setProjectName] = useState("");
  const [submittedLink, setSubmittedLink] = useState("");
  const [target, setTarget] = useState("");
  const modalOpener = useRef<HTMLElement | null>(null);
  const openModal = (setter: (value: boolean) => void) => {
    modalOpener.current = document.activeElement as HTMLElement;
    setter(true);
  };
  useEffect(() => {
    if (!showForm && !showLogin && !showBuild) {
      modalOpener.current?.focus();
    }
  }, [showForm, showLogin, showBuild]);

  const refresh = useCallback(async (id?: string) => {
    const data = (await api("/api/workspace")) as Workspace;
    setWorkspace(data);
    if (id) setSelectedId(id);
    else setSelectedId((current) => current || data.issues[0]?.id || "");
  }, []);
  const loadTicket = useCallback(async (token: string) => {
    const data = await api("/api/ticket?token=" + encodeURIComponent(token));
    setTicket(data.issue || data);
    setTicketBuilds(data.builds || []);
    setProjectName(data.projectName || "Playtest report");
  }, []);
  useEffect(() => {
    api("/api/config")
      .then((data) => setDemoOnly(data.demoOnly === true))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const report = params.get("report");
    const token = params.get("ticket");
    if (report) {
      setReportToken(report);
      api("/api/report?token=" + encodeURIComponent(report))
        .then(setReportContext)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    } else if (token) {
      setTicketToken(token);
      loadTicket(token)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      fetch("/api/workspace")
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setWorkspace(data);
            setSelectedId(data.issues[0]?.id || "");
          } else if (r.status !== 401) {
            const data = await r.json();
            setError(data.error || "Could not load workspace.");
          }
        })
        .catch(() => setError("Could not connect. Refresh to try again."))
        .finally(() => setLoading(false));
    }
  }, [loadTicket]);
  useEffect(() => {
    if (!showForm && !showLogin && !showBuild) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setShowForm(false);
        setShowLogin(false);
        setShowBuild(false);
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector("[role=dialog]");
      const elements = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = priorOverflow;
    };
  }, [showForm, showLogin, showBuild, busy]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const visibleIssues =
    workspace?.issues.filter(
      (i) =>
        (filter === "all" || i.status === filter) &&
        (buildFilter === "all" || i.reported_build_id === buildFilter),
    ) || [];
  const issue =
    ticket ||
    visibleIssues.find((i) => i.id === selectedId) ||
    visibleIssues[0];
  useEffect(() => {
    setTarget("");
  }, [issue?.id]);
  const builds = workspace?.builds || ticketBuilds;
  const buildName = (id: string | null) =>
    builds.find((b) => b.id === id)?.name || "Unknown build";
  const reportBuild = builds.find(
    (b) => b.id === (issue?.target_build_id || issue?.reported_build_id),
  );
  const laterBuilds = builds.filter(
    (b) => b.sequence > (reportBuild?.sequence ?? -1),
  );

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const data = await api("/api/issues", {
        buildToken: reportToken || form.get("buildToken"),
        title: form.get("title"),
        steps: form.get("steps"),
        expected: form.get("expected"),
        actual: form.get("actual"),
      });
      setSubmittedLink(
        data.reportToken
          ? window.location.origin +
              "/?ticket=" +
              encodeURIComponent(data.reportToken)
          : "",
      );
      if (!reportToken) {
        await refresh(data.id);
        setShowForm(false);
        setFilter("all");
        setBuildFilter("all");
        setNotice("Report saved. It is attached to the build you tested.");
      }
    });
  }
  const reportForm = (
    <form onSubmit={submitReport} className="report-form">
      {!reportToken && (
        <label>
          Build tested
          <select name="buildToken" required defaultValue={builds[0]?.token}>
            {builds.map((b) => (
              <option key={b.id} value={b.token}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        What went wrong?
        <input
          autoFocus
          name="title"
          placeholder="e.g. Pause menu stays open after resuming"
          required
          maxLength={140}
        />
      </label>
      <label>
        Steps to reproduce
        <textarea
          name="steps"
          placeholder={"1. Open the pause menu\n2. Select Resume\n3. …"}
          required
          maxLength={3000}
          rows={4}
        />
      </label>
      <div className="form-columns">
        <label>
          What did you expect?
          <textarea
            name="expected"
            required
            maxLength={3000}
            rows={3}
            placeholder="The game resumes and the menu closes."
          />
        </label>
        <label>
          What actually happened?
          <textarea
            name="actual"
            required
            maxLength={3000}
            rows={3}
            placeholder="The game resumes behind the menu."
          />
        </label>
      </div>
      <p className="form-hint">
        No account or personal details needed. Please do not include private
        information.
      </p>
      <div className="form-actions">
        {!reportToken && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowForm(false)}
            disabled={busy}
          >
            Cancel
          </button>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Submit report"}
          <Icon name="arrow" />
        </button>
      </div>
    </form>
  );
  const detail = issue && (
    <article className="issue-detail" aria-label="Report details">
      <div className="detail-top">
        <span className="eyebrow">
          REPORT · {issue.id.slice(0, 6).toUpperCase()}
        </span>
        <DateLabel value={issue.created_at} />
      </div>
      <h2>{issue.title}</h2>
      <Badge status={issue.status} />
      <div className="build-trail">
        <div>
          <span>Reported in</span>
          <strong>{buildName(issue.reported_build_id)}</strong>
        </div>
        <Icon name="arrow" />
        <div>
          <span>
            {issue.status === "verified" ? "Verified in" : "Retest in"}
          </span>
          <strong>
            {issue.target_build_id
              ? buildName(issue.target_build_id)
              : "Not assigned yet"}
          </strong>
        </div>
      </div>
      <section className="report-body">
        <h3>Steps to reproduce</h3>
        <p>{issue.steps}</p>
        <div className="expectation-grid">
          <div>
            <h3>Expected</h3>
            <p>{issue.expected}</p>
          </div>
          <div>
            <h3>Actual</h3>
            <p>{issue.actual}</p>
          </div>
        </div>
      </section>
      {!ticketToken &&
        role === "developer" &&
        (issue.status === "reported" || issue.status === "reopened") && (
          <section className="action-panel">
            <span className="eyebrow">NEXT STEP</span>
            <h3>Ship the fix. Then prove it.</h3>
            <p>Choose the newer build a tester should check.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void perform(async () => {
                  await api(`/api/issues/${issue.id}/ready`, {
                    buildId: form.get("buildId"),
                    note: form.get("note"),
                  });
                  await refresh(issue.id);
                  setNotice("Ready for a tester to verify.");
                });
              }}
            >
              <label>
                Build to retest
                <select
                  name="buildId"
                  required
                  value={
                    laterBuilds.some((b) => b.id === target)
                      ? target
                      : laterBuilds[0]?.id || ""
                  }
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {laterBuilds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fix notes
                <textarea
                  name="note"
                  required
                  maxLength={3000}
                  placeholder="What changed? What should the tester look for?"
                  rows={2}
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !laterBuilds.length}
              >
                {busy ? "Saving…" : "Mark ready to retest"}
                <Icon name="arrow" />
              </button>
              {!laterBuilds.length && <p>Create a newer build first.</p>}
            </form>
          </section>
        )}
      {issue.status === "ready" && (ticketToken || role === "tester") && (
        <section className="action-panel">
          <span className="eyebrow">YOUR VERDICT</span>
          <h3>Does it work in {buildName(issue.target_build_id)}?</h3>
          <p>
            Repeat the steps above in this build, then record what happened.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const native = e.nativeEvent as SubmitEvent;
              const outcome = (native.submitter as HTMLButtonElement)?.value;
              const form = new FormData(e.currentTarget);
              void perform(async () => {
                await api(`/api/issues/${issue.id}/retest`, {
                  outcome,
                  note: form.get("note"),
                  ...(ticketToken ? { reportToken: ticketToken } : {}),
                });
                if (ticketToken) await loadTicket(ticketToken);
                else await refresh(issue.id);
                setNotice(
                  outcome === "verified"
                    ? "Fix verified. The build history is preserved."
                    : "Report reopened with your feedback.",
                );
              });
            }}
          >
            <label>
              Retest notes
              <textarea
                name="note"
                required
                maxLength={3000}
                placeholder="Describe what you checked and the result."
                rows={3}
              />
            </label>
            <div className="form-actions">
              <button
                name="outcome"
                value="reopened"
                className="button secondary"
                disabled={busy}
              >
                Still happening
              </button>
              <button
                name="outcome"
                value="verified"
                className="button teal"
                disabled={busy}
              >
                <Icon name="check" />
                Verify fixed
              </button>
            </div>
          </form>
        </section>
      )}
      {issue.status === "ready" && !ticketToken && role === "developer" && (
        <div className="callout">
          The fix is ready for an independent retest.
          {workspace?.mode === "demo"
            ? " Switch to Tester view to try the next step."
            : " The reporter can return using their private ticket link."}
        </div>
      )}
      {issue.status === "verified" && (
        <div className="verified-note">
          <Icon name="check" />
          <div>
            <strong>Fixed, with evidence.</strong>
            <p>The original report and each retest stay in the timeline.</p>
          </div>
        </div>
      )}
      <section className="history">
        <h3>
          Build history <span>{issue.events?.length || 0}</span>
        </h3>
        <ol>
          {issue.events?.map((event, index) => (
            <li key={event.id}>
              <span
                className={
                  "timeline-dot " +
                  (index === issue.events.length - 1 ? "latest" : "")
                }
              />
              <div>
                <strong>
                  {labels[event.kind] || event.kind.replaceAll("_", " ")}
                </strong>
                {event.build_id && (
                  <span className="event-build">
                    {buildName(event.build_id)}
                  </span>
                )}
                <DateLabel value={event.created_at} />
                {event.note && <p>{event.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
  return (
    <div
      className="app-shell"
      data-theme={
        reportToken || ticketToken
          ? "tester"
          : workspace
            ? workspace.mode === "private"
              ? "developer"
              : role
            : "shared"
      }
    >
      <header className="site-header">
        <a className="brand" href="/" aria-label="Playtest Inbox home">
          <span className="brand-mark">
            <Image
              className="brand-logo"
              src="/logo.png"
              alt=""
              width={1491}
              height={758}
              unoptimized
            />
          </span>
          <span>
            playtest<span className="brand-light"> inbox</span>
          </span>
        </a>
        <div className="header-right">
          <span className="header-tag">FROM BUG REPORT TO PROOF.</span>
          {workspace ? (
            <button
              className="text-button"
              onClick={() =>
                void perform(async () => {
                  await api("/api/logout", {});
                  setWorkspace(null);
                  setSubmittedLink("");
                  setRole("developer");
                })
              }
              disabled={busy}
            >
              Leave workspace ↗
            </button>
          ) : (
            demoOnly === false &&
            !reportToken &&
            !ticketToken && (
              <button
                className="text-button"
                onClick={() => openModal(setShowLogin)}
              >
                Developer sign in ↗
              </button>
            )
          )}
        </div>
      </header>
      {error && (
        <div className="message error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {workspace && submittedLink && (
        <div className="message success">
          <a href={submittedLink} target="_blank" rel="noreferrer">
            Save your private ticket link to retest this report ↗
          </a>
          <button
            aria-label="Dismiss ticket link"
            onClick={() => setSubmittedLink("")}
          >
            ×
          </button>
        </div>
      )}
      {loading ? (
        <main className="loading" aria-live="polite">
          <span className="loading-dot" />
          Opening your inbox…
        </main>
      ) : reportToken ? (
        <main className="external-page">
          <a href="/" className="back-link">
            ← About Playtest Inbox
          </a>
          {reportContext && (
            <>
              <span className="eyebrow">
                {reportContext.projectName} / {reportContext.build.name}
              </span>
              <div className="external-role">
                <RoleProfile role="tester" />
              </div>
              <h1>Found something?</h1>
              <p className="intro">
                A clear report is the first step to a verified fix.
              </p>
              {submittedLink ? (
                <section className="submitted">
                  <span className="large-check">
                    <Icon name="check" />
                  </span>
                  <h2>Report delivered.</h2>
                  <p>
                    Save this private ticket link. It is your way back to check
                    the fix, without an account. Anyone with it can see and
                    retest this report.
                  </p>
                  <a className="button primary" href={submittedLink}>
                    Open my ticket
                    <Icon name="arrow" />
                  </a>
                  <label>
                    Private ticket link
                    <input
                      readOnly
                      value={submittedLink}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                </section>
              ) : (
                reportForm
              )}
            </>
          )}
        </main>
      ) : ticketToken ? (
        <main className="external-page ticket-page">
          <span className="eyebrow">{projectName} / YOUR PRIVATE TICKET</span>
          <div className="external-role">
            <RoleProfile role="tester" />
          </div>
          {detail}
          <p className="form-hint">
            Keep this link private. It grants access to this report and its
            retests.
          </p>
        </main>
      ) : !workspace ? (
        <main className="landing">
          <div className="hero-copy">
            <div className="role-profiles">
              <RoleProfile role="developer" />
              <RoleProfile role="tester" />
            </div>
            <span className="eyebrow">
              <span className="live-dot" />
              THE LOOP IS NOT CLOSED UNTIL IT’S TESTED.
            </span>
            <h1>
              Reported.
              <br />
              Retested.
              <br />
              <span>Really fixed.</span>
            </h1>
            <p>
              Turn playtest feedback into verified fixes.
              <br />
              One report, every build, a clear trail of what changed.
            </p>
            <button
              className="button primary large"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await api("/api/demo", {});
                  await refresh();
                })
              }
            >
              {busy ? "Preparing your demo…" : "Try the interactive demo"}
              <Icon name="arrow" />
            </button>
            <span className="demo-footnote">
              {demoOnly
                ? "No sign-up. Use fictional details. Your demo expires after one hour."
                : "No sign-up. Fictional project. Your own demo session."}
            </span>
          </div>
          <div className="hero-preview">
            <div className="preview-label">
              <span className="live-dot" />
              THE FIX, IN CONTEXT<span>01 / 03</span>
            </div>
            <article className="preview-card">
              <div className="preview-card-top">
                <span className="eyebrow">MOONLIGHT COURIER</span>
                <span className="mini-version">BUILD A → BUILD B</span>
              </div>
              <h2>Pause menu won’t close</h2>
              <div className="preview-step">
                <span className="step-symbol orange">!</span>
                <div>
                  <strong>Reported in Build A</strong>
                  <p>Resume keeps the menu on screen.</p>
                </div>
                <span className="small-muted">01</span>
              </div>
              <div className="preview-step">
                <span className="step-symbol blue">↗</span>
                <div>
                  <strong>Ready to retest in Build B</strong>
                  <p>Input focus resets when resuming.</p>
                </div>
                <span className="small-muted">02</span>
              </div>
              <div className="preview-step">
                <span className="step-symbol green">
                  <Icon name="check" />
                </span>
                <div>
                  <strong>Verified by a tester</strong>
                  <p>Menu closes. Controls work. Fixed.</p>
                </div>
                <span className="small-muted">03</span>
              </div>
              <div className="preview-bottom">
                <Badge status="verified" />
                <span>Original report preserved ↗</span>
              </div>
            </article>
            <div className="preview-caption">
              <span>LESS “SHOULD BE FIXED.”</span>
              <span>MORE “I CHECKED.”</span>
            </div>
          </div>
          <section className="value-row">
            <div>
              <span>01</span>
              <h3>Easy to report</h3>
              <p>
                Share a build-specific link. Testers skip the account setup.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>Built for the next build</h3>
              <p>
                Connect each fix to a release, rather than losing it in a chat.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Keep the whole story</h3>
              <p>
                Verification and reopened issues live beside the original
                report.
              </p>
            </div>
          </section>
        </main>
      ) : (
        <>
          <div
            className={
              "workspace-banner " + (workspace.mode === "demo" ? "" : "private")
            }
          >
            <span>
              <strong>
                {workspace.mode === "demo"
                  ? "INTERACTIVE DEMO"
                  : "PRIVATE WORKSPACE"}
              </strong>
              {workspace.mode === "demo"
                ? " Fictional data · isolated session · nothing sent to a studio"
                : " Reports are accessible through your developer session or their private ticket links."}
            </span>
            {workspace.mode === "demo" && (
              <div className="role-switch" aria-label="Demo perspective">
                {(Object.keys(roleNames) as Role[]).map((view) => (
                  <button
                    key={view}
                    aria-label={roleNames[view].label}
                    aria-pressed={role === view}
                    onClick={() => setRole(view)}
                  >
                    <RoleAvatar role={view} />
                    <span className="role-switch-copy">
                      <strong>{roleNames[view].label}</strong>
                      <small>{roleNames[view].mascot}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <main className="workspace">
            <section className="workspace-heading">
              <div>
                {workspace.mode === "private" && (
                  <RoleProfile role="developer" />
                )}
                <div className="workspace-kicker">
                  <span className="eyebrow">PROJECT WORKSPACE</span>
                </div>
                <h1>
                  {workspace.project.name}
                  <span className="project-dot" />
                </h1>
                <p>
                  {role === "developer"
                    ? "A reported bug is a starting point. A verified fix is the finish line."
                    : "Try the tester perspective. Report an issue or check a fix in a newer build."}
                </p>
              </div>
              <div className="heading-actions">
                {demoOnly && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await api("/api/demo", {});
                        setSelectedId("");
                        setFilter("all");
                        setBuildFilter("all");
                        setRole("developer");
                        await refresh();
                        setNotice(
                          "Demo reset. You’re back to the sample reports.",
                        );
                      })
                    }
                  >
                    Reset demo
                  </button>
                )}
                {role === "developer" && (
                  <button
                    className="button secondary"
                    onClick={() => openModal(setShowBuild)}
                  >
                    New build
                  </button>
                )}
                <button
                  className="button primary"
                  onClick={() => openModal(setShowForm)}
                >
                  <Icon name="plus" />
                  Report an issue
                </button>
              </div>
            </section>
            <section className="metrics" aria-label="Report totals">
              <div>
                <span>ALL REPORTS</span>
                <strong>
                  {workspace.issues.length.toString().padStart(2, "0")}
                </strong>
              </div>
              <div>
                <span>NEEDS ATTENTION</span>
                <strong>
                  {workspace.issues
                    .filter(
                      (i) => i.status === "reported" || i.status === "reopened",
                    )
                    .length.toString()
                    .padStart(2, "0")}
                  <i className="metric-dot orange" />
                </strong>
              </div>
              <div>
                <span>READY TO RETEST</span>
                <strong>
                  {workspace.issues
                    .filter((i) => i.status === "ready")
                    .length.toString()
                    .padStart(2, "0")}
                  <i className="metric-dot blue" />
                </strong>
              </div>
              <div>
                <span>VERIFIED FIXED</span>
                <strong>
                  {workspace.issues
                    .filter((i) => i.status === "verified")
                    .length.toString()
                    .padStart(2, "0")}
                  <i className="metric-dot green" />
                </strong>
              </div>
            </section>
            <section className="inbox">
              <div className="inbox-toolbar">
                <div className="filter-tabs" aria-label="Filter by status">
                  {["all", "reported", "ready", "verified", "reopened"].map(
                    (status) => (
                      <button
                        key={status}
                        aria-pressed={filter === status}
                        onClick={() => setFilter(status)}
                      >
                        {status === "all" ? "All reports" : labels[status]}
                      </button>
                    ),
                  )}
                </div>
                <label className="build-filter">
                  <span className="sr-only">Filter by reported build</span>
                  <select
                    value={buildFilter}
                    onChange={(e) => setBuildFilter(e.target.value)}
                  >
                    <option value="all">All builds</option>
                    {builds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inbox-grid">
                <aside className="issue-list" aria-label="Reports">
                  {visibleIssues.length ? (
                    visibleIssues.map((i) => (
                      <button
                        className={
                          "issue-row " + (issue?.id === i.id ? "selected" : "")
                        }
                        key={i.id}
                        onClick={() => {
                          setSelectedId(i.id);
                          setTarget("");
                        }}
                        aria-pressed={issue?.id === i.id}
                      >
                        <div>
                          <Badge status={i.status} />
                          <span className="issue-arrow">↗</span>
                        </div>
                        <h3>{i.title}</h3>
                        <p>
                          <span>{buildName(i.reported_build_id)}</span>
                          <DateLabel value={i.created_at} />
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Icon name="inbox" />
                      <h3>No reports here.</h3>
                      <p>Try another filter or submit your first report.</p>
                    </div>
                  )}
                </aside>
                {detail || (
                  <div className="empty-state detail-empty">
                    <h2>Your next fix starts here.</h2>
                    <p>Select a report to see its details and build history.</p>
                  </div>
                )}
              </div>
            </section>
            <section className="build-links">
              <div>
                <span className="eyebrow">TESTER ACCESS</span>
                <h3>A link for each build.</h3>
                <p>
                  These links accept new reports. They don’t expose your inbox.
                </p>
              </div>
              <div className="build-link-list">
                {builds.map((b) => (
                  <a
                    key={b.id}
                    href={"/?report=" + encodeURIComponent(b.token)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{b.name}</span>
                    <span>Open report form ↗</span>
                  </a>
                ))}
              </div>
            </section>
          </main>
        </>
      )}
      <footer>
        <span>playtest inbox</span>
        <p>
          Created by <a href="https://cesardelgado.dev">Cesar Delgado</a>
        </p>
        <span>BUILT FOR SMALL TEAMS.</span>
      </footer>
      {showForm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-heading"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">NEW REPORT</span>
                <h2 id="report-heading">What did you find?</h2>
              </div>
              <button
                className="close-button"
                aria-label="Close report form"
                onClick={() => setShowForm(false)}
                disabled={busy}
              >
                ×
              </button>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            {reportForm}
          </section>
        </div>
      )}
      {demoOnly === false && showLogin && (
        <div className="modal-backdrop">
          <section
            className="modal small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-heading"
          >
            <div className="modal-heading">
              <h2 id="login-heading">Developer sign in</h2>
              <button
                className="close-button"
                aria-label="Close sign in"
                disabled={busy}
                onClick={() => setShowLogin(false)}
              >
                ×
              </button>
            </div>
            <p>
              Use the developer password configured for this installation. To
              explore with sample data, try the demo instead.
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const password = new FormData(e.currentTarget).get("password");
                void perform(async () => {
                  await api("/api/login", { password });
                  await refresh();
                  setShowLogin(false);
                });
              }}
            >
              <label>
                Developer password
                <input
                  autoFocus
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                <Icon name="arrow" />
              </button>
            </form>
          </section>
        </div>
      )}
      {showBuild && (
        <div className="modal-backdrop">
          <section
            className="modal small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-heading"
          >
            <div className="modal-heading">
              <h2 id="build-heading">Add a build</h2>
              <button
                className="close-button"
                aria-label="Close new build"
                disabled={busy}
                onClick={() => setShowBuild(false)}
              >
                ×
              </button>
            </div>
            <p>
              A new build gets its own feedback link and can be assigned for
              retesting.
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name");
                void perform(async () => {
                  await api("/api/builds", { name });
                  await refresh();
                  setShowBuild(false);
                  setNotice("Build created. Its tester link is ready below.");
                });
              }}
            >
              <label>
                Build name
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Build C · v0.3.0"
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Create build"}
                <Icon name="plus" />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
