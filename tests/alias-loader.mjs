import path from "node:path"
import fs from "node:fs"
import { pathToFileURL, fileURLToPath } from "node:url"

export function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return nextResolve(pathToFileURL(path.join(process.cwd(), "node_modules/next/headers.js")).href, context)
  }

  if (specifier.startsWith("@/")) {
    let relativePath = specifier.slice(2)
    if (!path.extname(relativePath)) {
      if (fs.existsSync(path.join(process.cwd(), relativePath + ".ts"))) {
        relativePath += ".ts"
      } else if (fs.existsSync(path.join(process.cwd(), relativePath + ".tsx"))) {
        relativePath += ".tsx"
      } else if (fs.existsSync(path.join(process.cwd(), relativePath, "index.ts"))) {
        relativePath = path.join(relativePath, "index.ts")
      }
    }
    return nextResolve(pathToFileURL(path.join(process.cwd(), relativePath)).href, context)
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL &&
    !path.extname(specifier)
  ) {
    try {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const targetPath = path.resolve(parentDir, specifier)
      if (fs.existsSync(targetPath + ".ts")) {
        return nextResolve(pathToFileURL(targetPath + ".ts").href, context)
      } else if (fs.existsSync(targetPath + ".tsx")) {
        return nextResolve(pathToFileURL(targetPath + ".tsx").href, context)
      } else if (fs.existsSync(path.join(targetPath, "index.ts"))) {
        return nextResolve(pathToFileURL(path.join(targetPath, "index.ts")).href, context)
      }
    } catch {}
  }

  return nextResolve(specifier, context)
}
