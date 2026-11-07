import { PROOF_TYPES, type ProofExt } from "@/lib/billing/manual-payments"

/**
 * Decode and re-encode an uploaded proof with sharp (already shipped with
 * Next for image optimisation). Re-encoding proves the file really is an
 * image, drops EXIF/GPS and any appended payload, and applies the camera
 * orientation. Throws on anything sharp can't decode.
 */
export async function sanitizeProofImage(bytes: Uint8Array, ext: ProofExt): Promise<{ bytes: Buffer; ext: ProofExt; contentType: string }> {
  const { default: sharp } = await import("sharp")
  const pipeline = sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000, failOn: "error" }).rotate()
  const out =
    ext === "png" ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : ext === "webp" ? await pipeline.webp({ quality: 85 }).toBuffer()
    : await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  return { bytes: out, ext, contentType: PROOF_TYPES[ext] }
}
