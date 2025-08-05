/**
 * This script was generated to test the beacon URLs generated from a Kurtosis enclave
 * checkHealth(), getIdentity() and getSyncing() were inspired by nodeAssertion logic in *.test.ts files
 */

import { KurtosisContext, StarlarkRunConfig} from "kurtosis-sdk";
import * as fs from 'fs';
import { parse as parseYAML } from "yaml";

// Load args from the multi-fork YAML file
const enclaveName = "multi-fork-enclave";
const yamlText = fs.readFileSync('packages/cli/test/sim/multiFork.yml', 'utf8');
const parsed = parseYAML(yamlText);
const inputArgs = JSON.stringify(parsed);

// Sleep utility for delay-based polling

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

//---------------------------------------------
// Helpers for the assertion (use Beacon API endpoints) to match nodeAssertion in Crucible
//---------------------------------------------

// checkHealth: make sure the CL node is responsive
async function checkHealth(baseUrl: string) {
  const r = await fetch(`${baseUrl}/eth/v1/node/health`, { method: "GET" });
  // Lodestar typically returns 200 (healthy) or 206 (syncing but responding)
  if (!(r.status === 200 || r.status === 206)) {
    const text = await r.text().catch(() => "");
    throw new Error(`Health endpoint not OK (status ${r.status}). Response: ${text}`);
  }
}

// getIdentity: get the node’s peer ID and metadata
async function getIdentity(baseUrl: string) {
  const r = await fetch(`${baseUrl}/eth/v1/node/identity`);
  if (!r.ok) throw new Error(`Identity fetch failed: ${r.status}`);
  return r.json();
}

// getSyncing: know if the node thinks it’s synced.
async function getSyncing(baseUrl: string) {
  const r = await fetch(`${baseUrl}/eth/v1/node/syncing`);
  if (!r.ok) throw new Error(`Syncing fetch failed: ${r.status}`);
  return r.json();
}

/**
 * Read timing from the beacon
 * Primary source: /eth/v1/beacon/genesis
 * Fallback: parse Kurtosis package runOutput for the printed genesis epoch seconds
 */

async function getTiming(
  baseUrl: string,
  pkgRunOutput?: string
): Promise<{ genesisTime: number; secondsPerSlot: number }> {
  // fetched SECONDS_PER_SLOT from /eth/v1/config/spec
  const specResp = await fetch(`${baseUrl}/eth/v1/config/spec`);
  if (!specResp.ok) {
    throw new Error(`Failed to read /eth/v1/config/spec (status ${specResp.status})`);
  }
  const spec = await specResp.json();
  const secondsPerSlot = Number(spec?.data?.SECONDS_PER_SLOT);
  if (!Number.isFinite(secondsPerSlot)) {
    throw new Error(`Invalid SECONDS_PER_SLOT from spec: ${spec?.data?.SECONDS_PER_SLOT}`);
  }

  // Try the canonical genesis endpoint first
  let genesisTime: number | undefined;
  try {
    const gResp = await fetch(`${baseUrl}/eth/v1/beacon/genesis`);
    if (gResp.ok) {
      const g = await gResp.json();
      const val = Number(g?.data?.genesis_time);
      if (Number.isFinite(val)) {
        genesisTime = val;
      }
    }
  } catch {
    // ignore and try fallback
  }

  // Fallback: parse genesis epoch seconds from the Kurtosis package output
  if (!Number.isFinite(genesisTime) && typeof pkgRunOutput === "string") {
    // grab the last 10+ digit number in runOutput (the package prints the genesis epoch seconds)
    const matches = [...pkgRunOutput.matchAll(/\b(\d{10,})\b/g)].map(m => Number(m[1]));
    const candidate = matches.length ? matches[matches.length - 1] : undefined;
    if (Number.isFinite(candidate) && candidate! > 1_600_000_000) {
      genesisTime = candidate!;
    }
  }

  if (!Number.isFinite(genesisTime)) {
    throw new Error(
      `Invalid timing from beacon: genesis_time=undefined, seconds_per_slot=${secondsPerSlot}. ` +
      `Tried /eth/v1/beacon/genesis and runOutput fallback.`
    );
  }

  return { genesisTime: genesisTime!, secondsPerSlot };
}


/**
 * Wait until the wall-clock time when the given slot should exist.
 * Accepts optional pkgRunOutput to use as a fallback source of genesis time.
 */
async function waitUntilSlotExists(
  baseUrl: string,
  slot: number,
  extraBufferMs = 3000,
  pkgRunOutput?: string
) {
  const { genesisTime, secondsPerSlot } = await getTiming(baseUrl, pkgRunOutput);
  const targetMs = (genesisTime + slot * secondsPerSlot) * 1000;
  const now = Date.now();
  const delay = Math.max(0, targetMs - now + extraBufferMs);
  if (delay > 0) {
    await sleep(delay);
  }
}

/**
 * After the slot should exist, poll /eth/v1/beacon/headers?slot=<slot>
 * until a header is returned.
 */
