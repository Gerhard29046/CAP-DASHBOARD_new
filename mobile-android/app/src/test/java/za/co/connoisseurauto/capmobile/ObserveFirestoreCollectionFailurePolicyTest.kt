package com.CAPDATABASE.capdatabase

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
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
 * Companion to [ObserveCollectionFailurePolicyTest], which covers the Supabase-backed sources.
 * This file covers the OTHER source combined into the same `combine()`: the one remaining
 * Firestore-backed collection, `"users"` ([RecordsRepository.observeFirestoreCollection]).
 *
 * It does NOT invoke [RecordsRepository] or any Firestore type. It cannot: [RecordsRepository]
 * takes a `FirebaseFirestore`, which requires an initialised `FirebaseApp` and therefore an
 * Android runtime -- unavailable in a JVM unit test, and unsubstitutable without production-code
 * changes (the class is final). Same constraint [ObserveCollectionFailurePolicyTest]'s own header
 * documents for the Supabase side.
 *
 * What it DOES prove, against this project's real kotlinx-coroutines version, is the semantics the
 * `"users"` failure policy rests on. [firestoreObserveLike] is a transcription of
 * `observeFirestoreCollection`'s shape -- `callbackFlow` + a re-attachable listener + `trySend` of
 * last-known-good + a `launch { delay(...); attach() }` retry -- parameterised over three error
 * policies so the fixed behaviour can be contrasted with what it replaced:
 *
 *  - [ErrorPolicy.CLOSE_ALWAYS]: the PRE-fix `"users"` behaviour (`close(error)` on any listener
 *    error). Tests asserting this kills the combined flow are the regression guard.
 *  - [ErrorPolicy.CLOSE_BEFORE_FIRST_EMISSION]: the Supabase policy
 *    ([SupabaseDataRepository.observeCollection]) hypothetically applied to `"users"`. Proves why
 *    `"users"` deliberately does NOT get that carve-out: a `PERMISSION_DENIED` fails on the very
 *    first attempt, so the carve-out would reproduce the exact bug being fixed.
 *  - [ErrorPolicy.NEVER_CLOSE]: the shipped `"users"` policy.
 *
 * These are transcriptions of a design, not instrumentation of the source file. If
 * `observeFirestoreCollection` is changed, this test does not automatically follow.
 */
class ObserveFirestoreCollectionFailurePolicyTest {

    private enum class ErrorPolicy { CLOSE_ALWAYS, CLOSE_BEFORE_FIRST_EMISSION, NEVER_CLOSE }

    private companion object {
        const val RETRY_MS = 60L
        const val POLL_MS = 40L
        /** Gap between the scripted events a single attached listener delivers. */
        const val EVENT_MS = 10L
        const val TIMEOUT_MS = 4_000L
    }

    /** Stand-in for Firestore's `ListenerRegistration`. */
    private class FakeRegistration(val onRemove: () -> Unit) {
        fun remove() = onRemove()
    }

    private sealed interface Event {
        data class Snapshot(val rows: List<String>) : Event
        data class Failure(val error: Throwable) : Event
    }

    /**
     * Drives a fake snapshot listener with the two Firestore behaviours the policy depends on:
     * events arrive ASYNCHRONOUSLY after `addSnapshotListener` returns (so the caller has already
     * stored its `ListenerRegistration`), and a registration delivers no further events once it
     * has delivered an error or been removed.
     *
     * [script] returns the event sequence for a given zero-based attach attempt.
     */
    private class FakeFirestoreCollection(private val script: (Int) -> List<Event>) {
        val attachCount = AtomicInteger(0)
        val removeCount = AtomicInteger(0)

        fun addSnapshotListener(
            scope: CoroutineScope,
            onEvent: (List<String>?, Throwable?) -> Unit
        ): FakeRegistration {
            val events = script(attachCount.getAndIncrement())
            var live = true
            scope.launch {
                for (event in events) {
                    delay(EVENT_MS)
                    if (!live) return@launch
                    when (event) {
                        is Event.Snapshot -> onEvent(event.rows, null)
                        is Event.Failure -> {
                            onEvent(null, event.error)
                            return@launch // a errored registration is dead
                        }
                    }
                }
            }
            return FakeRegistration {
                live = false
                removeCount.incrementAndGet()
            }
        }
    }

