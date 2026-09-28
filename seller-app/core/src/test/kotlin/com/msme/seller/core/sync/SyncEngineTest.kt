package com.msme.seller.core.sync

import com.msme.seller.core.MemoryTokenStore
import com.msme.seller.core.api.ApiClient
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.json
import com.msme.seller.core.listingJson
import com.msme.seller.core.model.CreateListingRequest
import com.msme.seller.core.model.Listing
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.math.BigDecimal

class FakeDraftStore(drafts: List<PendingDraft>) : DraftStore {
    val drafts = drafts.associateBy { it.clientUuid }.toMutableMap()
    val serverIds = mutableMapOf<String, Long>()
    val uploadedEvidence = mutableSetOf<Long>()
    val gradingTriggered = mutableSetOf<String>()
    val synced = mutableMapOf<String, Listing>()
    val failures = mutableMapOf<String, Pair<String, Boolean>>()

    override suspend fun pendingDrafts(): List<PendingDraft> = drafts.values
        .filter { it.clientUuid !in synced }
        .map { draft ->
            draft.copy(
                serverId = serverIds[draft.clientUuid] ?: draft.serverId,
                evidence = draft.evidence.filter { it.id !in uploadedEvidence },
                gradingTriggered = draft.gradingTriggered || draft.clientUuid in gradingTriggered,
            )
        }

    override suspend fun recordServerId(clientUuid: String, serverId: Long) { serverIds[clientUuid] = serverId }
    override suspend fun markEvidenceUploaded(evidenceId: Long) { uploadedEvidence += evidenceId }
    override suspend fun markGradingTriggered(clientUuid: String) { gradingTriggered += clientUuid }
    override suspend fun markSynced(clientUuid: String, serverListing: Listing) { synced[clientUuid] = serverListing }
    override suspend fun markFailed(clientUuid: String, error: String, retryable: Boolean) {
        failures[clientUuid] = error to retryable
    }
}

class SyncEngineTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val server = MockWebServer()
    private lateinit var api: SellerApi

    @Before
    fun setUp() {
        server.start()
        api = ApiClient.sellerApi(server.url("/api/").toString(), MemoryTokenStore("access", "refresh"))
    }

    @After
    fun tearDown() = server.shutdown()

    private fun draft(uuid: String = "uuid-1", photos: Int = 1, serverId: Long? = null): PendingDraft {
        val evidence = (1..photos).map { i ->
            PendingEvidence(id = i.toLong(), file = tmp.newFile("$uuid-$i.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) })
        }
        return PendingDraft(
            clientUuid = uuid,
            request = CreateListingRequest(uuid, 1, "Wheat", "", BigDecimal("25"), "quintal", null, null, null),
            serverId = serverId,
            evidence = evidence,
            gradingTriggered = false,
        )
    }

    private fun enqueueHappyPath(id: Long, photos: Int) {
        server.enqueue(json(listingJson(id), 201))
        repeat(photos) { server.enqueue(json("""{"id": $it, "listing": $id, "file": "f.jpg", "file_type": "IMAGE"}""", 201)) }
        server.enqueue(json("""{"listing_id": $id, "overall_confidence": 0.9, "needs_verification": false, "grade": "Grade A"}"""))
        server.enqueue(json(listingJson(id, status = "ACTIVE")))
    }

    @Test
    fun `full sync creates, uploads, grades, and stores the server copy`() = runTest {
        val store = FakeDraftStore(listOf(draft(photos = 2)))
        enqueueHappyPath(id = 42, photos = 2)

        val report = SyncEngine(api, store).syncAll()

        assertEquals(SyncReport(synced = 1), report)
        assertEquals("ACTIVE", store.synced.getValue("uuid-1").status)
        val create = server.takeRequest()
        assertEquals("/api/catalog/listings/", create.path)
        assertTrue(create.body.readUtf8().contains("\"client_uuid\":\"uuid-1\""))
        val upload = server.takeRequest()
        assertEquals("/api/catalog/listings/42/evidence/", upload.path)
        assertTrue(upload.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
        server.takeRequest()
        assertEquals("/api/catalog/listings/42/grading/trigger/", server.takeRequest().path)
    }

    @Test
    fun `losing the connection mid-upload resumes without re-creating the listing`() = runTest {
        val store = FakeDraftStore(listOf(draft(photos = 2)))
        server.enqueue(json(listingJson(42), 201))
        server.enqueue(json("""{"id": 1, "listing": 42, "file": "f.jpg", "file_type": "IMAGE"}""", 201))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        val first = SyncEngine(api, store).syncAll()

        assertEquals(SyncReport(retryableFailures = 1), first)
        assertEquals(42L, store.serverIds["uuid-1"])
        assertEquals(setOf(1L), store.uploadedEvidence)
        assertTrue(store.failures.getValue("uuid-1").second)

        // Second attempt: only photo 2, grading, refresh — no second create.
        repeat(3) { server.takeRequest() }
        server.enqueue(json("""{"id": 2, "listing": 42, "file": "f.jpg", "file_type": "IMAGE"}""", 201))
        server.enqueue(json("""{"listing_id": 42, "overall_confidence": 0.6, "needs_verification": true, "grade": "Grade B"}"""))
        server.enqueue(json(listingJson(42, status = "PENDING_VERIFICATION")))

        val second = SyncEngine(api, store).syncAll()

        assertEquals(SyncReport(synced = 1), second)
        assertEquals("/api/catalog/listings/42/evidence/", server.takeRequest().path)
    }

    @Test
    fun `a replayed create (200 instead of 201) still counts as created`() = runTest {
        val store = FakeDraftStore(listOf(draft(photos = 0)))
        server.enqueue(json(listingJson(42), 200))
        server.enqueue(json("""{"listing_id": 42, "overall_confidence": 0.75, "needs_verification": true, "grade": null}"""))
        server.enqueue(json(listingJson(42, status = "PENDING_VERIFICATION")))

        assertEquals(SyncReport(synced = 1), SyncEngine(api, store).syncAll())
    }

    @Test
    fun `validation errors are permanent and don't block other drafts`() = runTest {
        val bad = draft(uuid = "bad", photos = 0)
        val good = draft(uuid = "good", photos = 0)
        val store = FakeDraftStore(listOf(bad, good))
        server.enqueue(json("""{"vertical": ["Invalid pk \"1\" - object does not exist."]}""", 400))
        server.enqueue(json(listingJson(9), 201))
        server.enqueue(json("""{"listing_id": 9, "overall_confidence": 0.9, "needs_verification": false, "grade": "Grade A"}"""))
        server.enqueue(json(listingJson(9, status = "ACTIVE")))

        val report = SyncEngine(api, store).syncAll()

        assertEquals(SyncReport(synced = 1, permanentFailures = 1), report)
        val (message, retryable) = store.failures.getValue("bad")
        assertFalse(retryable)
        assertTrue(message.contains("object does not exist"))
    }

    @Test
    fun `grading service down is retryable and the listing is not re-created`() = runTest {
        val store = FakeDraftStore(listOf(draft(photos = 0)))
        server.enqueue(json(listingJson(42), 201))
        server.enqueue(json("""{"detail": "Could not reach grading service"}""", 503))

        val report = SyncEngine(api, store).syncAll()

        assertEquals(SyncReport(retryableFailures = 1), report)
        assertEquals(42L, store.serverIds["uuid-1"])
        assertFalse("uuid-1" in store.gradingTriggered)
    }

    @Test
    fun `a photo deleted from the phone is skipped`() = runTest {
        val d = draft(photos = 1)
        d.evidence.single().file.delete()
        val store = FakeDraftStore(listOf(d))
        server.enqueue(json(listingJson(42), 201))
        server.enqueue(json("""{"listing_id": 42, "overall_confidence": 0.75, "needs_verification": true, "grade": null}"""))
        server.enqueue(json(listingJson(42)))

        assertEquals(SyncReport(synced = 1), SyncEngine(api, store).syncAll())
        assertEquals(3, server.requestCount)
    }
}
