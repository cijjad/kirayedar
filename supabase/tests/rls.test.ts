/**
 * Row-level-security tests against a real Postgres.
 *   RLS_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:rls
 * Creates a throwaway database, applies the Supabase stub + all migrations,
 * then acts as different users exactly the way PostgREST does
 * (SET ROLE authenticated + request.jwt.claims).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.RLS_DATABASE_URL;
const here = path.dirname(new URL(import.meta.url).pathname);
const DB = `rls_test_${process.pid}`;

const FOUNDER_A = "00000000-0000-0000-0000-00000000000a";
const FOUNDER_B = "00000000-0000-0000-0000-00000000000b";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const INVESTOR = "00000000-0000-0000-0000-0000000000e1";

let root: Client;
let db: Client;

async function as<T>(user: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${user ? "authenticated" : "anon"}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(user ? { sub: user, role: "authenticated" } : { role: "anon" }),
    ]);
    return await fn(db);
  } finally {
    await db.query("rollback");
  }
}

describe.skipIf(!ADMIN_URL)("row level security", () => {
  beforeAll(async () => {
    root = new Client({ connectionString: ADMIN_URL });
    await root.connect();
    await root.query(`drop database if exists ${DB}`);
    await root.query(`create database ${DB}`);
    const u = new URL(ADMIN_URL!);
    u.pathname = `/${DB}`;
    db = new Client({ connectionString: u.toString() });
    await db.connect();
    await db.query(readFileSync(path.join(here, "supabase_stub.sql"), "utf8"));
    const migDir = path.join(here, "..", "migrations");
    for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(path.join(migDir, f), "utf8"));
    }
    // seed (as superuser, like the service role)
    for (const id of [FOUNDER_A, FOUNDER_B, ADMIN, INVESTOR]) {
      await db.query(`insert into auth.users(id, email) values ($1::uuid, $2)`, [id, `${id}@x.test`]);
    }
    await db.query(`update public.profiles set role='admin' where id=$1`, [ADMIN]);
    await db.query(`update public.profiles set role='investor' where id=$1`, [INVESTOR]);
    for (const [founder, code] of [[FOUNDER_A, "A-1"], [FOUNDER_B, "B-1"]]) {
      const { rows } = await db.query(
        `insert into public.ideas (public_code, founder_id, title, kind, sector, stage, content,
           content_hash, consent_terms_at, consent_blind_at, admin_note)
         values ($1, $2, 'Idea ' || $1::text, 'product', 'Fintech', 'idea', '{}'::jsonb, 'h', now(), now(),
           'secret internal note') returning id`,
        [code, founder],
      );
      const ideaId = rows[0].id;
      await db.query(`insert into public.analyses (idea_id, content_hash, model, ok) values ($1,'h','m',true)`, [ideaId]);
      await db.query(`insert into public.idea_versions (idea_id, version, content, content_hash) values ($1,1,'{}','h')`, [ideaId]);
      await db.query(
        `insert into public.idea_files (idea_id, founder_id, storage_path, original_name, mime, size_bytes)
         values ($1, $2, $3, 'a.pdf', 'application/pdf', 10)`,
        [ideaId, founder, `${founder}/${code}.pdf`],
      );
      await db.query(`insert into public.admin_reviews (idea_id, admin_id, action, note) values ($1,$2,'approve','x')`, [ideaId, ADMIN]);
    }
    await db.query(`insert into public.audit_log (actor_id, action, entity) values ($1,'view','idea')`, [ADMIN]);
  });

  afterAll(async () => {
    await db?.end();
    await root?.query(`drop database if exists ${DB}`);
    await root?.end();
  });

  it("founder sees only own idea and its children", async () => {
    await as(FOUNDER_A, async (c) => {
      const ideas = await c.query("select public_code from public.ideas");
      expect(ideas.rows.map((r) => r.public_code)).toEqual(["A-1"]);
      for (const t of ["analyses", "idea_versions", "idea_files"]) {
        const r = await c.query(`select count(*)::int n from public.${t}`);
        expect(r.rows[0].n, t).toBe(1);
      }
    });
  });

  it("founder cannot read the internal admin note column", async () => {
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("select admin_note from public.ideas")).rejects.toThrow(/permission denied/);
    });
  });

  it("founder cannot write idea data directly", async () => {
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("update public.ideas set status='approved'")).rejects.toThrow(/permission denied/);
    });
    await as(FOUNDER_A, async (c) => {
      await expect(
        c.query(`insert into public.analyses (idea_id, content_hash, model, ok)
                 select id,'h','m',true from public.ideas limit 1`),
      ).rejects.toThrow(/permission denied/);
    });
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("delete from public.ideas")).rejects.toThrow(/permission denied/);
    });
  });

  it("founder cannot escalate their own role", async () => {
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("update public.profiles set role='admin' where id=$1", [FOUNDER_A])).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("founder can update own safe profile columns, but not someone else's", async () => {
    await as(FOUNDER_A, async (c) => {
      const own = await c.query("update public.profiles set full_name='A' where id=$1", [FOUNDER_A]);
      expect(own.rowCount).toBe(1);
      const other = await c.query("update public.profiles set full_name='hacked' where id=$1", [FOUNDER_B]);
      expect(other.rowCount).toBe(0);
    });
  });

  it("founder cannot read other profiles, reviews, audit log or rate limits", async () => {
    await as(FOUNDER_A, async (c) => {
      const p = await c.query("select id from public.profiles");
      expect(p.rows.map((r) => r.id)).toEqual([FOUNDER_A]);
      expect((await c.query("select count(*)::int n from public.admin_reviews")).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from public.audit_log")).rows[0].n).toBe(0);
    });
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("select * from public.rate_limits")).rejects.toThrow(/permission denied/);
    });
    await as(FOUNDER_A, async (c) => {
      await expect(c.query("select public.rate_limit_hit('x', 1, 60)")).rejects.toThrow(/permission denied/);
    });
  });

  it("investor (Phase 1) sees no ideas at all", async () => {
    await as(INVESTOR, async (c) => {
      expect((await c.query("select count(*)::int n from public.ideas")).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from public.analyses")).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from public.idea_files")).rows[0].n).toBe(0);
    });
  });

  it("anonymous users see nothing", async () => {
    await as(null, async (c) => {
      await expect(c.query("select * from public.ideas")).rejects.toThrow(/permission denied/);
    });
    await as(null, async (c) => {
      await expect(c.query("select * from public.profiles")).rejects.toThrow(/permission denied/);
    });
  });

  it("admin sees everything needed for review, including notes and audit log", async () => {
    await as(ADMIN, async (c) => {
      expect((await c.query("select count(*)::int n from public.ideas")).rows[0].n).toBe(2);
      expect((await c.query("select count(*)::int n from public.admin_reviews")).rows[0].n).toBe(2);
      expect((await c.query("select count(*)::int n from public.audit_log")).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from public.profiles")).rows[0].n).toBe(4);
    });
  });

  it("admin still cannot write through the client API (writes are server-only)", async () => {
    await as(ADMIN, async (c) => {
      await expect(c.query("update public.ideas set status='approved'")).rejects.toThrow(/permission denied/);
    });
    await as(ADMIN, async (c) => {
      await expect(c.query("insert into public.audit_log (action, entity) values ('x','y')")).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("deleting a founder's idea cascades all child rows", async () => {
    await db.query("begin");
    try {
      await db.query("delete from public.ideas where public_code='A-1'");
      for (const t of ["analyses", "idea_versions", "idea_files", "admin_reviews"]) {
        const r = await db.query(
          `select count(*)::int n from public.${t} x where not exists (select 1 from public.ideas i where i.id = x.idea_id)`,
        );
        expect(r.rows[0].n, t).toBe(0);
      }
    } finally {
      await db.query("rollback");
    }
  });

  it("rate limiter allows up to the limit then blocks", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await db.query("select public.rate_limit_hit('t:1', 3, 3600) ok");
      results.push(r.rows[0].ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});