    /** Transcription of `RecordsRepository.observeFirestoreCollection`'s policy. */
    private fun firestoreObserveLike(
        policy: ErrorPolicy,
        collection: FakeFirestoreCollection
    ): Flow<List<String>> = callbackFlow {
        var registration: FakeRegistration? = null
        var lastGood: List<String> = emptyList()
        var hasEmitted = false

        fun attach() {
            registration = collection.addSnapshotListener(this) { snapshot, error ->
                when {
                    error != null -> when (policy) {
                        ErrorPolicy.CLOSE_ALWAYS -> close(error)
                        ErrorPolicy.CLOSE_BEFORE_FIRST_EMISSION ->
                            if (!hasEmitted) close(error) else Unit
                        ErrorPolicy.NEVER_CLOSE -> {
                            trySend(lastGood)
                            registration?.remove()
                            registration = null
                            launch {
                                delay(RETRY_MS)
                                attach()
                            }
                        }
                    }
                    snapshot != null -> {
                        lastGood = snapshot
                        hasEmitted = true
                        trySend(lastGood)
                    }
                }
            }
        }

        attach()
        awaitClose { registration?.remove() }
    }

    /**
     * A healthy neighbouring Supabase-backed table: polls forever and keeps producing new values.
     * Same shape as [ObserveCollectionFailurePolicyTest]'s post-fix `observeLike`.
     */
    private fun healthySupabaseLike(): Flow<String> = channelFlow {
        val calls = AtomicInteger(0)
        send("b-${calls.getAndIncrement()}")
        launch {
            while (true) {
                delay(POLL_MS)
                send("b-${calls.getAndIncrement()}")
            }
        }
    }

    // --- 1. Failure on the very FIRST attempt --------------------------------------------------

