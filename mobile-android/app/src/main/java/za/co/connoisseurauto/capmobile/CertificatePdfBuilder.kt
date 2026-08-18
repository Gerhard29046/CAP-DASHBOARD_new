package com.CAPDATABASE.capdatabase

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.URL
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max

/**
 * Service Certificate PDF builder -- the Android counterpart of
 * `frontend/src/lib/serviceCertificatePdf.js`, rendering the SAME document from the SAME real
 * columns so a certificate looks like a CAP certificate whichever client produced it.
 *
 * Built on `android.graphics.pdf.PdfDocument` (part of the Android SDK since API 19) -- no PDF
 * library was added, matching this module's "plain proven techniques" bias and the explicit
 * instruction not to add a Gradle dependency.
 *
 * Pure-ish, exactly like the web version: it takes plain [CapRecord]s plus ALREADY-RESOLVED signed
 * photo URLs and returns the finished PDF as a [ByteArray]. It performs no Supabase call of its
 * own -- the caller (MainActivity.kt's `CertificateSection`) resolves the certificate row, the
 * company row and the photo signed URLs through the repositories first.
 *
 * Every value printed comes from a real column on service_records / machines / clients /
 * company_settings (0001_initial_schema.sql + 0030_service_certificates.sql). **Any blank or
 * missing optional field's line is omitted entirely** -- never printed as "N/A", "-", or any other
 * invented placeholder.
 *
 * Deliberate differences from the web builder, recorded rather than hidden:
 *  - **No logo image.** The web embeds `frontend/src/assets/cap-certificate-logo.jpg`; there is no
 *    equivalent asset anywhere in `mobile-android/`, and inventing or duplicating brand artwork is
 *    not this file's call. The header instead leads with the company name as a text wordmark, so
 *    the space is used honestly rather than left blank or filled with a placeholder graphic.
 *  - **Roboto (Android's `SANS_SERIF`) instead of Helvetica**, which is simply what the platform
 *    provides; metrics differ slightly, so line breaks will not land identically to the web PDF.
 *  - **Field values wrap** instead of running off the right edge. jsPDF's `text()` does not wrap,
 *    so a long address on the web can overflow its column; here it flows onto continuation lines.
 *  - **Units are points** (A4 = 595x842pt) rather than the web's millimetres. The layout constants
 *    below are the web's mm values converted at 72/25.4, so the two documents keep the same
 *    proportions.
 */

// --- Page geometry (points; A4 at 72dpi) -----------------------------------------------------
private const val PAGE_WIDTH = 595
private const val PAGE_HEIGHT = 842
private const val MARGIN = 45f // 16mm
private const val CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
/** Bottom band kept clear on every page for the footer rule and its line of text. */
private const val FOOTER_RESERVE = 34f // 12mm
private const val ROW_HEIGHT = 17f // 6mm
private const val LINE_HEIGHT = 15f // 5.2mm
private const val LABEL_COLUMN = 136f // 48mm
private const val PHOTO_COLUMNS = 2
private const val PHOTO_GAP = 17f // 6mm
private const val PHOTO_CELL_HEIGHT = 156f // 55mm

// --- Palette ---------------------------------------------------------------------------------
// Plain ARGB ints rather than android.graphics.Color calls, so this file's pure helpers stay
// loadable (and therefore unit-testable) on a plain JVM, where every android.graphics method is a
// throwing stub. #004225 is the same brand green the web certificate uses.
private val BRAND_GREEN = 0xFF004225.toInt()
private val MUTED_GRAY = 0xFF6E6E6E.toInt()
private val TEXT_DARK = 0xFF141414.toInt()
private val TEXT_BODY = 0xFF282828.toInt()
private val RULE_LIGHT = 0xFFDCDCDC.toInt()
private val BOX_BORDER = 0xFFC8C8C8.toInt()
private val STATEMENT_FILL = 0xFFF5F8F6.toInt()

private val CERTIFICATE_DATE_FORMAT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMMM uuuu", Locale.UK)
private val CERTIFICATE_DATE_TIME_FORMAT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", Locale.UK)

