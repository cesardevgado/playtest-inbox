import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import { seed, issues, event, ready, retest } from "@/lib/service";
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
function signed(s: Session) {
  const res = json({ ok: true });
  res.cookies.set("pi_session", sign(s), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return res;
}
async function handler(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace(/^\/api\//, "");
    const s = session(req);
    if (req.method === "GET") {
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
    const expected = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
    demand(origin === expected, 403, "Request origin is not allowed.");
    demand(
      req.headers.get("content-type")?.includes("application/json"),
      415,
      "Send JSON.",
    );
    const raw = await req.text();
    demand(Buffer.byteLength(raw) < 16000, 413, "Report is too large.");
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
      await query(
        "DELETE FROM projects WHERE mode='demo' AND created_at < now() - interval '24 hours'",
      );
      const id = randomUUID();
      await seed(id, "demo");
      return signed({
        projectId: id,
        mode: "demo",
        expires: Date.now() + 8 * 3600000,
      });
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
        httpOnly: true,
        sameSite: "strict",
      });
      return res;
    }
    if (path === "issues") {
      const buildToken = field(data.buildToken, "Build link", 100);
      throttle("report:" + buildToken, 15);
      const b = (
        await query("SELECT id,project_id FROM builds WHERE token=$1", [
          buildToken,
        ])
      )[0];
      demand(b, 404, "Feedback link not found.");
      const title = field(data.title, "Title", 140),
        steps = field(data.steps, "Steps"),
        expected = field(data.expected, "Expected behavior"),
        actual = field(data.actual, "Actual behavior");
      const id = randomUUID(),
        rt = token();
      await transaction(async (db) => {
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
      return json({ id, reportToken: rt }, 201);
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
        typeof data.reportToken === "string" || s?.mode === "demo",
        401,
        "Use your private ticket link to submit a retest.",
      );
      await retest(
        retestMatch[1],
        data.outcome,
        field(data.note, "Retest note"),
        typeof data.reportToken === "string" ? data.reportToken : undefined,
        s?.mode === "demo" ? s.projectId : undefined,
      );
      return json({ ok: true });
    }
    if (path === "builds") {
      demand(s, 401, "Sign in to create a build.");
      const name = field(data.name, "Build name", 80);
      const build = await transaction(async (db) => {
        await db.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [
          s.projectId,
        ]);
        const count = (
          await db.query(
            "SELECT COALESCE(MAX(sequence),0)::int AS number FROM builds WHERE project_id=$1",
            [s.projectId],
          )
        ).rows[0].number;
        demand(
          count < 100,
          400,
          "This prototype supports up to 100 builds per workspace.",
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
