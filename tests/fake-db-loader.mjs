import path from "node:path"
import { pathToFileURL } from "node:url"
import { resolve as aliasResolve } from "./alias-loader.mjs"

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase-server" || /\/lib\/supabase-server(\.ts)?$/.test(specifier)) {
    return nextResolve(pathToFileURL(path.join(process.cwd(), "tests/fakes/supabase-server.ts")).href, context)
  }
  return aliasResolve(specifier, context, nextResolve)
}