// =================================================================================================
// Pure content helpers -- no Android graphics, no network. These carry the field-omission rules and
// the certification wording, and are covered by CertificatePdfContentTest.
// =================================================================================================

/** The company's own name, or null when it has not been filled in under Settings > Company Details. */
internal fun certificateCompanyName(company: CapRecord?): String? =
    company?.text("company_name")?.ifBlank { null }

/**
 * The company contact lines under the name, in the web builder's order, with every blank field
 * dropped. Returns an empty list when nothing has been captured yet -- the header then shows the
 * name alone rather than an invented address block.
 */
internal fun certificateCompanyDetailLines(company: CapRecord?): List<String> = listOfNotNull(
    company?.text("address")?.ifBlank { null },
    company?.text("phone")?.ifBlank { null },
    company?.text("email")?.ifBlank { null },
    company?.text("vat_number")?.ifBlank { null }?.let { "VAT: $it" }
)

/** Brand + model, or null when the machine is unknown/unnamed. */
internal fun certificateMachineLabel(machine: CapRecord?): String? = listOfNotNull(
    machine?.text("brand")?.ifBlank { null },
    machine?.text("model")?.ifBlank { null }
).joinToString(" ").ifBlank { null }

/**
 * The certification statement.
 *
 * Deliberately conservative, word for word from the web builder: it states only what CAP actually
 * recorded. "Guaranteed", "certified safe", "fully compliant" and "manufacturer approved" are
 * explicitly NOT used. Each optional part falls back the same way the web version does -- "the
 * equipment" / "the client" / "the recorded service date" / "CAP" -- so a missing field never
 * produces a dangling sentence or a fabricated name.
 */
internal fun certificateStatement(
    machine: CapRecord?,
    client: CapRecord?,
    company: CapRecord?,
    serviceDate: String?
): String {
    val machineLabel = certificateMachineLabel(machine) ?: "the equipment"
    val clientLabel = client?.text("company_name")?.ifBlank { null } ?: "the client"
    val companyLabel = certificateCompanyName(company) ?: "CAP"
    val serviceDateLabel = formatCertificateDate(serviceDate) ?: "the recorded service date"
    return "This document certifies that $machineLabel, identified above, was inspected and " +
        "serviced by $companyLabel on $serviceDateLabel on behalf of $clientLabel, in accordance " +
        "with the service work recorded on this service record."
}

/**
 * Formats a `date` column ("2026-08-17") as "17 August 2026". Timestamps are accepted too and read
 * by their date part only -- no timezone conversion, because a `date` column has no time of day to
 * shift. Returns null for anything unparseable, which every caller treats as "omit this line".
 */
internal fun formatCertificateDate(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.length < 10) return null
    return try {
        LocalDate.parse(value.take(10)).format(CERTIFICATE_DATE_FORMAT)
    } catch (_: Exception) {
        null
    }
}

/**
 * Formats a `timestamptz` ("2026-08-17T10:23:45.123456+00:00") as "17 Aug 2026, 10:23" in the
 * device's own timezone -- matching the web's `toLocaleString`, so the same certificate does not
 * claim two different generation times on two clients. Falls back to the date alone when the value
 * carries no usable offset, and to null when it is not a date at all.
 */
internal fun formatCertificateDateTime(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty()) return null
    return try {
        OffsetDateTime.parse(value)
            .atZoneSameInstant(ZoneId.systemDefault())
            .format(CERTIFICATE_DATE_TIME_FORMAT)
    } catch (_: Exception) {
        formatCertificateDate(value)
    }
}

/**
 * Greedy word wrap against a caller-supplied [measure] function.
 *
 * Split out from the drawing code and parameterised on the measurer precisely so it can be tested
 * on a plain JVM -- `Paint.measureText` is a throwing stub outside an emulator. Existing newlines
 * are honoured (a technician's notes are frequently multi-line), consecutive blank lines are
 * collapsed to one, and a single "word" longer than [maxWidth] is hard-broken rather than allowed
 * to run past the page margin.
 */