    @Test
    fun `pre-fix users policy - a first-attempt listener error kills every other table`() = runBlocking {
        val users = FakeFirestoreCollection { listOf(Event.Failure(IOException("PERMISSION_DENIED on list"))) }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.CLOSE_ALWAYS, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (_, b) -> b == "b-3" }
            }
        }

        assertTrue(
            "PRE-fix: the users listener error must take the whole combined flow down -- this is " +
                "the bug the fix removes, got: ${outcome.exceptionOrNull()}",
            outcome.exceptionOrNull() is IOException
        )
    }

    @Test
    fun `supabase policy applied to users would still kill every other table on a first-attempt error`() = runBlocking {
        // Why "users" deliberately does NOT get SupabaseDataRepository's cold-start carve-out:
        // firestore.rules' `allow list: if isAdmin()` denial is not transient, so it fires on the
        // FIRST attempt, where the carve-out still closes -- reproducing the original bug.
        val users = FakeFirestoreCollection { listOf(Event.Failure(IOException("PERMISSION_DENIED on list"))) }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.CLOSE_BEFORE_FIRST_EMISSION, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (_, b) -> b == "b-3" }
            }
        }

        assertTrue(
            "the Supabase cold-start carve-out is NOT safe for users, got: ${outcome.exceptionOrNull()}",
            outcome.exceptionOrNull() is IOException
        )
    }

    @Test
    fun `post-fix users policy - a first-attempt listener error does not kill any other table`() = runBlocking {
        val users = FakeFirestoreCollection { listOf(Event.Failure(IOException("PERMISSION_DENIED on list"))) }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.NEVER_CLOSE, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (_, b) -> b == "b-3" }
            }
        }

        assertNull("the combined flow must not fail at all", outcome.exceptionOrNull())
        val pair = outcome.getOrNull()
        assertNotNull(
            "combine() must still emit -- users has to emit SOMETHING or every screen hangs",
            pair
        )
        assertEquals(
            "a users source that never succeeded must degrade to an EMPTY list, not fabricated rows",
            emptyList<String>(),
            pair!!.first
        )
        assertEquals("the neighbouring healthy table must keep producing values", "b-3", pair.second)
    }

    // --- 2. Failure AFTER a successful emission ------------------------------------------------

    @Test
    fun `post-fix users policy - an error after a good emission keeps the last-known-good rows and the neighbour alive`() = runBlocking {
        val users = FakeFirestoreCollection { attempt ->
            // Attempt 0 delivers real rows and THEN drops -- the "failed after a good emission"
            // case. Every re-attach after that keeps failing, so lastGood must survive.
            if (attempt == 0) listOf(
                Event.Snapshot(listOf("u-1", "u-2")),
                Event.Failure(IOException("listener dropped"))
            ) else listOf(Event.Failure(IOException("listener dropped")))
        }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.NEVER_CLOSE, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (_, b) -> b == "b-4" }
            }
        }

        assertNull("a permanently broken users listener must not fail the combined flow", outcome.exceptionOrNull())
        val pair = outcome.getOrNull()
        assertNotNull("the healthy table must keep polling and emitting new values", pair)
        assertEquals(
            "users keeps showing its last-known-good rows rather than blanking or inventing data",
            listOf("u-1", "u-2"),
            pair!!.first
        )
        assertEquals("b-4", pair.second)
        assertTrue(
            "the broken users listener must have been re-attached at least once, got ${users.attachCount.get()}",
            users.attachCount.get() > 1
        )
    }

    @Test
    fun `pre-fix users policy - an error after a good emission also killed every other table`() = runBlocking {
        val users = FakeFirestoreCollection { attempt ->
            // Attempt 0 delivers real rows and THEN drops -- the "failed after a good emission"
            // case. Every re-attach after that keeps failing, so lastGood must survive.
            if (attempt == 0) listOf(
                Event.Snapshot(listOf("u-1", "u-2")),
                Event.Failure(IOException("listener dropped"))
            ) else listOf(Event.Failure(IOException("listener dropped")))
        }

        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.CLOSE_ALWAYS, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (_, b) -> b == "b-4" }
            }
        }

        assertTrue(
            "PRE-fix regression guard, got: ${outcome.exceptionOrNull()}",
            outcome.exceptionOrNull() is IOException
        )
    }

    // --- 3. Retry and recovery -----------------------------------------------------------------

    @Test
    fun `post-fix users policy - the listener retries after a delay and recovers with fresh rows`() = runBlocking {
        val users = FakeFirestoreCollection { attempt ->
            when (attempt) {
                0, 1 -> listOf(Event.Failure(IOException("PERMISSION_DENIED on list")))
                else -> listOf(Event.Snapshot(listOf("u-recovered")))
            }
        }

        val startedAt = System.currentTimeMillis()
        val outcome = runCatching {
            withTimeoutOrNull(TIMEOUT_MS) {
                combine(
                    firestoreObserveLike(ErrorPolicy.NEVER_CLOSE, users),
                    healthySupabaseLike()
                ) { u, b -> u to b }.first { (u, _) -> u == listOf("u-recovered") }
            }
        }
        val elapsed = System.currentTimeMillis() - startedAt

        assertNull("recovery must not involve the flow failing", outcome.exceptionOrNull())
        assertNotNull("users must recover once its underlying condition clears", outcome.getOrNull())
        assertEquals(3, users.attachCount.get())
        assertTrue(
            "each retry must be delayed, not a hot loop -- 2 failures should cost at least " +
                "${2 * RETRY_MS}ms, took ${elapsed}ms",
            elapsed >= 2 * RETRY_MS
        )
    }

    @Test
    fun `post-fix users policy - cancelling the collector stops the retry loop`() = runBlocking {
        val users = FakeFirestoreCollection { listOf(Event.Failure(IOException("still down"))) }

        val job = firestoreObserveLike(ErrorPolicy.NEVER_CLOSE, users)
            .onEach { }
            .launchIn(this)

        delay(RETRY_MS * 4)
        val attachesWhileRunning = users.attachCount.get()
        job.cancelAndJoin()
        val attachesAtCancel = users.attachCount.get()
        delay(RETRY_MS * 4)

        assertTrue(
            "the retry loop must actually be running before cancellation, got $attachesWhileRunning",
            attachesWhileRunning > 1
        )
        assertEquals(
            "no listener may be re-attached after the collector is gone",
            attachesAtCancel,
            users.attachCount.get()
        )
    }
}
