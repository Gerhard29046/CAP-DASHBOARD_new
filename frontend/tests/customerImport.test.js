import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guessMapping, normalizeRow, normalizeEmail, normalizePhone, validateRow, classifyRow, buildPreview,
  buildUpdatePayload,
} from "../src/lib/customerImport.js";

test("guessMapping pre-selects obvious header matches", () => {
  const headers = ["Customer Name", "Contact Person", "Telephone", "Email", "Random Column"];
  const mapping = guessMapping(headers);
  assert.equal(mapping["Customer Name"], "company_name");
  assert.equal(mapping["Contact Person"], "contact_person");
  assert.equal(mapping["Telephone"], "phone");
  assert.equal(mapping["Email"], "email");
  assert.equal(mapping["Random Column"], null);
});

test("normalizeRow trims and lower-cases email, preserves other legitimate text", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const row = normalizeRow({ "Customer Name": "  ABC Refrigeration  ", "Email": "  CUSTOMER@EXAMPLE.COM " }, mapping);
  assert.equal(row.company_name, "ABC Refrigeration");
  assert.equal(row.email, "customer@example.com");
});

test("normalizeRow appends unmapped-but-kept columns into notes, labelled", () => {
  const mapping = { "Customer Name": "company_name", "Some Extra Column": null };
  const row = normalizeRow({ "Customer Name": "ABC", "Some Extra Column": "keep me" }, mapping, ["Some Extra Column"]);
  assert.equal(row.notes, "Some Extra Column: keep me");
});

test("normalizeRow routes named notes-appendix fields (mobile/postal_address/vat_number) into labelled notes lines, not their own column", () => {
  const mapping = { "Customer Name": "company_name", "VAT Reg No": "vat_number", "Cell": "mobile", "Postal Addr": "postal_address" };
  const row = normalizeRow({
    "Customer Name": "ABC", "VAT Reg No": "4123456789", "Cell": "082 555 1234", "Postal Addr": "PO Box 1, Cape Town",
  }, mapping);
  assert.equal(row.vat_number, undefined);
  assert.equal(row.mobile, undefined);
  assert.equal(row.postal_address, undefined);
  assert.match(row.notes, /VAT Number: 4123456789/);
  assert.match(row.notes, /Mobile: 082 555 1234/);
  assert.match(row.notes, /Postal Address: PO Box 1, Cape Town/);
});

test("guessMapping distinguishes phone (landline) from mobile from postal_address from vat_number", () => {
  const headers = ["Telephone", "Mobile", "Postal Address", "VAT Number"];
  const mapping = guessMapping(headers);
  assert.equal(mapping["Telephone"], "phone");
  assert.equal(mapping["Mobile"], "mobile");
  assert.equal(mapping["Postal Address"], "postal_address");
  assert.equal(mapping["VAT Number"], "vat_number");
});

test("normalizePhone strips formatting so equivalent numbers compare equal", () => {
  assert.equal(normalizePhone("+27 21 123 4567"), normalizePhone("0211234567"));
});

test("validateRow flags missing company name as required", () => {
  assert.deepEqual(validateRow({ company_name: "" }), ["Missing customer/company name"]);
  assert.deepEqual(validateRow({ company_name: "ABC" }), []);
});

test("classifyRow: no existing clients -> always new", () => {
  const result = classifyRow({ company_name: "ABC Refrigeration" }, []);
  assert.equal(result.status, "new");
});

test("classifyRow: matching legacy_pastel_customer_code -> exact_match", () => {
  const existing = [{ id: "1", company_name: "ABC Refrigeration", legacy_pastel_customer_code: "C001" }];
  const result = classifyRow({ company_name: "ABC Refrigeration (Pty) Ltd", legacy_pastel_customer_code: "C001" }, existing);
  assert.equal(result.status, "exact_match");
  assert.equal(result.matchId, "1");
});

test("classifyRow: matching email -> exact_match even with different name casing", () => {
  const existing = [{ id: "2", company_name: "XYZ Air Con", email: "info@xyz.co.za" }];
  const result = classifyRow({ company_name: "XYZ Aircon", email: "INFO@XYZ.CO.ZA" }, existing);
  assert.equal(result.status, "exact_match");
});

test("classifyRow: same normalized name only -> possible_duplicate, not exact_match", () => {
  const existing = [{ id: "3", company_name: "ABC Refrigeration" }];
  const result = classifyRow({ company_name: "abc refrigeration" }, existing);
  assert.equal(result.status, "possible_duplicate");
  assert.equal(result.matchId, "3");
});

test("classifyRow: different name and no other signal -> new", () => {
  const existing = [{ id: "4", company_name: "ABC Refrigeration" }];
  const result = classifyRow({ company_name: "Totally Different Co" }, existing);
  assert.equal(result.status, "new");
});

test("buildPreview: end-to-end summary counts match a small mixed test file", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const existingClients = [{ id: "1", company_name: "Existing Client", email: "existing@example.com" }];
  const rawRows = [
    { "Customer Name": "New Customer", "Email": "new@example.com" },       // new
    { "Customer Name": "Existing Client", "Email": "existing@example.com" }, // exact_match (email)
    { "Customer Name": "", "Email": "missing-name@example.com" },          // invalid
    { "Customer Name": "existing client", "Email": "" },                  // possible_duplicate (name only)
  ];
  const { summary } = buildPreview(rawRows, mapping, existingClients);
  assert.equal(summary.total, 4);
  assert.equal(summary.new, 1);
  assert.equal(summary.exact_match, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.possible_duplicate, 1);
});

test("buildUpdatePayload only includes fields the row actually has a new value for", () => {
  const row = { company_name: "ABC Refrigeration", phone: "0211234567" };
  const payload = buildUpdatePayload(row, { notes: "Old notes" });
  assert.deepEqual(payload, { company_name: "ABC Refrigeration", phone: "0211234567" });
  assert.equal(payload.email, undefined);
  assert.equal(payload.is_active, undefined);
});

test("buildUpdatePayload appends new notes to the existing client's notes rather than overwriting", () => {
  const row = { company_name: "ABC", notes: "VAT Number: 4123456789" };
  const payload = buildUpdatePayload(row, { notes: "Technician says compressor due for service." });
  assert.match(payload.notes, /Technician says compressor due for service\./);
  assert.match(payload.notes, /VAT Number: 4123456789/);
  // Original notes must appear BEFORE the appended block, never replaced.
  assert.ok(payload.notes.indexOf("Technician says") < payload.notes.indexOf("VAT Number"));
});

test("buildUpdatePayload with no existing notes just uses the new notes, no leading blank stamp text", () => {
  const row = { company_name: "ABC", notes: "Cell: 0825551234" };
  const payload = buildUpdatePayload(row, { notes: "" });
  assert.match(payload.notes, /Cell: 0825551234/);
});

test("buildUpdatePayload never includes notes when the row has none", () => {
  const row = { company_name: "ABC" };
  const payload = buildUpdatePayload(row, { notes: "Existing notes stay untouched" });
  assert.equal(payload.notes, undefined);
});
