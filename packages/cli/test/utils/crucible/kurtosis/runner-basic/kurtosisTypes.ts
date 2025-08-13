//Basic version of KurtosisSeriveMap returning a ServiceContext
// Basic vs advanced: Different shape of returned service objects
/*
* Basic: Map("lodestar_1" => ServiceContext)
*
* Enriched: {
    "lodestar_1": {
      serviceContext: ServiceContext,
      beaconApiUrl: "http://localhost:PORT"
    },
    ...
  }
*/

import { ServiceContext } from "kurtosis-sdk";

// Core config passed to the Kurtosis runner
export type KurtosisNetworkConfig = {
  participants: Array<{
    el_type: string;
    cl_type: string;
    cl_image?: string;
    count?: number;
    cl_extra_params?: string[];
    el_extra_params?: string[];
  }>;
  additional_services?: string[];
  network_params: Record<string, any>;
};

// Map of service name → Kurtosis ServiceContext
export type KurtosisServicesMap = Map<string, ServiceContext>;
