/**
 * Initial steps for testing the Kurtosis enclave endpoints logic with kurtosis-sdk (basic)
 * Will be integrated into the main Kurtosis testing framework as migration result
 */

import * as fs from "node:fs";
import {KurtosisContext, StarlarkRunConfig} from "kurtosis-sdk";
import {parse as parseYAML} from "yaml";

const enclaveName = "runner-enclave";

// Load args from the multi-fork YAML file
const yamlText = fs.readFileSync("packages/cli/test/sim/multiFork.yml", "utf8");
const parsed = parseYAML(yamlText);
const inputArgs = JSON.stringify(parsed);

// main
async function main() {
  // Connect to the local Kurtosis engine
  const contextResult = await KurtosisContext.newKurtosisContextFromLocalEngine();
  if (contextResult.isErr()) throw contextResult.error;
  const kurtosisContext = contextResult.value;
  console.log("✅ Connected to Kurtosis engine");

  // Create a new enclave
  const enclaveResult = await kurtosisContext.createEnclave(enclaveName);
  if (enclaveResult.isErr()) throw enclaveResult.error;
  const enclaveContext = enclaveResult.value;
  console.log(`✅ Enclave '${enclaveName}' created`);

  // Prepare the Starlark run config with the args YAML as input
  const runConfig = new StarlarkRunConfig(
    StarlarkRunConfig.WithSerializedParams(inputArgs),
    StarlarkRunConfig.WithDryRun(false)
  );

  // Run the ethereum-package from ethpandaops
  const pkg = "github.com/ethpandaops/ethereum-package";
  const runResult = await enclaveContext.runStarlarkRemotePackageBlocking(pkg, runConfig);
  if (runResult.isErr()) throw runResult.error;
  console.log("✅ Package run result:", runResult.value);

  //---------------------------------------------
  // Discover beacon services and build base URLs
  //---------------------------------------------
  const servicesResult = await enclaveContext.getServices();
  if (servicesResult.isErr()) throw servicesResult.error;
  const services = servicesResult.value;

  // Heuristic: beacon (CL) services are prefixed with "cl-" in this package.
  const beaconServiceNames = [...services.keys()].filter((n) => n.startsWith("cl-"));
  if (beaconServiceNames.length === 0) {
    throw new Error("No beacon services discovered (names starting with 'cl-').");
  }

  // Build a map of serviceName -> baseUrl (using published host port for 'http')
  const beaconUrls: Record<string, string> = {};
  for (const name of beaconServiceNames) {
    const ctxRes = await enclaveContext.getServiceContext(name);
    if (ctxRes.isErr()) throw ctxRes.error;
    const svc = ctxRes.value;
    const pub = svc.getPublicPorts();
    const httpPort = pub.get("http")?.number;
    if (!httpPort) throw new Error(`Beacon ${name} has no published 'http' port`);
    beaconUrls[name] = `http://localhost:${httpPort}`;
    console.log("URLs: ", beaconUrls[name]); // print Kurtosis URLs
  }

  for (const [serviceName] of services) {
    const serviceResult = await enclaveContext.getServiceContext(serviceName);
    if (serviceResult.isErr()) throw serviceResult.error;
    const service = serviceResult.value;
    console.log(`🔧 Service: ${serviceName}`);
    console.log("   Public Ports:", service.getPublicPorts());
    console.log("   Private Ports:", service.getPrivatePorts());
  }

  // Cleanup (optional, or comment out for debugging)
  console.log("🧹 Cleaning up the enclave...");
  await kurtosisContext.destroyEnclave(enclaveName);
  console.log("✅ Enclave destroyed");
}

main().catch((err) => {
  console.error("❌ Error running Kurtosis script:", err);
  process.exit(1);
});
