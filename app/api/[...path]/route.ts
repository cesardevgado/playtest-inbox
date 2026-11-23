import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { seed, issues, event, ready, retest } from "@/lib/service";
import {
  appOrigin,
  demoLifetime,
  demoLimits,
  publicDemo,
  sessionCookieIsSecure,
} from "@/lib/demo";
import {
  session,
  sign,
  token,
  equal,
  demand,
  field,
  throttle,
  HttpError,
  Session,
} from "@/lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function secureCookie() {
  return sessionCookieIsSecure(
    appOrigin(),
    process.env.COOKIE_SECURE === "true",
    publicDemo() && process.env.NODE_ENV === "production",
  );
}
async function readBody(req: NextRequest) {
  const reader = req.body?.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  if (!reader) return "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes >= 16000) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, "Report is too large.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts).toString("utf8");
}
function signed(s: Session) {
  const res = json({ ok: true });
  res.cookies.set("pi_session", sign(s), {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie(),
    path: "/",
    maxAge: Math.ceil((s.expires - Date.now()) / 1000),
  });
  return res;
}
async function handler(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace(/^\/api\//, "");
    const demoOnly = publicDemo();
    const s = session(req);
    if (demoOnly && ["login", "report", "ticket"].includes(path)) {
      return json(
        {
          error: "Private sign-in and shared links are disabled in this demo.",
        },
        404,
      );
    }
    if (req.method === "GET") {
      if (path === "config") return json({ demoOnly });
      if (path === "health") {
        await query("SELECT 1");
        return json({ ok: true });
      }
      if (path === "workspace") {
        demand(s, 401, "Start a demo or sign in to your workspace.");
        const project = (
          await query("SELECT id,name FROM projects WHERE id=$1", [s.projectId])
        )[0];
        demand(project, 401, "Your demo expired. Start a new one.");
        return json({
          project,
          mode: s.mode,
          builds: await query(
            "SELECT id,name,sequence,token FROM builds WHERE project_id=$1 ORDER BY sequence",
            [s.projectId],
          ),
          issues: await issues(s.projectId),
        });
      }
      if (path === "report") {
        const b = (
          await query(
            "SELECT b.id,b.name,p.name AS project_name FROM builds b JOIN projects p ON p.id=b.project_id WHERE b.token=$1",
            [req.nextUrl.searchParams.get("token") || ""],
          )
        )[0];
        demand(b, 404, "This feedback link is invalid or expired.");
        return json({
          projectName: b.project_name,
          build: { id: b.id, name: b.name },
        });
      }
      if (path === "ticket") {
        const i = (
          await query(
            "SELECT id,project_id FROM issues WHERE report_token=$1",
            [req.nextUrl.searchParams.get("token") || ""],
          )
        )[0];
        demand(i, 404, "This private ticket link is invalid or expired.");
        const issue = (await issues(i.project_id)).find((x) => x.id === i.id);
        const builds = await query(
          "SELECT id,name,sequence FROM builds WHERE project_id=$1 ORDER BY sequence",
          [i.project_id],
        );
        const project = (
          await query("SELECT name FROM projects WHERE id=$1", [i.project_id])
        )[0];
        return json({ issue, builds, projectName: project.name });
      }
      return json({ error: "Not found." }, 404);
    }
    const origin = req.headers.get("origin");
    demand(origin === appOrigin(), 403, "Request origin is not allowed.");
    demand(
      req.headers.get("content-type")?.includes("application/json"),
      415,
      "Send JSON.",
    );
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
    demand(
      data && typeof data === "object" && !Array.isArray(data),
      400,
      "Invalid request.",
    );
    // In-process abuse limits: sufficient for local prototype; not a distributed rate limiter.
    if (path === "demo") {
      throttle("demo", 30);
      const id = randomUUID();
      const expires = Date.now() + (demoOnly ? demoLifetime : 8 * 3600000);
      await seed(
        id,
        "demo",
        demoOnly && s?.mode === "demo" ? s.projectId : undefined,
      );
      return signed({ projectId: id, mode: "demo", expires });
    }
    if (path === "login") {
      throttle("login", 10);
      demand(
        process.env.DEVELOPER_PASSWORD &&
          process.env.DEVELOPER_PASSWORD.length >= 16,
        503,
        "Private workspace is not configured. Set a developer password of at least 16 characters.",
      );
      demand(
        typeof data.password === "string" &&
          equal(data.password, process.env.DEVELOPER_PASSWORD),
        401,
        "Incorrect password.",
      );
      await seed("private-workspace", "private");
      return signed({
        projectId: "private-workspace",
        mode: "private",
        expires: Date.now() + 8 * 3600000,
      });
    }
    if (path === "logout") {
      const res = json({ ok: true });
      res.cookies.set("pi_session", "", {
        path: "/",
        maxAge: 0,
        secure: secureCookie(),
        httpOnly: true,
        sameSite: "strict",
      });
      return res;
    }
    if (path === "issues") {
      if (demoOnly) demand(s?.mode === "demo", 401, "Start a demo first.");
      const buildToken = field(data.buildToken, "Build link", 100);
      const title = field(data.title, "Title", 140),
        steps = field(data.steps, "Steps"),
        expected = field(data.expected, "Expected behavior"),
        actual = field(data.actual, "Actual behavior");
      const id = randomUUID(),
        rt = token();
      await transaction(async (db) => {
        const b = (
          await db.query(
            "SELECT id,project_id FROM builds WHERE token=$1 AND ($2::text IS NULL OR project_id=$2)",
            [buildToken, demoOnly ? s!.projectId : null],
          )
        ).rows[0];
        demand(b, 404, "Feedback link not found.");
        throttle("report:" + buildToken, 15);
        if (demoOnly) {
          const project = (
            await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [
              b.project_id,
            ])
          ).rows[0];
          demand(project, 401, "Your demo expired. Start a new one.");
          const count = (
            await db.query(
              "SELECT COUNT(*)::int AS count FROM issues WHERE project_id=$1",
              [b.project_id],
            )
          ).rows[0].count;
          demand(
            count < demoLimits.issues,
            400,
            "This demo inbox is full. Reset it to try again.",
          );
        }
        await db.query(
          "INSERT INTO issues(id,project_id,title,steps,expected,actual,status,reported_build_id,report_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id,
            b.project_id,
            title,
            steps,
            expected,
            actual,
            "reported",
            b.id,
            rt,
          ],
        );
        await event(db, id, "reported", b.id, "New playtest report.");
      });
      return json(demoOnly ? { id } : { id, reportToken: rt }, 201);
    }
    const readyMatch = path.match(/^issues\/([^/]+)\/ready$/);
    if (readyMatch) {
      demand(s, 401, "Sign in to manage issues.");
      await ready(
        s.projectId,
        readyMatch[1],
        field(data.buildId, "Build", 100),
        field(data.note, "Fix note"),
      );
      return json({ ok: true });
    }
    const retestMatch = path.match(/^issues\/([^/]+)\/retest$/);
    if (retestMatch) {
      demand(
        ["verified", "reopened"].includes(data.outcome),
        400,
        "Choose verified or reopened.",
      );
      demand(
        s?.mode === "demo" ||
          (!demoOnly && typeof data.reportToken === "string"),
        401,
        "Use your private ticket link to submit a retest.",
      );
      await retest(
        retestMatch[1],
        data.outcome,
        field(data.note, "Retest note"),
        !demoOnly && typeof data.reportToken === "string"
          ? data.reportToken
          : undefined,
        s?.mode === "demo" ? s.projectId : undefined,
      );
      return json({ ok: true });
    }
    if (path === "builds") {
      demand(s, 401, "Sign in to create a build.");
      const name = field(data.name, "Build name", 80);
      const build = await transaction(async (db) => {
        const project = (
          await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [
            s.projectId,
          ])
        ).rows[0];
        demand(project, 401, "Your demo expired. Start a new one.");
        const count = (
          await db.query(
            "SELECT COALESCE(MAX(sequence),0)::int AS number FROM builds WHERE project_id=$1",
            [s.projectId],
          )
        ).rows[0].number;
        demand(
          count < (demoOnly ? demoLimits.builds : 100),
          400,
          demoOnly
            ? "This demo has reached its build limit. Reset it to try again."
            : "This prototype supports up to 100 builds per workspace.",
        );
        return (
          await db.query(
            "INSERT INTO builds(id,project_id,name,sequence,token) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,sequence,token",
            [randomUUID(), s.projectId, name, count + 1, token()],
          )
        ).rows[0];
      });
      return json(build, 201);
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if ((e as { code?: string }).code === "23505")
      return json({ error: "A build with that name already exists." }, 409);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
export const GET = handler;
export const POST = handler;
