//Sdvanced version of KurtosisSeriveMap returning a NodeService for more detailled metadata
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

// Core simulation config passed to Kurtosis runner
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

// Optional enrichment for nodes
export type NodeRoles = {
  beacon?: boolean;
  validator?: boolean;
  execution?: boolean;
};

// Future extensible service wrapper
export type NodeService = {
  id: string;
  serviceContext: ServiceContext;
  beaconApiUrl?: string;
  roles?: NodeRoles;
  metadata?: Record<string, any>;
};

// Map of all services (used by test runner and tracker)
export type KurtosisServicesMap = Map<string, NodeService>;
