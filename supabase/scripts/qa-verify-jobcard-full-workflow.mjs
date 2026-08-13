#!/usr/bin/env node
// Full Job -> Client -> Machine -> Services/Products -> Invoice workflow QA (2026-08-13,
// item 3 of the continued redesign). Persistence-after-refresh is the actual bar, not
// "the button works" -- every step re-fetches from Supabase exactly as the real pages do
// before asserting, simulating a browser refresh. Creates + fully cleans up throwaway data.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      env[t.slice(0, i)] = t.slice(i + 1);
    }
  } catch { /* no .env */ }
  return env;
}
const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const admin = createClient(process.env.SUPABASE_URL || fileEnv.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
const record = (name, pass, detail = "") => { results.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`); };

async function refetchLines(jobCardId) {
  // Mirrors JobCardDetail.jsx's fixed load(): explicit filter, not relying on embedding.
  const { data } = await admin.from("job_card_lines").select("*").eq("job_card_id", jobCardId);
  return data;
}

const { data: client } = await admin.from("clients").insert({ company_name: "QA Full Workflow Client (delete me)" }).select().single();
const { data: machine } = await admin.from("machines").insert({ client_id: client.id, brand: "QA", model: "Workflow Unit" }).select().single();
const { data: job } = await admin.from("job_cards").insert({ client_id: client.id, machine_id: machine.id, status: "Open", job_number: "JOB-QA-WORKFLOW" }).select().single();
const { data: catalogProduct } = await admin.from("products_services").insert({ type: "product", name: "QA Compressor", unit_price: 1500 }).select().single();
const { data: catalogService } = await admin.from("products_services").insert({ type: "service", name: "QA Diagnostic Labour", unit_price: 350 }).select().single();

// 1. Open job (already have it), add a service
const { error: addServiceErr } = await admin.from("job_card_lines").insert({
  job_card_id: job.id, line_type: "Labour", description: "QA Diagnostic Labour", quantity: 1, unit_price: 350, line_total: 350, catalog_item_id: catalogService.id,
});
record("Add service line", !addServiceErr, addServiceErr?.message);

// 2. Add a product
const { data: productLine, error: addProductErr } = await admin.from("job_card_lines").insert({
  job_card_id: job.id, line_type: "Part / Product", description: "QA Compressor", quantity: 1, unit_price: 1500, line_total: 1500, catalog_item_id: catalogProduct.id,
}).select().single();
record("Add product line", !addProductErr, addProductErr?.message);

// 3. "Refresh" -- refetch exactly as the page would
let lines = await refetchLines(job.id);
record("Both items exist after refresh", lines.length === 2, `got ${lines.length}`);

// 4. Confirm invoice calculation (InvoiceQueue.jsx's exact formula: sum(qty*unit_price), 15% VAT)
const subtotal = lines.reduce((sum, l) => sum + (l.quantity || 1) * (l.unit_price || 0), 0);
const vat = subtotal * 0.15;
const total = subtotal * 1.15;
record("Invoice subtotal correct (350 + 1500 = 1850)", subtotal === 1850, `got ${subtotal}`);
record("Invoice VAT correct (15%)", Math.abs(vat - 277.5) < 0.001, `got ${vat}`);
record("Invoice total incl. VAT correct", Math.abs(total - 2127.5) < 0.001, `got ${total}`);

// 5. Edit an item (mirrors the new AddLineForm edit-mode -> handleEditLine)
const { error: editErr } = await admin.from("job_card_lines").update({
  quantity: 2, unit_price: 1500, line_total: 3000,
}).eq("id", productLine.id);
record("Edit line item (quantity 1 -> 2)", !editErr, editErr?.message);

lines = await refetchLines(job.id);
const editedLine = lines.find((l) => l.id === productLine.id);
record("Edit persists after refresh", editedLine?.quantity === 2 && Number(editedLine?.line_total) === 3000, `qty=${editedLine?.quantity} total=${editedLine?.line_total}`);

const subtotalAfterEdit = lines.reduce((sum, l) => sum + (l.quantity || 1) * (l.unit_price || 0), 0);
record("Invoice recalculates after edit (350 + 3000 = 3350)", subtotalAfterEdit === 3350, `got ${subtotalAfterEdit}`);

// 6. Remove an item
const serviceLine = lines.find((l) => l.description === "QA Diagnostic Labour");
await admin.from("job_card_lines").delete().eq("id", serviceLine.id);

// 7. Refresh again, confirm DB and UI (i.e. re-fetched state) agree
lines = await refetchLines(job.id);
record("Removal persists after refresh (1 line remains)", lines.length === 1, `got ${lines.length}`);
record("Remaining line is the edited product, not the removed service", lines[0]?.id === productLine.id);

const finalSubtotal = lines.reduce((sum, l) => sum + (l.quantity || 1) * (l.unit_price || 0), 0);
record("Final invoice total correct after removal (3000)", finalSubtotal === 3000, `got ${finalSubtotal}`);

// 8. Historical price integrity: editing the catalogue item must NOT change the already-saved line
await admin.from("products_services").update({ unit_price: 9999 }).eq("id", catalogProduct.id);
lines = await refetchLines(job.id);
record("Line item price unaffected by later catalogue price change (accounting integrity)", Number(lines[0]?.unit_price) === 1500, `line unit_price=${lines[0]?.unit_price}`);

// Cleanup
await admin.from("job_card_lines").delete().eq("job_card_id", job.id);
await admin.from("job_cards").delete().eq("id", job.id);
await admin.from("machines").delete().eq("id", machine.id);
await admin.from("clients").delete().eq("id", client.id);
await admin.from("products_services").delete().in("id", [catalogProduct.id, catalogService.id]);
console.log("\nCleanup complete.");

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
