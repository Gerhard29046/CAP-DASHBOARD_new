import { jsPDF } from "jspdf";
import capLogoUrl from "@/assets/cap-certificate-logo.jpg";

// Service Certificate PDF builder (Batch A of the certificate/email workflow, 2026-08-17).
// Pure-ish: takes plain data + already-resolved image URLs (logo asset URL, signed Storage
// URLs for photos) and returns a PDF Blob. Does NOT fetch anything from Supabase itself --
// the caller (ServiceRecords.jsx) is responsible for resolving signed photo URLs first (via
// getRecordPhotoSignedUrl(), the existing record-photo helper) and passing them in, keeping
// this file's only dependency the DOM Image/canvas APIs used for image loading/downscaling.
//
// Uses ONLY fields that actually exist on the real CAP data model (service_records/machines/
// clients/company_settings, per 0001_initial_schema.sql + later ALTERs) -- no invented
// fields, no fake placeholder values. Any missing optional field's line is omitted entirely
// rather than printed as "N/A" or similar, matching the explicit "do not invent fields or
// populate unavailable information with fake data" instruction.

const BRAND_GREEN = [0, 66, 37]; // #004225, matches Login.jsx's own CAP branding color
const MUTED_GRAY = [110, 110, 110];
const PAGE_MARGIN = 16; // mm
const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// Downscales/recompresses an already-loaded image to a JPEG data URL, so the PDF never
// embeds a full-resolution phone-camera photo (Phase 3: "Do not overload the certificate
// with huge images. Resize/compress appropriately"). JPEG has no alpha channel, so the
// image is flattened onto a white background first (relevant for any PNG source).
function downscaleToJpegDataUrl(img, maxDim = 1100, quality = 0.72) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width: w, height: h };
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`;
}

// Ensures `neededHeight` mm of vertical space remains on the current page below `y`; adds a
// new page and resets to the top margin if not. Every section-rendering helper below calls
// this before drawing, which is how "handle multiple pages cleanly" / "no cut-off text or
// overlapping sections" is actually achieved rather than just hoped for.
function ensureSpace(doc, y, neededHeight) {
  if (y + neededHeight > PAGE_HEIGHT - PAGE_MARGIN - 12) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function sectionHeading(doc, y, title) {
  y = ensureSpace(doc, y, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(title, PAGE_MARGIN, y);
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.4);
  doc.line(PAGE_MARGIN, y + 1.5, PAGE_MARGIN + CONTENT_WIDTH, y + 1.5);
  return y + 8;
}

function fieldRow(doc, y, label, value) {
  if (!value) return y;
  y = ensureSpace(doc, y, 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED_GRAY);
  doc.text(label, PAGE_MARGIN, y);
  doc.setTextColor(20, 20, 20);
  doc.text(String(value), PAGE_MARGIN + 48, y);
  return y + 6;
}

function paragraphBlock(doc, y, title, value) {
  const text = (value || "").trim();
  if (!text) return y;
  y = ensureSpace(doc, y, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text(title, PAGE_MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  for (const line of lines) {
    y = ensureSpace(doc, y, 5.2);
    doc.text(line, PAGE_MARGIN, y);
    y += 5.2;
  }
  return y + 3;
}

/**
 * Builds the certificate PDF.
 * @param {object} params
 * @param {string} params.certificateNumber
 * @param {object} params.serviceRecord - service_records row (service_date, technician_name,
 *   work_performed, findings, notes, next_service_due, status)
 * @param {object} params.machine - machines row (brand, model, serial_number, machine_type,
 *   refrigerant_type)
 * @param {object} params.client - clients row (company_name, contact_person, email, phone,
 *   address)
 * @param {object} params.company - company_settings row (company_name, address, phone,
 *   email, vat_number)
 * @param {string[]} params.photoUrls - already-resolved signed URLs for
 *   serviceRecord.photos, only used if includePhotos is true
 * @param {boolean} params.includePhotos
 * @param {Date} params.generatedAt
 * @returns {Promise<Blob>}
 */
export async function buildServiceCertificatePdf({
  certificateNumber,
  serviceRecord,
  machine,
  client,
  company,
  photoUrls = [],
  includePhotos = true,
  generatedAt = new Date(),
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = PAGE_MARGIN;

  // --- Header: logo + company details -------------------------------------------------
  try {
    const logoImg = await loadImage(capLogoUrl);
    const logoWidthMm = 34;
    const logoHeightMm = logoWidthMm * (logoImg.naturalHeight / logoImg.naturalWidth);
    doc.addImage(logoImg, "JPEG", PAGE_MARGIN, y, logoWidthMm, logoHeightMm);
  } catch {
    // Logo failed to load (e.g. offline) -- certificate still generates, just without the
    // image. Never block certificate generation on a decorative asset failing.
  }

  const companyLines = [
    company?.company_name,
    company?.address,
    company?.phone,
    company?.email,
    company?.vat_number ? `VAT: ${company.vat_number}` : null,
  ].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  companyLines.forEach((line, i) => {
    doc.text(line, PAGE_MARGIN + CONTENT_WIDTH, y + 3 + i * 4, { align: "right" });
  });

  y += 26;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  y += 10;

  // --- Title ----------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("Certificate of Service", PAGE_MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED_GRAY);
  doc.text("CAP Service Certificate", PAGE_MARGIN, y);
  y += 10;

  // --- Certificate info row ---------------------------------------------------------------
  y = fieldRow(doc, y, "Certificate Number", certificateNumber);
  y = fieldRow(doc, y, "Service Date", formatDate(serviceRecord?.service_date));
  y = fieldRow(doc, y, "Technician", serviceRecord?.technician_name);
  y = fieldRow(doc, y, "Certificate Generated", formatDateTime(generatedAt));
  y += 4;

  // --- Client -----------------------------------------------------------------------------
  y = sectionHeading(doc, y, "Client");
  y = fieldRow(doc, y, "Company", client?.company_name);
  y = fieldRow(doc, y, "Contact Person", client?.contact_person);
  y = fieldRow(doc, y, "Email", client?.email);
  y = fieldRow(doc, y, "Phone", client?.phone);
  y = fieldRow(doc, y, "Address", client?.address);
  y += 4;

  // --- Machine ----------------------------------------------------------------------------
  y = sectionHeading(doc, y, "Machine");
  y = fieldRow(doc, y, "Machine", [machine?.brand, machine?.model].filter(Boolean).join(" ") || null);
  y = fieldRow(doc, y, "Type", machine?.machine_type);
  y = fieldRow(doc, y, "Serial Number", machine?.serial_number);
  y = fieldRow(doc, y, "Refrigerant", machine?.refrigerant_type);
  y += 4;

  // --- Service performed --------------------------------------------------------------
  y = sectionHeading(doc, y, "Service Performed");
  y = paragraphBlock(doc, y, "Work Performed", serviceRecord?.work_performed);
  y = paragraphBlock(doc, y, "Findings", serviceRecord?.findings);
  y = paragraphBlock(doc, y, "Recommendations", serviceRecord?.notes);
  y = fieldRow(doc, y, "Next Service Due", formatDate(serviceRecord?.next_service_due));
  y += 4;

  // --- Certification statement ---------------------------------------------------------
  // Deliberately conservative wording -- states only what CAP actually recorded, no
  // unsupported claims ("fully compliant" / "guaranteed" / "certified safe" / "manufacturer
  // approved" are explicitly NOT used here per the spec).
  const clientLabel = client?.company_name || "the client";
  const machineLabel = [machine?.brand, machine?.model].filter(Boolean).join(" ") || "the equipment";
  const serviceDateLabel = formatDate(serviceRecord?.service_date) || "the recorded service date";
  const statement = `This document certifies that ${machineLabel}, identified above, was inspected and serviced by ${company?.company_name || "CAP"} on ${serviceDateLabel} on behalf of ${clientLabel}, in accordance with the service work recorded on this service record.`;
  y = ensureSpace(doc, y, 26);
  doc.setDrawColor(...BRAND_GREEN);
  doc.setFillColor(245, 248, 246);
  const statementLines = doc.splitTextToSize(statement, CONTENT_WIDTH - 10);
  const statementHeight = statementLines.length * 5.2 + 8;
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, statementHeight, 2, 2, "FD");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  statementLines.forEach((line, i) => doc.text(line, PAGE_MARGIN + 5, y + 6 + i * 5.2));
  y += statementHeight + 8;

  // --- Photos (optional) -----------------------------------------------------------------
  if (includePhotos && photoUrls.length > 0) {
    y = sectionHeading(doc, y, "Service Documentation");
    const cols = 2;
    const gap = 6;
    const cellWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
    const cellHeight = 55;
    let col = 0;
    for (const url of photoUrls) {
      if (col === 0) y = ensureSpace(doc, y, cellHeight + gap);
      const x = PAGE_MARGIN + col * (cellWidth + gap);
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential is fine here; photo count
        // per service record is small (a handful), and jsPDF's own addImage calls are
        // synchronous once the data URL is ready, so parallelizing loads buys little.
        const img = await loadImage(url);
        const { dataUrl, width, height } = downscaleToJpegDataUrl(img);
        const aspect = width / height;
        let drawW = cellWidth;
        let drawH = drawW / aspect;
        if (drawH > cellHeight) { drawH = cellHeight; drawW = drawH * aspect; }
        const offsetX = x + (cellWidth - drawW) / 2;
        doc.setDrawColor(220, 220, 220);
        doc.rect(x, y, cellWidth, cellHeight);
        doc.addImage(dataUrl, "JPEG", offsetX, y + (cellHeight - drawH) / 2, drawW, drawH);
      } catch {
        // A single failed photo (network hiccup, expired signed URL, etc.) must not abort
        // certificate generation -- draw an empty placeholder box and move on.
        doc.setDrawColor(220, 220, 220);
        doc.rect(x, y, cellWidth, cellHeight);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED_GRAY);
        doc.text("Photo unavailable", x + cellWidth / 2, y + cellHeight / 2, { align: "center" });
      }
      col = (col + 1) % cols;
      if (col === 0) y += cellHeight + gap;
    }
    if (col !== 0) y += cellHeight + gap;
  }

  // --- Footer on every page -------------------------------------------------------------
  // NOTE: `doc.getNumberOfPages()` (top-level), not `doc.internal.getNumberOfPages()` --
  // confirmed against jsPDF 4.2.1's own type definitions (node_modules/jspdf/types/index.d.ts);
  // `internal` does not expose that method, only `pages`/`pageSize`/etc.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN, PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_GRAY);
    doc.text(
      `${company?.company_name || "CAP"} · ${certificateNumber} · Page ${i} of ${pageCount}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - PAGE_MARGIN + 5,
      { align: "center" },
    );
  }

  return doc.output("blob");
}
