package com.CAPDATABASE.capdatabase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Unit tests for [buildServiceCertificatePath] -- the pure, no-network path-construction logic
 * [SupabaseCertificateRepository.uploadCertificate] uses internally.
 *
 * Same scope and same documented limitation as [SupabaseStorageTest]: the repository class itself
 * cannot be constructed in a JVM unit test (it depends on [SupabaseAuthRepository], which reads
 * `BuildConfig.SUPABASE_URL` and Android-Keystore-backed `EncryptedSharedPreferences`), so the
 * HTTP methods are not covered here -- matching the existing precedent that
 * [SupabaseStorageRepository]'s HTTP methods have no direct unit tests either. What IS proven here
 * is that the path shape is exactly what migration 0030's `can_access_service_certificate()`
 * requires: exactly ONE folder segment, being the service record id.
 */
class ServiceCertificatePathTest {

    @Test
    fun `builds exactly one folder segment -- the service record id`() {
        val path = buildServiceCertificatePath(
            "11111111-1111-1111-1111-111111111111",
            "CAP-SVC-2026-000123"
        )
        val segments = path.split("/")
        // storage.foldername() drops the last segment (the object's own name), so migration
        // 0030's `array_length(segments, 1) <> 1` check sees exactly the record id here.
        assertEquals(2, segments.size)
        assertEquals("11111111-1111-1111-1111-111111111111", segments[0])
        assertEquals("CAP-SVC-2026-000123.pdf", segments[1])
    }

    @Test
    fun `has no extra namespace segment -- unlike the shared photos bucket`() {
        val path = buildServiceCertificatePath("record-id", "CAP-SVC-2026-000001")
        assertEquals("record-id/CAP-SVC-2026-000001.pdf", path)
    }

    @Test
    fun `is stable across calls -- regenerating overwrites the same object`() {
        val first = buildServiceCertificatePath("record-id", "CAP-SVC-2026-000007")
        val second = buildServiceCertificatePath("record-id", "CAP-SVC-2026-000007")
        // Deliberately no per-upload uuid: the certificate number never changes on regenerate,
        // so neither may the path (the upload upserts over it).
        assertEquals(first, second)
    }

    @Test
    fun `rejects a blank serviceRecordId`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildServiceCertificatePath("", "CAP-SVC-2026-000123")
        }
    }

    @Test
    fun `rejects a blank certificateNumber`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildServiceCertificatePath("11111111-1111-1111-1111-111111111111", "")
        }
    }
}
