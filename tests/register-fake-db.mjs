import { register } from "node:module"

// Same alias loader as tests/register.mjs, plus @/lib/supabase-server -> in-memory fake.
register("./fake-db-loader.mjs", import.meta.url)
