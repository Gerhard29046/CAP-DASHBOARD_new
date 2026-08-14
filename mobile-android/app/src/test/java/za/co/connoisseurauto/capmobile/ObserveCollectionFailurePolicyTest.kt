package com.CAPDATABASE.capdatabase

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

/**
 * WHAT THIS TEST DOES AND DOES NOT PROVE -- read before trusting it.
 *
 * It does NOT invoke [SupabaseDataRepository.observeCollection] or [RecordsRepository.observeCollections].
 * It cannot: [SupabaseDataRepository] takes a final [SupabaseAuthRepository], which reads
 * `BuildConfig.SUPABASE_URL` and an Android-Keystore-backed EncryptedSharedPreferences, so neither
 * can be constructed or substituted in a JVM unit test without production-code changes.
 *
 * What it DOES prove is the load-bearing coroutine-Flow claim the failure policy rests on, run
 * against this project's real kotlinx-coroutines version: that in `combine(sourceA, sourceB)`,
 * calling `close(error)` inside ONE `channelFlow` source terminates the ENTIRE combined flow and
 * every sibling source with it -- and that swallowing the same failure instead keeps every source
 * alive and lets the failed one recover on its next poll.
 *
 * The two [observeLike] policies below are transcriptions of the before/after shape of
 * observeCollection()'s catch block. If that block is ever changed, this test does not
 * automatically follow -- it is a semantics guard for the design, not a regression guard on the
 * source file.
 */
class ObserveCollectionFailurePolicyTest {

    private class TerminalAuthFailure : Exception("session expired")

    private companion object {
        const val POLL_MS = 40L
        const val TIMEOUT_MS = 4_000L
    }

    /**
     * @param closeOnTransientFailure true reproduces the PRE-fix policy (close the flow on any
     *        failure); false reproduces the POST-fix policy (close only on a terminal auth
     *        failure, or on a failure before anything has ever been emitted).
     */
    private fun observeLike(
        closeOnTransientFailure: Boolean,
        fetch: suspend () -> String
    ): Flow<String> = channelFlow {
        var hasEmitted = false

        suspend fun fetchAndSend() {
            val value = try {
                fetch()
            } catch (error: TerminalAuthFailure) {
                close(error)
                return
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (closeOnTransientFailure || !hasEmitted) close(error)
                return
            }
            send(value)
            hasEmitted = true
        }

        fetchAndSend()
        launch {
            while (true) {
                delay(POLL_MS)
                fetchAndSend()
            }
        }
    }

    /** Succeeds, then throws a transient IOException once, then succeeds with a new value. */
    private fun flakyAfterFirstSuccess(): suspend () -> String {
        val calls = AtomicInteger(0)
        return {
            when (calls.getAndIncrement()) {
                0 -> "a-first"
                1 -> throw IOException("transient network drop")
                else -> "a-recovered"
            }
        }
    }

    /** A healthy neighbouring table that keeps producing new values forever. */
    private fun healthyCounter(): suspend () -> String {
        val calls = AtomicInteger(0)
        return { "b-${calls.getAndIncrement()}" }
    }

    @Test
    fun `post-fix policy - one table's transient failure does not kill the neighbouring table`() = runBlocking {
        val combined = combine(
            observeLike(closeOnTransientFailure = false, fetch = flakyAfterFirstSuccess()),
            observeLike(closeOnTransientFailure = false, fetch = healthyCounter())
        ) { a, b -> a to b }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) { combined.first { (a, _) -> a == "a-recovered" } }
        }

        assertNull("the combined flow must not fail at all", outcome.exceptionOrNull())
        val pair = outcome.getOrNull()
        assertNotNull("the failed table must recover on a later poll, within the timeout", pair)
        assertEquals("a-recovered", pair!!.first)
        assertTrue(
            "the healthy neighbouring table must still be producing values after the other one failed",
            pair.second.startsWith("b-")
        )
    }

    @Test
    fun `pre-fix policy - one table's transient failure terminates the whole combined flow`() = runBlocking {
        val combined = combine(
            observeLike(closeOnTransientFailure = true, fetch = flakyAfterFirstSuccess()),
            observeLike(closeOnTransientFailure = true, fetch = healthyCounter())
        ) { a, b -> a to b }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) { combined.first { (a, _) -> a == "a-recovered" } }
        }

        val failure = outcome.exceptionOrNull()
        assertTrue(
            "the single failing source must take the entire combined flow down -- this is the bug the fix removes, got: $failure",
            failure is IOException
        )
    }

    @Test
    fun `post-fix policy - the healthy table alone keeps emitting while its neighbour is broken`() = runBlocking {
        // Stronger form of the first test: the broken table NEVER recovers, and the healthy one
        // must still deliver several fresh values rather than being frozen at the last combined
        // snapshot.
        val alwaysBrokenAfterFirst = run {
            val calls = AtomicInteger(0)
            suspend { if (calls.getAndIncrement() == 0) "a-first" else throw IOException("still down") }
        }

        val combined = combine(
            observeLike(closeOnTransientFailure = false, fetch = alwaysBrokenAfterFirst),
            observeLike(closeOnTransientFailure = false, fetch = healthyCounter())
        ) { a, b -> a to b }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) { combined.first { (_, b) -> b == "b-4" } }
        }

        assertNull("a permanently broken neighbour must not fail the combined flow", outcome.exceptionOrNull())
        val pair = outcome.getOrNull()
        assertNotNull("the healthy table must keep polling and emitting new values", pair)
        assertEquals("b-4", pair!!.second)
        assertEquals("the broken table keeps showing its last good value", "a-first", pair.first)
    }

    @Test
    fun `post-fix policy - a cold-start failure still closes the flow so the screen cannot hang on loading`() = runBlocking {
        val brokenFromTheStart = suspend { throw IOException("offline at launch") }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                observeLike(closeOnTransientFailure = false, fetch = brokenFromTheStart).first()
            }
        }

        assertTrue(
            "a failure before ANY emission must still surface as an error, got: ${outcome.exceptionOrNull()}",
            outcome.exceptionOrNull() is IOException
        )
    }

    @Test
    fun `post-fix policy - a terminal auth failure still closes the flow even after a successful emission`() = runBlocking {
        val expiresAfterFirstSuccess = run {
            val calls = AtomicInteger(0)
            suspend { if (calls.getAndIncrement() == 0) "a-first" else throw TerminalAuthFailure() }
        }

        val combined = combine(
            observeLike(closeOnTransientFailure = false, fetch = expiresAfterFirstSuccess),
            observeLike(closeOnTransientFailure = false, fetch = healthyCounter())
        ) { a, b -> a to b }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) { combined.first { (_, b) -> b == "b-4" } }
        }

        assertTrue(
            "a terminal auth failure must NOT be swallowed -- the user has to sign in again, got: ${outcome.exceptionOrNull()}",
            outcome.exceptionOrNull() is TerminalAuthFailure
        )
    }
}
