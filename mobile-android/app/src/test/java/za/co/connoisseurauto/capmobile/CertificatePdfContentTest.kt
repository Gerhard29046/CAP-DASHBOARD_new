package com.CAPDATABASE.capdatabase

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.util.TimeZone

/**
 * Unit tests for the pure content helpers in CertificatePdfBuilder.kt -- the field-omission rules,
 * the certification wording and its fallbacks, the date formatting, and the word wrap.
 *
 * DISCLOSED LIMITATION, same as [SupabaseStorageTest]/[ServiceCertificatePathTest]: the actual
 * `PdfDocument`/`Canvas`/`Paint` drawing is NOT covered here and cannot be -- every
 * `android.graphics` method is a throwing stub in a JVM unit test, and this module has no
 * instrumented-test harness for PDF output. That is precisely why the wrap logic takes a `measure`
 * function instead of calling `Paint.measureText` directly: the part that carries real logic is
 * testable, and the part that only puts ink on a page is not pretended to be.
 */
class CertificatePdfContentTest {

    private lateinit var originalTimeZone: TimeZone

    // formatCertificateDateTime() renders a timestamptz in the DEVICE's zone (matching the web's
    // toLocaleString), so the expected output is only deterministic with the zone pinned.
    @Before
    fun pinTimeZone() {
        originalTimeZone = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("Africa/Johannesburg"))
    }

    @After
    fun restoreTimeZone() {
        TimeZone.setDefault(originalTimeZone)
    }

    private fun record(vararg fields: Pair<String, Any?>) = CapRecord("id", mapOf(*fields))

    // --- Company header ------------------------------------------------------------------------

    @Test
    fun `company name is null when the column is blank or missing`() {
        assertNull(certificateCompanyName(null))
        assertNull(certificateCompanyName(record()))
        assertNull(certificateCompanyName(record("company_name" to "")))
        assertNull(certificateCompanyName(record("company_name" to null)))
    }

    @Test
    fun `company detail lines omit every blank field rather than printing a placeholder`() {
        val company = record(
            "company_name" to "Connoisseur Automotive Products (Cape) C.C.",
            "address" to "",
            "phone" to "021 555 0000",
            "email" to null,
            "vat_number" to "4123456789"
        )
        assertEquals(listOf("021 555 0000", "VAT: 4123456789"), certificateCompanyDetailLines(company))
    }

    @Test
    fun `company detail lines are empty when nothing has been captured yet`() {
        // The seeded 0030 row has only company_name -- the certificate must render that alone, not
        // an invented address block.
        assertEquals(emptyList<String>(), certificateCompanyDetailLines(record("company_name" to "CAP")))
        assertEquals(emptyList<String>(), certificateCompanyDetailLines(null))
    }

    @Test
    fun `company detail lines keep the web builder's order`() {
        val company = record(
            "address" to "1 Example Road",
            "phone" to "021 555 0000",
            "email" to "info@example.co.za",
            "vat_number" to "4123456789"
        )
        assertEquals(
            listOf("1 Example Road", "021 555 0000", "info@example.co.za", "VAT: 4123456789"),
            certificateCompanyDetailLines(company)
        )
    }

    // --- Machine label -------------------------------------------------------------------------

    @Test
    fun `machine label joins brand and model, tolerating either being absent`() {
        assertEquals("Robinair AC1234", certificateMachineLabel(record("brand" to "Robinair", "model" to "AC1234")))
        assertEquals("Robinair", certificateMachineLabel(record("brand" to "Robinair", "model" to "")))
        assertEquals("AC1234", certificateMachineLabel(record("model" to "AC1234")))
        assertNull(certificateMachineLabel(record("brand" to "", "model" to "")))
        assertNull(certificateMachineLabel(null))
    }

    // --- Certification statement ---------------------------------------------------------------

    @Test
    fun `statement uses the real values when every field is present`() {
        val statement = certificateStatement(
            machine = record("brand" to "Robinair", "model" to "AC1234"),
            client = record("company_name" to "Cape Motors"),
            company = record("company_name" to "CAP (Cape) C.C."),
            serviceDate = "2026-08-17"
        )
        assertEquals(
            "This document certifies that Robinair AC1234, identified above, was inspected and " +
                "serviced by CAP (Cape) C.C. on 17 August 2026 on behalf of Cape Motors, in " +
                "accordance with the service work recorded on this service record.",
            statement
        )
    }

    @Test
    fun `statement falls back to neutral wording instead of fabricating missing values`() {
        val statement = certificateStatement(machine = null, client = null, company = null, serviceDate = null)
        assertEquals(
            "This document certifies that the equipment, identified above, was inspected and " +
                "serviced by CAP on the recorded service date on behalf of the client, in " +
                "accordance with the service work recorded on this service record.",
            statement
        )
    }

    @Test
    fun `statement falls back per field, not all-or-nothing`() {
        val statement = certificateStatement(
            machine = record("brand" to "Robinair"),
            client = record("company_name" to ""),
            company = record("company_name" to "CAP"),
            serviceDate = "not-a-date"
        )
        assertEquals(
            "This document certifies that Robinair, identified above, was inspected and serviced " +
                "by CAP on the recorded service date on behalf of the client, in accordance with " +
                "the service work recorded on this service record.",
            statement
        )
    }

    @Test
    fun `statement avoids the wording the certificate spec forbids`() {
        val statement = certificateStatement(
            machine = record("brand" to "Robinair", "model" to "AC1234"),
            client = record("company_name" to "Cape Motors"),
            company = record("company_name" to "CAP"),
            serviceDate = "2026-08-17"
        ).lowercase()
        listOf("guarantee", "certified safe", "fully compliant", "manufacturer approved").forEach { banned ->
            assertFalse("Certification statement must not claim \"$banned\".", statement.contains(banned))
        }
    }

    // --- Dates ---------------------------------------------------------------------------------

    @Test
    fun `date column formats as day month year`() {
        assertEquals("17 August 2026", formatCertificateDate("2026-08-17"))
    }

    @Test
    fun `date reads the date part of a timestamp without shifting it`() {
        // A `date` column has no time of day, so no timezone conversion may be applied to it.
        assertEquals("17 August 2026", formatCertificateDate("2026-08-17T23:45:00+00:00"))
    }

    @Test
    fun `unusable date values return null so the caller omits the line`() {
        assertNull(formatCertificateDate(null))
        assertNull(formatCertificateDate(""))
        assertNull(formatCertificateDate("   "))
        assertNull(formatCertificateDate("2026-13-45"))
        assertNull(formatCertificateDate("soon"))
    }

    @Test
    fun `timestamptz is rendered in the device timezone`() {
        // 10:23 UTC is 12:23 in Africa/Johannesburg (UTC+2, no DST).
        assertEquals("17 Aug 2026, 12:23", formatCertificateDateTime("2026-08-17T10:23:45.123456+00:00"))
    }

    @Test
    fun `timestamptz without an offset falls back to the date alone`() {
        assertEquals("17 August 2026", formatCertificateDateTime("2026-08-17"))
        assertNull(formatCertificateDateTime(null))
        assertNull(formatCertificateDateTime("never"))
    }

    // --- Word wrap -----------------------------------------------------------------------------

    // One "point" per character keeps the expectations readable and deterministic; the real
    // measurer is Paint.measureText, which is unavailable off-device.
    private val byCharacter: (String) -> Float = { it.length.toFloat() }

    @Test
    fun `wrap fills each line greedily without splitting words`() {
        assertEquals(
            listOf("the quick", "brown fox", "jumps"),
            wrapPlainText("the quick brown fox jumps", 10f, byCharacter)
        )
    }

    @Test
    fun `wrap honours existing newlines`() {
        assertEquals(
            listOf("first line", "second", "line"),
            wrapPlainText("first line\nsecond line", 10f, byCharacter)
        )
    }

    @Test
    fun `wrap collapses repeated blank lines and trims the ends`() {
        assertEquals(
            listOf("a", "", "b"),
            wrapPlainText("\n\na\n\n\nb\n\n", 10f, byCharacter)
        )
    }

    @Test
    fun `wrap hard-breaks a single token wider than the column`() {
        assertEquals(listOf("abcde", "fghij", "kl"), wrapPlainText("abcdefghijkl", 5f, byCharacter))
    }

    @Test
    fun `wrap hard-breaks an over-long token that follows normal words`() {
        assertEquals(listOf("ab", "cdefg", "hi"), wrapPlainText("ab cdefghi", 5f, byCharacter))
    }

    @Test
    fun `wrap returns nothing for blank text or a zero-width column`() {
        assertEquals(emptyList<String>(), wrapPlainText("", 10f, byCharacter))
        assertEquals(emptyList<String>(), wrapPlainText("   \n  ", 10f, byCharacter))
        assertEquals(emptyList<String>(), wrapPlainText("anything", 0f, byCharacter))
    }

    // --- Photo downscaling ---------------------------------------------------------------------

    @Test
    fun `sample size keeps a phone photo under the target dimension`() {
        assertEquals(4, certificatePhotoSampleSize(4000, 3000, 1000))
        assertEquals(2, certificatePhotoSampleSize(2000, 1500, 1000))
        assertEquals(1, certificatePhotoSampleSize(1200, 900, 1000))
    }

    @Test
    fun `sample size never scales an already-small image up or divides by zero`() {
        assertEquals(1, certificatePhotoSampleSize(400, 300, 1000))
        assertEquals(1, certificatePhotoSampleSize(0, 0, 1000))
        assertEquals(1, certificatePhotoSampleSize(-1, 100, 1000))
        assertEquals(1, certificatePhotoSampleSize(4000, 3000, 0))
    }
}
