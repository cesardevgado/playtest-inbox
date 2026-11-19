import { randomUUID } from "node:crypto";
import { DB, Row, query, transaction } from "./db";
import { token, demand } from "./security";
export async function event(
  db: DB,
  id: string,
  kind: string,
  build: string,
  note: string,
) {
  await db.query(
    "INSERT INTO events(id,issue_id,kind,build_id,note) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), id, kind, build, note],
  );
}
export async function seed(id: string, mode: "demo" | "private") {
  await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO projects(id,name,mode) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
      [id, mode === "demo" ? "Moonlight Courier" : "My playtest", mode],
    );
    if (!inserted.rows.length) return;
    const a = randomUUID(),
      b = randomUUID();
    await db.query(
      "INSERT INTO builds(id,project_id,name,sequence,token) VALUES ($1,$2,$3,1,$4),($5,$2,$6,2,$7)",
      [
        a,
        id,
        "0.1.0 · First playtest",
        token(),
        b,
        "0.1.1 · Movement fixes",
        token(),
      ],
    );
    if (mode === "private") return;
    const samples = [
      [
        "Courier gets stuck behind the mailbox",
        "Walk behind the blue mailbox. Hold left, then press jump.",
        "Courier jumps back onto the path.",
        "Courier cannot move until the scene is restarted.",
        "reported",
      ],
      [
        "Delivery counter disappears after pause",
        "Deliver a parcel. Pause, then resume the game.",
        "The delivery counter remains visible.",
        "The top-left counter disappears.",
        "ready",
      ],
      [
        "Footsteps continue on the map screen",
        "Walk, then open the map while holding right.",
        "Footsteps stop while the map is open.",
        "Footsteps keep looping.",
        "verified",
      ],
    ];
    for (const [title, steps, expected, actual, status] of samples) {
      const issue = randomUUID();
      await db.query(
        "INSERT INTO issues(id,project_id,title,steps,expected,actual,status,reported_build_id,target_build_id,report_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          issue,
          id,
          title,
          steps,
          expected,
          actual,
          status,
          a,
          status === "reported" ? null : b,
          token(),
        ],
      );
      await event(
        db,
        issue,
        "reported",
        a,
        "Submitted during the first playtest.",
      );
      if (status !== "reported")
        await event(
          db,
          issue,
          "ready",
          b,
          "Fix included in the movement update.",
        );
      if (status === "verified")
        await event(
          db,
          issue,
          "verified",
          b,
          "Retested on the map screen. Footsteps now stop correctly.",
        );
    }
  });
}
export async function issues(project: string): Promise<Row[]> {
  const rows = await query(
    "SELECT id,title,steps,expected,actual,status,reported_build_id,target_build_id,created_at FROM issues WHERE project_id=$1 ORDER BY created_at DESC,id",
    [project],
  );
  const events = await query(
    "SELECT e.id,e.issue_id,e.kind,e.build_id,e.note,e.created_at FROM events e JOIN issues i ON i.id=e.issue_id WHERE i.project_id=$1 ORDER BY e.sequence",
    [project],
  );
  return rows.map((i) => ({
    ...i,
    events: events.filter((e) => e.issue_id === i.id),
  }));
}
export async function ready(
  project: string,
  id: string,
  buildId: string,
  note: string,
) {
  return transaction(async (db) => {
    const rows = (
      await db.query(
        "SELECT i.*,b.sequence AS old_sequence FROM issues i JOIN builds b ON b.id=COALESCE(i.target_build_id,i.reported_build_id) WHERE i.id=$1 AND i.project_id=$2 FOR UPDATE OF i",
        [id, project],
      )
    ).rows;
    demand(rows[0], 404, "Issue not found.");
    const issue = rows[0];
    demand(
      ["reported", "reopened"].includes(issue.status),
      409,
      "Only reported or reopened issues can be sent for retesting.",
    );
    const b = (
      await db.query("SELECT * FROM builds WHERE id=$1 AND project_id=$2", [
        buildId,
        project,
      ])
    ).rows[0];
    demand(
      b && b.sequence > issue.old_sequence,
      400,
      "Choose a build newer than the last tested build.",
    );
    await db.query(
      "UPDATE issues SET status='ready',target_build_id=$1 WHERE id=$2",
      [buildId, id],
    );
    await event(db, id, "ready", buildId, note);
  });
}
export async function retest(
  id: string,
  outcome: string,
  note: string,
  reportToken: string | undefined,
  demoProject: string | undefined,
) {
  return transaction(async (db) => {
    const issue = (
      await db.query(
        "SELECT * FROM issues WHERE id=$1 AND (report_token=$2 OR project_id=$3) FOR UPDATE",
        [id, reportToken || "", demoProject || ""],
      )
    ).rows[0];
    demand(issue, 404, "Issue not found.");
    demand(
      issue.status === "ready",
      409,
      "This issue is not awaiting a retest. Refresh to see its latest status.",
    );
    await db.query("UPDATE issues SET status=$1 WHERE id=$2", [outcome, id]);
    await event(db, id, outcome, issue.target_build_id, note);
  });
}