internal fun wrapPlainText(text: String, maxWidth: Float, measure: (String) -> Float): List<String> {
    val normalized = text.replace("\r\n", "\n").replace('\r', '\n').trim()
    if (normalized.isEmpty() || maxWidth <= 0f) return emptyList()

    val lines = mutableListOf<String>()
    normalized.split("\n").forEach { paragraph ->
        val words = paragraph.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) {
            if (lines.isNotEmpty() && lines.last().isNotEmpty()) lines.add("")
            return@forEach
        }
        var current = ""
        words.forEach { word ->
            val candidate = if (current.isEmpty()) word else "$current $word"
            if (measure(candidate) <= maxWidth) {
                current = candidate
            } else {
                // The word does not fit after what is already on this line. Close the line, then
                // place the word on its own -- hard-broken only if it is too wide even alone.
                if (current.isNotEmpty()) lines.add(current)
                val pieces = hardBreak(word, maxWidth, measure)
                lines.addAll(pieces.dropLast(1))
                current = pieces.last()
            }
        }
        if (current.isNotEmpty()) lines.add(current)
    }
    while (lines.isNotEmpty() && lines.last().isEmpty()) lines.removeAt(lines.size - 1)
    return lines
}

/** Splits one over-long token character by character. Always returns at least one piece. */
private fun hardBreak(word: String, maxWidth: Float, measure: (String) -> Float): List<String> {
    if (measure(word) <= maxWidth) return listOf(word)
    val pieces = mutableListOf<String>()
    var current = ""
    word.forEach { character ->
        val candidate = current + character
        if (current.isNotEmpty() && measure(candidate) > maxWidth) {
            pieces.add(current)
            current = character.toString()
        } else {
            current = candidate
        }
    }
    pieces.add(current)
    return pieces
}

/**
 * `BitmapFactory.Options.inSampleSize` for a photo being embedded in the certificate, so a
 * full-resolution phone photo is never decoded at full size or written into the PDF (the
 * `service-certificates` bucket has a 10MB object limit, migration 0030). Powers of two only,
 * which is all `inSampleSize` honours.
 */
internal fun certificatePhotoSampleSize(width: Int, height: Int, maxDimension: Int): Int {
    if (width <= 0 || height <= 0 || maxDimension <= 0) return 1
    var sample = 1
    while (max(width, height) / (sample * 2) >= maxDimension) sample *= 2
    return sample
}

// =================================================================================================
// Rendering
// =================================================================================================

/**
 * Builds the certificate PDF and returns its bytes.
 *
 * [photoUrls] must already be resolved signed URLs (see `MainViewModel.createPhotoSignedUrl`);
 * this function only reads them. A photo that fails to load draws a "Photo unavailable" box and
 * never aborts the document -- one dead URL must not cost the technician the whole certificate.
 *
 * Runs on [Dispatchers.IO]: it opens network streams for the photos and does non-trivial bitmap
 * and PDF work, neither of which belongs on the main thread.
 */
suspend fun buildServiceCertificatePdf(
    certificateNumber: String,
    serviceRecord: CapRecord,
    machine: CapRecord?,
    client: CapRecord?,
    company: CapRecord?,
    photoUrls: List<String> = emptyList(),
    includePhotos: Boolean = true,
    generatedAt: String? = null
): ByteArray = withContext(Dispatchers.IO) {
    val content = CertificateContent(
        certificateNumber = certificateNumber,
        serviceRecord = serviceRecord,
        machine = machine,
        client = client,
        company = company,
        includePhotos = includePhotos,
        generatedAt = generatedAt
    )
    // Decoded once and reused by both passes below, so nothing is downloaded twice.
    val photos = if (includePhotos) photoUrls.map { loadCertificatePhoto(it) } else emptyList()
    try {
        // Two passes: PdfDocument cannot reopen a finished page, so "Page X of Y" is impossible in
        // a single pass (jsPDF gets away with setPage()). The first pass only counts pages; the
        // footer occupies the reserved bottom band and consumes no flow space, so it cannot change
        // where the content breaks -- the count is therefore the same in both passes.
        val pageCount = renderCertificate(content, photos, totalPages = null, out = null)
        val out = ByteArrayOutputStream()
        renderCertificate(content, photos, totalPages = pageCount, out = out)
        out.toByteArray()
    } finally {
        photos.forEach { it?.recycle() }
    }
}

