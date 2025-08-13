/**
 * Kurtosis SDK Runner basic version
 */

import {
  KurtosisContext,
  StarlarkRunConfig,
  EnclaveContext,
} from "kurtosis-sdk";
import { KurtosisNetworkConfig, KurtosisServicesMap,} from "./kurtosisTypes";
import { IRunner, RunnerEvent } from "./interfaces-kurtosis";

export class KurtosisSDKRunner implements IRunner {
  private enclaveName: string;
  private kurtosisContext?: KurtosisContext;
  private enclaveContext?: EnclaveContext;
  //private services?: KurtosisServicesMap;

  constructor(enclaveName = "crucible-enclave") {
    this.enclaveName = enclaveName;
  }

  async start(enclaveName: string): Promise<void> {
    // Create engine context
    const contextResult = await KurtosisContext.newKurtosisContextFromLocalEngine();
    if (contextResult.isErr()) throw contextResult.error;
    this.kurtosisContext = contextResult.value;
  
    // Keep enclave identity in state
    this.enclaveName = enclaveName;
  
    // Create enclave and store its context
    const enclaveResult = await this.kurtosisContext.createEnclave(this.enclaveName);
    if (enclaveResult.isErr()) throw enclaveResult.error;
    this.enclaveContext = enclaveResult.value;
  }

  async stop(): Promise<void> {
    if (this.kurtosisContext && this.enclaveName) {
      await this.kurtosisContext.destroyEnclave(this.enclaveName);
    }
  }

  async create(config: KurtosisNetworkConfig): Promise<KurtosisServicesMap> {
    if (!this.enclaveContext) {
      throw new Error("Enclave context not initialized. Did you call start()?");
    }

    const serializedParams = JSON.stringify(config);
    const runConfig = new StarlarkRunConfig(
      StarlarkRunConfig.WithSerializedParams(serializedParams),
      StarlarkRunConfig.WithDryRun(false)
    );

    // Run ethereum-package
    const pkg = "github.com/ethpandaops/ethereum-package";
    const runResult = await this.enclaveContext.runStarlarkRemotePackageBlocking(pkg, runConfig);
    if (runResult.isErr()) throw runResult.error;

    const run = runResult.value as any;
    if (run.executionError) {
      throw new Error(`Package executionError: ${run.executionError}`);
    }

    const servicesResult = await this.enclaveContext.getServices();
    if (servicesResult.isErr()) throw servicesResult.error;

    const services: KurtosisServicesMap = new Map(); //Mapping Kurtosis services

    for (const [serviceName] of servicesResult.value) {
      const ctxResult = await this.enclaveContext.getServiceContext(serviceName);
      if (ctxResult.isErr()) throw ctxResult.error;
      services.set(serviceName, ctxResult.value);
    }

    //this.services = services;
    return services;
  }

  on(event: RunnerEvent, cb: (id: string) => void | Promise<void>): void {
     // TODO: Event handling not implemented yet
  }
}
