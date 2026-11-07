import { mapShopifyProduct, mapWooProduct, type ProductInput } from "@/lib/commerce/catalog"
import type { FetchLike } from "@/lib/channels/types"
import { isSafeWebhookUrl } from "@/lib/flows/graph"

export async function fetchShopifyProducts(shop: string, token: string, fetchImpl: FetchLike = fetch): Promise<ProductInput[]> {
  const host = shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
  // A bare public hostname only: no path, port, credentials or private ranges.
  if (!/^[a-z0-9.-]+$/i.test(host) || !isSafeWebhookUrl(`https://${host}/`)) {
    throw new Error("Shopify store must be a public https hostname, for example your-store.myshopify.com")
  }
  const response = await fetchImpl(`https://${host}/admin/api/2024-10/products.json?limit=50`, {
    headers: { "X-Shopify-Access-Token": token },
  })
  const json = await (response as Response).json().catch(() => null)
  if (!response.ok) throw new Error(json?.errors || "Shopify sync failed")
  return (json?.products || []).map(mapShopifyProduct).filter(Boolean) as ProductInput[]
}

export async function fetchWooProducts(site: string, key: string, secret: string, fetchImpl: FetchLike = fetch): Promise<ProductInput[]> {
  const base = site.trim().replace(/\/$/, "")
  // The consumer secret travels in the query string, so https on a public host only.
  if (!isSafeWebhookUrl(base)) throw new Error("WooCommerce site must be an https URL on a public host")
  const url = `${base}/wp-json/wc/v3/products?per_page=50&consumer_key=${encodeURIComponent(key)}&consumer_secret=${encodeURIComponent(secret)}`
  const response = await fetchImpl(url)
  const json = await (response as Response).json().catch(() => null)
  if (!response.ok || !Array.isArray(json)) throw new Error("WooCommerce sync failed")
  return json.map(mapWooProduct).filter(Boolean) as ProductInput[]
}
