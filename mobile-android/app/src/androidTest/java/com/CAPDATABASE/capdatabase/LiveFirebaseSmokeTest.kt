package com.CAPDATABASE.capdatabase

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LiveFirebaseSmokeTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun liveClientMachineAppearsAndCanBeUpdated() {
        val marker = InstrumentationRegistry.getArguments().getString("marker").orEmpty()
        assertTrue("A CODEX-E2E marker must be supplied", marker.startsWith("CODEX-E2E-"))

        compose.waitUntil(timeoutMillis = 30_000) {
            compose.onAllNodes(hasText("Live Firebase overview")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithContentDescription("Clients", useUnmergedTree = true).performClick()
        compose.waitUntil(timeoutMillis = 30_000) {
            compose.onAllNodes(hasText(marker, substring = true)).fetchSemanticsNodes().isNotEmpty()
        }

        val currentModel = "$marker-ANDROID-SYNC"
        val phoneModel = "$marker-PHONE-EDIT"
        compose.onAllNodes(hasText(currentModel), useUnmergedTree = true)[0].performClick()
        compose.onNodeWithText("Edit machine")
        compose.onAllNodes(hasText(currentModel) and hasSetTextAction(), useUnmergedTree = true)[0]
            .performTextReplacement(phoneModel)
        compose.onNodeWithText("Save").performClick()

        compose.waitUntil(timeoutMillis = 30_000) {
            compose.onAllNodes(hasText(phoneModel, substring = true)).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
