package com.CAPDATABASE.capdatabase

import org.junit.Assert.assertEquals
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
}
