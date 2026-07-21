import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";

const baseUrl = "https://capdashboard.gerhardvanwijk.workers.dev";
const password = process.env.E2E_PASSWORD;
assert(password, "E2E_PASSWORD is required");

const env = Object.fromEntries(readFileSync(new URL("../.env.production", import.meta.url), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));

const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}, `cap-e2e-${Date.now()}`);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp, "capdashboard");
await signInWithEmailAndPassword(auth, "admin@connoisseurauto.co.za", password);

async function cleanupTaggedRecords() {
  const names = ["job_card_lines", "service_records", "job_cards", "machines", "clients", "knowledge_machines"];
  let removed = 0;
  for (const name of names) {
    const snapshot = await getDocs(collection(db, name));
    for (const record of snapshot.docs) {
      const tagged = Object.values(record.data()).some((value) => typeof value === "string" && value.includes("CODEX-E2E-"));
      if (tagged) {
        await deleteDoc(doc(db, name, record.id));
        removed += 1;
      }
    }
  }
  console.log(`CLEANUP_RESULT=${JSON.stringify({ removed })}`);
}

if (process.env.CLEANUP === "1") {
  await cleanupTaggedRecords();
  process.exit(0);
}

const ids = {};
const marker = `CODEX-E2E-${Date.now()}`;
const company = `${marker} Test Client`;
const originalModel = `${marker}-MODEL`;
const androidModel = `${marker}-ANDROID-SYNC`;
const work = `${marker} Complete service test`;
const jobNumber = `JOB-${marker}`;

async function visible(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("admin@connoisseurauto.co.za");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 20_000 });

  await page.goto(`${baseUrl}/clients/new`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Acme Corporation").fill(company);
  await page.getByPlaceholder("Street, City, Country").fill("1 Automated Test Avenue");
  await page.getByPlaceholder("Full name").fill("Test Bot");
  await page.getByPlaceholder("+1 555 000 0000").fill("+27 00 000 0000");
  await page.getByPlaceholder("email@company.com").fill("bot@example.test");
  await page.getByRole("button", { name: "Save Client" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/clients/new", null, { timeout: 20_000 });
  await page.waitForURL(/\/clients\/[^/]+$/, { timeout: 20_000 });
  ids.client = page.url().split("/").pop();
  await visible(page, "No machines yet");

  await page.getByRole("button", { name: "Add Machine" }).click();
  const machineDialog = page.getByRole("dialog");
  const machineInputs = machineDialog.locator("input");
  await machineInputs.nth(0).fill("TestBrand");
  await machineInputs.nth(1).fill(originalModel);
  await machineInputs.nth(2).fill(`${marker}-SERIAL`);
  await machineDialog.getByRole("button", { name: "Save Machine" }).click();
  await visible(page, originalModel);

  const machineLink = page.locator('a[href^="/machines/"]').filter({ hasText: originalModel }).first();
  await machineLink.click();
  await page.waitForURL(/\/machines\/[^/]+$/, { timeout: 20_000 });
  ids.machine = page.url().split("/").pop();

  await page.getByRole("button", { name: "Add Service" }).click();
  const serviceDialog = page.getByRole("dialog");
  const serviceInputs = serviceDialog.locator("input");
  await serviceInputs.nth(1).fill("Playwright Bot");
  await serviceDialog.locator("textarea").nth(0).fill(work);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await serviceInputs.nth(2).fill(tomorrow);
  await serviceDialog.getByRole("button", { name: "Save Service Record" }).click();
  await visible(page, work);

  const service = await addDoc(collection(db, "service_records"), {
    machine_id: ids.machine,
    service_date: new Date().toISOString().slice(0, 10),
    next_service_due: tomorrow,
    technician_name: "Firebase Test Bot",
    work_performed: `${marker} secondary sync record`,
    created_at: serverTimestamp(), updated_at: serverTimestamp(),
  });
  ids.service = service.id;
  const job = await addDoc(collection(db, "job_cards"), {
    client_id: ids.client, machine_id: ids.machine, job_number: jobNumber,
    status: "Ready to Invoice", date_received: new Date().toISOString().slice(0, 10),
    fault_description: `${marker} Automated fault`, technician_name: "Test Bot",
    created_at: serverTimestamp(), updated_at: serverTimestamp(),
  });
  ids.job = job.id;
  const line = await addDoc(collection(db, "job_card_lines"), {
    job_card_id: ids.job, description: `${marker} Test line`, quantity: 1, unit_price: 100,
    created_at: serverTimestamp(), updated_at: serverTimestamp(),
  });
  ids.jobLine = line.id;
  const knowledge = await addDoc(collection(db, "knowledge_machines"), {
    manufacturer: "TestBrand", model_name: `${marker} Knowledge Model`, category: "Automated test",
    summary: "Temporary Playwright verification record", created_at: serverTimestamp(), updated_at: serverTimestamp(),
  });
  ids.knowledge = knowledge.id;

  const checks = [
    ["/", company],
    ["/clients", company],
    [`/clients/${ids.client}`, originalModel],
    [`/machines/${ids.machine}`, work],
    ["/service-records", marker],
    ["/upcoming-services", originalModel],
    ["/calendar", company],
    ["/jobs", jobNumber],
    [`/job-cards/${ids.job}`, marker],
    ["/invoice-queue", jobNumber],
    ["/knowledge-base", `${marker} Knowledge Model`],
    ["/admin/users", "admin@connoisseurauto.co.za"],
  ];
  for (const [path, text] of checks) {
    console.log(`CHECKING=${path}`);
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await visible(page, text);
  }

  await page.goto(`${baseUrl}/machines/${ids.machine}`, { waitUntil: "domcontentloaded" });
  await updateDoc(doc(db, "machines", ids.machine), { model: androidModel, updated_at: serverTimestamp() });
  await visible(page, androidModel);

  console.log(`LIVE_SYNC_RESULT=${JSON.stringify({ marker, ids, company, originalModel, androidModel, jobNumber, consoleErrors: consoleErrors.filter((value) => !value.includes("favicon")) })}`);
} catch (error) {
  console.log(`LIVE_SYNC_FAILURE=${JSON.stringify({ marker, ids, message: error.message, consoleErrors })}`);
  throw error;
} finally {
  await browser.close();
}