async function waitForHeaderAtSlot(
  baseUrl: string,
  slot: number,
  timeoutMs = 60_000,
  intervalMs = 1_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/eth/v1/beacon/headers?slot=${slot}`);
      if (r.status === 200) {
        const j = await r.json();
        if (Array.isArray(j.data) && j.data.length > 0) {
          return j.data[0];
        }
      }
      // Lodestar may return 404/empty until the slot is produced; just retry
    } catch {
      // transient, retry
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for header at slot ${slot}`);
}

//---------------------------------------------
// Main
//---------------------------------------------
async function main() {
  // Connect to Kurtosis engine
  const contextResult = await KurtosisContext.newKurtosisContextFromLocalEngine();
  if (contextResult.isErr()) throw contextResult.error;
  const kurtosisContext = contextResult.value;
  console.log("✅ Connected to Kurtosis engine");

  // Create enclave
  const enclaveResult = await kurtosisContext.createEnclave(enclaveName);
  if (enclaveResult.isErr()) throw enclaveResult.error;
  const enclaveContext = enclaveResult.value;
  console.log(`✅ Enclave '${enclaveName}' created`);

  // Run the ethpandaops package with hardcoded JSON input
  const runConfig = new StarlarkRunConfig(
    StarlarkRunConfig.WithSerializedParams(inputArgs),
    StarlarkRunConfig.WithDryRun(false)
  );
  const pkg = "github.com/ethpandaops/ethereum-package";
  const runResult = await enclaveContext.runStarlarkRemotePackageBlocking(pkg, runConfig);
  if (runResult.isErr()) throw runResult.error;
  console.log("✅ Package run result:", runResult.value);
  const run = runResult.value;

  if ((run as any).executionError) {
    console.error("❌ Package executionError (a service likely failed to start):\n", (run as any).executionError);
    throw new Error("Beacon services failed to start. See executionError above.");
  }

  //---------------------------------------------
  // Discover beacon services and build base URLs
  //---------------------------------------------

  const servicesResult = await enclaveContext.getServices();
  if (servicesResult.isErr()) throw servicesResult.error;
  const services = servicesResult.value;

  // Heuristic: beacon (CL) services are prefixed with "cl-" in this package.
  const beaconServiceNames = [...services.keys()].filter(n => n.startsWith("cl-"));
  if (beaconServiceNames.length === 0) {
    throw new Error("No beacon services discovered (names starting with 'cl-').");
  }

  // Build a map of serviceName: baseUrl (using published host port for 'http')
  const beaconUrls: Record<string, string> = {};
  for (const name of beaconServiceNames) {
    const ctxRes = await enclaveContext.getServiceContext(name);
    if (ctxRes.isErr()) throw ctxRes.error;
    const svc = ctxRes.value;
    const pub = svc.getPublicPorts();
    const httpPort = pub.get("http")?.number;
    if (!httpPort) throw new Error(`Beacon ${name} has no published 'http' port`);
    beaconUrls[name] = `http://localhost:${httpPort}`;
  }

  // ---------------------------------------------
  // SLOT=1 Node Assertion (Assert | Capture | Remove)
  // ---------------------------------------------
  const slotToAssert = 1;

  for (const [name, baseUrl] of Object.entries(beaconUrls)) {
    console.log(`\n🔎 [${name}] Node assertion @ slot=${slotToAssert} - health check...`);
    await checkHealth(baseUrl); // Assert

    // NEW: wait until the slot should exist, based on the node's own timing
    await waitUntilSlotExists(baseUrl, slotToAssert, /*extraBufferMs*/ 3000, run.runOutput as unknown as string);


    console.log(`🔎 [${name}] Waiting for header at slot=${slotToAssert}...`);
    const header = await waitForHeaderAtSlot(baseUrl, slotToAssert, /*timeoutMs*/ 90_000, /*interval*/ 1_000); // Assert
    console.log(`✅ [${name}] Found header at slot=${slotToAssert}: ${header?.root ?? "(no-root)"}  (CAPTURE)`);

    // Extra capture: identity + syncing state
    const identity = await getIdentity(baseUrl).catch(() => null);
    const syncing = await getSyncing(baseUrl).catch(() => null);
    if (identity) console.log(`📇 [${name}] Identity (CAPTURE): ${JSON.stringify(identity)}`);
    if (syncing)  console.log(`📊 [${name}] Syncing  (CAPTURE): ${JSON.stringify(syncing)}`);
  }

  console.log("\n✅ Slot=1 node assertions succeeded for all beacon nodes. (REMOVE: run once and done)\n");

  // ---------------------------------------------
  // Log of EL services/ports 
  // ---------------------------------------------
  for (const [serviceName] of services) {
    const serviceResult = await enclaveContext.getServiceContext(serviceName);
    if (serviceResult.isErr()) throw serviceResult.error;
    const service = serviceResult.value;
    console.log(`🔧 Service: ${serviceName}`);
    console.log("   Public Ports:", service.getPublicPorts());
    console.log("   Private Ports:", service.getPrivatePorts());
  }

  // Clean up the enclave 
  console.log("🧹 Cleaning up the enclave...");
  await kurtosisContext.destroyEnclave(enclaveName);
  console.log("✅ Enclave destroyed");
}

main().catch((err) => {
  console.error("❌ Error running Kurtosis script:", err);
  process.exit(1);
});
