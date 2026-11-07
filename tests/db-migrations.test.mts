/**
 * Applies this repo's security/payment migrations to a throwaway database on
 * a real Postgres (with a minimal Supabase shim) and runs the behavioural SQL
 * checks in tests/sql/payments-and-rls.test.sql.
 *
 * Needs CYREAX_TEST_PG = a postgres superuser URL, e.g.
 *   postgresql://postgres:postgres@localhost:5432/postgres
 * Skipped when unset (CI's "db" job sets it).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { execFileSync } from "node:child_process"

const MIGRATIONS = [
  "supabase/migrations/20261107120000_security_app_settings_rls.sql",
  "supabase/migrations/20261107120100_security_rls_gaps_and_storage.sql",
  "supabase/migrations/20261107120200_outbound_sends.sql",
  "supabase/migrations/20261107120300_manual_wallet_payments.sql",
]

const base = process.env.CYREAX_TEST_PG

function psql(url: string, args: string[]) {
  return execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", url, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

describe("database migrations and payment review (real Postgres)", { skip: base ? false : "CYREAX_TEST_PG not set" }, () => {
  it("migrations apply twice and all behavioural checks pass", () => {
    const db = `cyreax_test_${process.pid}`
    psql(base!, ["-c", `DROP DATABASE IF EXISTS ${db}`, "-c", `CREATE DATABASE ${db}`])
    const url = base!.replace(/\/[^/?]*(\?|$)/, `/${db}$1`)
    try {
      psql(url, ["-f", "tests/sql/supabase-shim.sql"])
      for (const file of [...MIGRATIONS, ...MIGRATIONS]) psql(url, ["-f", file])
      const out = psql(url, ["-f", "tests/sql/payments-and-rls.test.sql"])
      assert.match(out, /ALL DB CHECKS PASSED/)
    } finally {
      psql(base!, ["-c", `DROP DATABASE IF EXISTS ${db}`])
    }
  })
})