private class CertificateContent(
    val certificateNumber: String,
    val serviceRecord: CapRecord,
    val machine: CapRecord?,
    val client: CapRecord?,
    val company: CapRecord?,
    val includePhotos: Boolean,
    val generatedAt: String?
)

private fun renderCertificate(
    content: CertificateContent,
    photos: List<Bitmap?>,
    totalPages: Int?,
    out: OutputStream?
): Int {
    val document = PdfDocument()
    val writer = CertificateWriter(
        document = document,
        footerLabel = certificateCompanyName(content.company) ?: "CAP",
        certificateNumber = content.certificateNumber,
        totalPages = totalPages
    )
    writer.newPage()

    drawHeader(writer, content)
    drawTitle(writer)

    writer.fieldRow("Certificate Number", content.certificateNumber)
    writer.fieldRow("Service Date", formatCertificateDate(content.serviceRecord.text("service_date")))
    writer.fieldRow("Technician", content.serviceRecord.text("technician_name"))
    writer.fieldRow("Certificate Generated", formatCertificateDateTime(content.generatedAt))
    writer.y += 11f

    writer.sectionHeading("Client")
    writer.fieldRow("Company", content.client?.text("company_name"))
    writer.fieldRow("Contact Person", content.client?.text("contact_person"))
    writer.fieldRow("Email", content.client?.text("email"))
    writer.fieldRow("Phone", content.client?.text("phone"))
    writer.fieldRow("Address", content.client?.text("address"))
    writer.y += 11f

    writer.sectionHeading("Machine")
    writer.fieldRow("Machine", certificateMachineLabel(content.machine))
    writer.fieldRow("Type", content.machine?.text("machine_type"))
    writer.fieldRow("Serial Number", content.machine?.text("serial_number"))
    writer.fieldRow("Refrigerant", content.machine?.text("refrigerant_type"))
    writer.y += 11f

    writer.sectionHeading("Service Performed")
    writer.paragraphBlock("Work Performed", content.serviceRecord.text("work_performed"))
    writer.paragraphBlock("Findings", content.serviceRecord.text("findings"))
    writer.paragraphBlock("Recommendations", content.serviceRecord.text("notes"))
    writer.fieldRow("Next Service Due", formatCertificateDate(content.serviceRecord.text("next_service_due")))
    writer.y += 11f

    writer.statementBlock(
        certificateStatement(
            machine = content.machine,
            client = content.client,
            company = content.company,
            serviceDate = content.serviceRecord.text("service_date")
        )
    )

    if (content.includePhotos && photos.isNotEmpty()) {
        writer.sectionHeading("Service Documentation")
        writer.photoGrid(photos)
    }

    val pageCount = writer.finish()
    out?.let { document.writeTo(it) }
    document.close()
    return pageCount
}

private fun drawHeader(writer: CertificateWriter, content: CertificateContent) {
    val name = certificateCompanyName(content.company)
    val details = certificateCompanyDetailLines(content.company)
    writer.y = MARGIN + 14f
    if (name != null) {
        writer.canvas.drawText(name, MARGIN, writer.y, paint(13f, BRAND_GREEN, bold()))
        writer.y += 16f
    }
    val detailPaint = paint(8.5f, MUTED_GRAY)
    details.forEach { line ->
        // Long addresses wrap rather than running off the page, unlike the web builder's
        // single-line jsPDF text() call.
        wrapPlainText(line, CONTENT_WIDTH, detailPaint::measureText).forEach { wrapped ->
            writer.canvas.drawText(wrapped, MARGIN, writer.y, detailPaint)
            writer.y += 11f
        }
    }
    writer.y += 8f
    writer.canvas.drawLine(MARGIN, writer.y, MARGIN + CONTENT_WIDTH, writer.y, rulePaint(RULE_LIGHT, 0.9f))
    writer.y += 26f
}

private fun drawTitle(writer: CertificateWriter) {
    writer.canvas.drawText("Certificate of Service", MARGIN, writer.y, paint(20f, BRAND_GREEN, bold()))
    writer.y += 17f
    writer.canvas.drawText("CAP Service Certificate", MARGIN, writer.y, paint(10f, MUTED_GRAY))
    writer.y += 28f
}

