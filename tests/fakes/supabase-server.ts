/**
 * In-memory stand-in for lib/supabase-server.ts, loaded only by
 * tests/register-fake-db.mjs. Supports the PostgREST subset the tenant
 * routes use: select/insert/update/delete/upsert with eq/neq/in/is/gt/gte/
 * lt/lte, order, limit, range, single, maybeSingle, count/head.
 * Embedded selects (`rel(...)`) return an error so callers take their
 * plain-select fallback.
 */
type Row = Record<string, any>
type Filter = (row: Row) => boolean

export interface FakeState {
  tables: Record<string, Row[]>
  authUserId: string | null
}

const state: FakeState = ((globalThis as any).__cyreaxFakeDb ||= { tables: {}, authUserId: null })

export function fakeDb(): FakeState {
  return state
}

function table(name: string): Row[] {
  return (state.tables[name] ||= [])
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = []
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
  private payload: any = null
  private returning = false
  private mode: "many" | "single" | "maybe" = "many"
  private orderBy: { col: string; asc: boolean } | null = null
  private max: number | null = null
  private head = false
  private wantCount = false
  private embedded = false

  private name: string
  constructor(name: string) {
    this.name = name
  }

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") this.embedded = /\w\(/.test(cols)
    else this.returning = true
    this.head = Boolean(opts.head)
    this.wantCount = Boolean(opts.count)
    return this
  }
  insert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this }
  upsert(values: Row | Row[]) { this.op = "upsert"; this.payload = values; return this }
  update(values: Row) { this.op = "update"; this.payload = values; return this }
  delete() { this.op = "delete"; return this }
  eq(c: string, v: any) { this.filters.push((r) => String(r[c]) === String(v)); return this }
  neq(c: string, v: any) { this.filters.push((r) => String(r[c]) !== String(v)); return this }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.map(String).includes(String(r[c]))); return this }
  is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this }
  ilike() { return this }
  not() { return this }
  or() { this.filters.push(() => false); return this }
  order(col: string, o: { ascending?: boolean } = {}) { this.orderBy = { col, asc: o.ascending !== false }; return this }
  limit(n: number) { this.max = n; return this }
  range(from: number, to: number) { this.max = to - from + 1; return this }
  single() { this.mode = "single"; return this }
  maybeSingle() { this.mode = "maybe"; return this }

  private run(): { data: any; error: any; count?: number } {
    const rows = table(this.name)
    const match = (r: Row) => this.filters.every((f) => f(r))
    let out: Row[]
    if (this.op === "select") {
      if (this.embedded) return { data: null, error: { code: "PGRST200", message: "embedding unsupported in fake" } }
      out = rows.filter(match)
    } else if (this.op === "insert" || this.op === "upsert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: r.id ?? crypto.randomUUID(), ...r }))
      rows.push(...list)
      out = list
    } else if (this.op === "update") {
      out = rows.filter(match)
      for (const r of out) Object.assign(r, this.payload)
    } else {
      out = rows.filter(match)
      state.tables[this.name] = rows.filter((r) => !match(r))
    }
    if (this.op !== "select" && !this.returning && this.mode === "many") return { data: null, error: null }
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1))
    }
    if (this.max != null) out = out.slice(0, this.max)
    const copy = out.map((r) => ({ ...r }))
    if (this.mode === "single") {
      if (copy.length !== 1) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
      return { data: copy[0], error: null }
    }
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null }
    return { data: this.head ? null : copy, error: null, count: this.wantCount ? copy.length : undefined }
  }

  then<A, B>(ok?: (v: any) => A | PromiseLike<A>, fail?: (e: any) => B | PromiseLike<B>) {
    return Promise.resolve().then(() => this.run()).then(ok, fail)
  }
}

const client = {
  from: (name: string) => new Query(name),
  rpc: async () => ({ data: true, error: null }),
  auth: {
    getUser: async () =>
      state.authUserId
        ? { data: { user: { id: state.authUserId, email: `${state.authUserId}@test.local` } }, error: null }
        : { data: { user: null }, error: { message: "no session" } },
    getSession: async () => ({ data: { session: null }, error: null }),
  },
}

export async function getSupabaseServerClient() {
  return client as any
}

export async function getSupabaseBypassClient() {
  return client as any
}
