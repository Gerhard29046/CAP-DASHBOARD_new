package com.CAPDATABASE.capdatabase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncResourcesTest {
    @Test
    fun `sync only requests resources the user may view`() {
        val user = CapUser(
            id = "uid-1",
            name = "Technician",
            email = "tech@example.test",
            role = "technician",
            active = true,
            permissions = setOf("clients.view", "job_cards.view")
        )

        assertEquals(
            listOf("Clients", "Job Cards"),
            allowedSyncResources(user).map { it.label }
        )
    }

    @Test
    fun `sync requests no protected resources without permissions`() {
        val user = CapUser("uid-1", "User", "user@example.test", "user", true)

        assertEquals(emptyList<SyncResource>(), allowedSyncResources(user))
    }

    @Test
    fun `client machine relationship accepts string and legacy numeric ids`() {
        val machines = listOf(
            CapRecord("one", mapOf("client_id" to "client-a")),
            CapRecord("two", mapOf("client_id" to 42)),
            CapRecord("three", mapOf("client_id" to "other"))
        )

        assertEquals(listOf("two"), relatedRecords(machines, "client_id", "42").map { it.id })
        assertTrue(sameRecordId("42", 42))
    }
}