/**
 * Owns the current [PdfDocument.Page], the running vertical cursor, and the page-break rule.
 *
 * Every drawing helper calls [ensureSpace] before it draws, which is how "long text and many photos
 * flow onto further pages" is actually achieved rather than assumed -- the same discipline the web
 * builder's `ensureSpace()` enforces.
 */
private class CertificateWriter(
    private val document: PdfDocument,
    private val footerLabel: String,
    private val certificateNumber: String,
    private val totalPages: Int?
) {
    private var page: PdfDocument.Page? = null
    private var pageNumber = 0
    var y = MARGIN

    val canvas: Canvas get() = requireNotNull(page) { "No PDF page has been started." }.canvas

    fun newPage() {
        closePage()
        pageNumber += 1
        page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
        y = MARGIN
    }

    /** Finishes the last open page and reports how many pages the document ended up with. */
    fun finish(): Int {
        closePage()
        return pageNumber
    }

    fun ensureSpace(needed: Float) {
        if (y + needed > PAGE_HEIGHT - MARGIN - FOOTER_RESERVE) newPage()
    }

    fun sectionHeading(title: String) {
        ensureSpace(34f)
        canvas.drawText(title, MARGIN, y, paint(11f, BRAND_GREEN, bold()))
        canvas.drawLine(MARGIN, y + 4f, MARGIN + CONTENT_WIDTH, y + 4f, rulePaint(BRAND_GREEN, 1.1f))
        y += 23f
    }

    /** One "Label   value" row. A blank value draws nothing at all -- no placeholder, no empty row. */
    fun fieldRow(label: String, value: String?) {
        val text = value?.trim().orEmpty()
        if (text.isEmpty()) return
        val labelPaint = paint(9.5f, MUTED_GRAY)
        val valuePaint = paint(9.5f, TEXT_DARK)
        val lines = wrapPlainText(text, CONTENT_WIDTH - LABEL_COLUMN, valuePaint::measureText)
        if (lines.isEmpty()) return
        ensureSpace(ROW_HEIGHT * lines.size)
        canvas.drawText(label, MARGIN, y, labelPaint)
        lines.forEachIndexed { index, line ->
            if (index > 0) ensureSpace(ROW_HEIGHT)
            canvas.drawText(line, MARGIN + LABEL_COLUMN, y, valuePaint)
            y += ROW_HEIGHT
        }
    }

    /** A titled, wrapped paragraph. Blank content draws nothing, heading included. */
    fun paragraphBlock(title: String, value: String?) {
        val text = value?.trim().orEmpty()
        if (text.isEmpty()) return
        val bodyPaint = paint(9.5f, TEXT_BODY)
        val lines = wrapPlainText(text, CONTENT_WIDTH, bodyPaint::measureText)
        if (lines.isEmpty()) return
        ensureSpace(34f)
        canvas.drawText(title, MARGIN, y, paint(9.5f, TEXT_DARK, bold()))
        y += 14f
        lines.forEach { line ->
            ensureSpace(LINE_HEIGHT)
            if (line.isNotEmpty()) canvas.drawText(line, MARGIN, y, bodyPaint)
            y += LINE_HEIGHT
        }
        y += 8f
    }

    /** The bordered certification statement. Kept whole on one page whenever it fits. */
    fun statementBlock(statement: String) {
        val statementPaint = paint(9.5f, TEXT_DARK, italic())
        val lines = wrapPlainText(statement, CONTENT_WIDTH - 28f, statementPaint::measureText)
        val height = lines.size * LINE_HEIGHT + 22f
        ensureSpace(height + 8f)
        val box = RectF(MARGIN, y, MARGIN + CONTENT_WIDTH, y + height)
        canvas.drawRoundRect(box, 6f, 6f, fillPaint(STATEMENT_FILL))
        canvas.drawRoundRect(box, 6f, 6f, rulePaint(BRAND_GREEN, 0.9f))
        lines.forEachIndexed { index, line ->
            canvas.drawText(line, MARGIN + 14f, y + 17f + index * LINE_HEIGHT, statementPaint)
        }
        y += height + 22f
    }

    /** Two-up photo grid. A null bitmap (failed download/decode) becomes a labelled empty cell. */
    fun photoGrid(photos: List<Bitmap?>) {
        val cellWidth = (CONTENT_WIDTH - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS
        var column = 0
        photos.forEach { bitmap ->
            if (column == 0) ensureSpace(PHOTO_CELL_HEIGHT + PHOTO_GAP)
            val x = MARGIN + column * (cellWidth + PHOTO_GAP)
            canvas.drawRect(RectF(x, y, x + cellWidth, y + PHOTO_CELL_HEIGHT), rulePaint(BOX_BORDER, 0.8f))
            if (bitmap != null) {
                val scale = minOf(cellWidth / bitmap.width, PHOTO_CELL_HEIGHT / bitmap.height)
                val drawWidth = bitmap.width * scale
                val drawHeight = bitmap.height * scale
                val left = x + (cellWidth - drawWidth) / 2f
                val top = y + (PHOTO_CELL_HEIGHT - drawHeight) / 2f
                canvas.drawBitmap(
                    bitmap,
                    null,
                    RectF(left, top, left + drawWidth, top + drawHeight),
                    Paint(Paint.FILTER_BITMAP_FLAG)
                )
            } else {
                canvas.drawText(
                    "Photo unavailable",
                    x + cellWidth / 2f,
                    y + PHOTO_CELL_HEIGHT / 2f,
                    paint(8f, MUTED_GRAY, align = Paint.Align.CENTER)
                )
            }
            column = (column + 1) % PHOTO_COLUMNS
            if (column == 0) y += PHOTO_CELL_HEIGHT + PHOTO_GAP
        }
        if (column != 0) y += PHOTO_CELL_HEIGHT + PHOTO_GAP
    }

    private fun closePage() {
        val open = page ?: return
        drawFooter(open.canvas)
        document.finishPage(open)
        page = null
    }

    private fun drawFooter(target: Canvas) {
        val baseline = PAGE_HEIGHT - MARGIN
        target.drawLine(MARGIN, baseline, PAGE_WIDTH - MARGIN, baseline, rulePaint(RULE_LIGHT, 0.6f))
        // The measuring pass has no page total yet, and its output is discarded anyway.
        val total = totalPages ?: return
        target.drawText(
            "$footerLabel · $certificateNumber · Page $pageNumber of $total",
            PAGE_WIDTH / 2f,
            baseline + 14f,
            paint(7.5f, MUTED_GRAY, align = Paint.Align.CENTER)
        )
    }
}

// --- Paint helpers ---------------------------------------------------------------------------
// All Paint/Typeface construction lives inside functions, never in a top-level property, so this
// file's static initialiser stays free of android.graphics calls (see the palette comment above).

private fun bold(): Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)

