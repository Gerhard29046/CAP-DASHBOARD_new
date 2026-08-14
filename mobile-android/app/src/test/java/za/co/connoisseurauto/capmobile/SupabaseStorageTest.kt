package com.CAPDATABASE.capdatabase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Unit tests for [buildRecordPhotoPath] -- the pure, no-network path-construction logic
 * [SupabaseStorageRepository.uploadPhoto] uses internally. [SupabaseStorageRepository] itself
 * cannot be constructed in a JVM unit test (it depends on [SupabaseAuthRepository], which reads
 * `BuildConfig.SUPABASE_URL` and Android-Keystore-backed `EncryptedSharedPreferences`), matching
 * this test source set's existing documented limitation (see
 * `ObserveCollectionFailurePolicyTest.kt`'s own header comment for the same constraint). This
 * file only proves the path shape is exactly what migration 0024's
 * `can_access_service_record_photo`/`can_access_job_card_photo` functions require -- the actual
 * network calls were verified live against production instead (see the E2 gate report).
 */
class SupabaseStorageTest {

    @Test
    fun `builds a service-records path with exactly 2 folder segments`() {
        val path = buildRecordPhotoPath(RecordPhotoNamespace.SERVICE_RECORD, "11111111-1111-1111-1111-111111111111", "photo.webp")
        val segments = path.split("/")
        // namespace, recordId, filename -- filename is the object's own name, not a folder
        // segment (matches storage.foldername()'s behavior, which drops only the last segment).
        assertEquals(3, segments.size)
        assertEquals("service-records", segments[0])
        assertEquals("11111111-1111-1111-1111-111111111111", segments[1])
        assertEquals(true, segments[2].endsWith("-photo.webp"))
    }

    @Test
    fun `builds a job-cards path with exactly 2 folder segments`() {
        val path = buildRecordPhotoPath(RecordPhotoNamespace.JOB_CARD, "22222222-2222-2222-2222-222222222222", "arrival.webp")
        val segments = path.split("/")
        assertEquals(3, segments.size)
        assertEquals("job-cards", segments[0])
        assertEquals("22222222-2222-2222-2222-222222222222", segments[1])
        assertEquals(true, segments[2].endsWith("-arrival.webp"))
    }

    @Test
    fun `rejects an unrecognized namespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildRecordPhotoPath("random-prefix", "id", "x.webp")
        }
    }

    @Test
    fun `rejects a blank recordId`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildRecordPhotoPath(RecordPhotoNamespace.SERVICE_RECORD, "", "x.webp")
        }
    }

    @Test
    fun `rejects a blank fileName`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildRecordPhotoPath(RecordPhotoNamespace.SERVICE_RECORD, "id", "")
        }
    }

    @Test
    fun `generates a fresh uuid segment on every call -- no path collisions between uploads`() {
        val a = buildRecordPhotoPath(RecordPhotoNamespace.SERVICE_RECORD, "id", "same-name.webp")
        val b = buildRecordPhotoPath(RecordPhotoNamespace.SERVICE_RECORD, "id", "same-name.webp")
        assertNotEquals(a, b)
    }

    @Test
    fun `namespace constants match migration 0024's exact expected prefixes`() {
        assertEquals("service-records", RecordPhotoNamespace.SERVICE_RECORD)
        assertEquals("job-cards", RecordPhotoNamespace.JOB_CARD)
    }
}
