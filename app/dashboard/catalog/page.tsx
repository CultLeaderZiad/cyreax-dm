"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

export default function CatalogPage() {
  const products = useSWR("/api/catalog", fetcher)
  const orders = useSWR("/api/orders", fetcher)
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [csv, setCsv] = useState("name,price,currency,sku\nSerum,450,EGP,serum-1")
  const [note, setNote] = useState("")

  async function addProduct() {
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, priceCents: Math.round(Number(price || 0) * 100), currency: "EGP" }),
    })
    const json = await response.json()
    setNote(response.ok ? "Product saved" : json.error || "Save failed")
    if (response.ok) products.mutate()
  }

  async function importCsv() {
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    })
    const json = await response.json()
    setNote(response.ok ? `Imported ${json.imported}` : json.error || "Import failed")
    if (response.ok) products.mutate()
  }

  async function sync(kind: "shopify" | "woocommerce") {
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync: kind }),
    })
    const json = await response.json()
    setNote(response.ok ? `Synced ${json.imported}` : json.error || "Sync failed")
    if (response.ok) products.mutate()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Catalog</h1>
        <p className="text-sm text-neutral-400 mt-1">Products become cards in a flow. Orders can take a Paymob or Stripe link.</p>
      </div>
      {products.data?.migration_required && <p className="text-sm text-amber-200/90">Run the phase 6 SQL migration before products can be stored.</p>}
      {note && <p className="text-sm text-neutral-300">{note}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-white/10 rounded-2xl p-4 space-y-2">
          <h2 className="text-sm text-white">Manual product</h2>
          <input className={field} placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <input className={field} placeholder="Price" value={price} onChange={(event) => setPrice(event.target.value)} />
          <button type="button" className={button} onClick={addProduct}>Save</button>
        </div>
        <div className="border border-white/10 rounded-2xl p-4 space-y-2">
          <h2 className="text-sm text-white">CSV import</h2>
          <textarea className={field} rows={4} value={csv} onChange={(event) => setCsv(event.target.value)} />
          <button type="button" className={button} onClick={importCsv}>Import</button>
          <div className="flex gap-2">
            <button type="button" className={ghost} onClick={() => sync("shopify")}>Sync Shopify</button>
            <button type="button" className={ghost} onClick={() => sync("woocommerce")}>Sync WooCommerce</button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border border-white/10 rounded-2xl">
        <table className="w-full text-sm text-start">
          <thead className="text-neutral-500 text-xs uppercase"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Source</th></tr></thead>
          <tbody>
            {(products.data?.products || []).map((product: { id: string; name: string; price_cents: number; currency: string; source: string }) => (
              <tr key={product.id} className="border-t border-white/5 text-neutral-200">
                <td className="px-4 py-3 text-white">{product.name}</td>
                <td className="px-4 py-3">{(product.price_cents / 100).toFixed(2)} {product.currency}</td>
                <td className="px-4 py-3">{product.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto border border-white/10 rounded-2xl">
        <h2 className="text-sm text-white px-4 py-3">Orders</h2>
        <table className="w-full text-sm text-start">
          <tbody>
            {(orders.data?.orders || []).map((order: { id: string; status: string; total_cents: number; currency: string; payment_link?: string }) => (
              <tr key={order.id} className="border-t border-white/5 text-neutral-200">
                <td className="px-4 py-3">{order.status}</td>
                <td className="px-4 py-3">{(order.total_cents / 100).toFixed(2)} {order.currency}</td>
                <td className="px-4 py-3">{order.payment_link ? <a className="underline" href={order.payment_link}>Payment link</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const field = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
const button = "text-sm px-3 py-2 rounded-lg bg-white text-black font-medium"
const ghost = "text-sm px-3 py-2 rounded-lg border border-white/10 text-neutral-200"