private fun italic(): Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.ITALIC)

private fun paint(
    size: Float,
    color: Int,
    typeface: Typeface? = null,
    align: Paint.Align = Paint.Align.LEFT
): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.textSize = size
    this.color = color
    this.typeface = typeface ?: Typeface.SANS_SERIF
    this.textAlign = align
}

private fun rulePaint(color: Int, width: Float): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    this.style = Paint.Style.STROKE
    this.strokeWidth = width
}

private fun fillPaint(color: Int): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    this.style = Paint.Style.FILL
}

/**
 * Downloads and decodes one already-signed photo URL, downscaled via [certificatePhotoSampleSize].
 *
 * Returns null on ANY failure (expired signed URL, offline, corrupt image, out of memory) -- the
 * caller renders a "Photo unavailable" cell instead. Deliberately broad: losing one photo must
 * never cost the whole certificate.
 */
private fun loadCertificatePhoto(url: String, maxDimension: Int = 1000): Bitmap? = try {
    // Read once into memory: the bounds pass and the real decode both need the bytes, and a
    // network stream cannot be rewound.
    val bytes = URL(url).openStream().use { it.readBytes() }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val options = BitmapFactory.Options().apply {
        inSampleSize = certificatePhotoSampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
    }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
} catch (_: Exception) {
    null
} catch (_: OutOfMemoryError) {
    null
}
