import {createChainForkConfig, defaultChainConfig} from "@lodestar/config";
import {ForkPostCapella, ForkPostDeneb} from "@lodestar/params";
import {computeStartSlotAtEpoch, signedBlockToSignedHeader} from "@lodestar/state-transition";
import {SignedBeaconBlock, deneb, ssz} from "@lodestar/types";
import {toRootHex} from "@lodestar/utils";

export const CAPELLA_FORK_EPOCH = 0;
export const DENEB_FORK_EPOCH = 1;
export const ELECTRA_FORK_EPOCH = 2;
export const FULU_FORK_EPOCH = 3;
export const config = createChainForkConfig({
  ...defaultChainConfig,
  CAPELLA_FORK_EPOCH,
  DENEB_FORK_EPOCH,
  ELECTRA_FORK_EPOCH,
  FULU_FORK_EPOCH,
});

export const slots: Record<ForkPostCapella, number> = {
  capella: computeStartSlotAtEpoch(CAPELLA_FORK_EPOCH),
  deneb: computeStartSlotAtEpoch(DENEB_FORK_EPOCH),
  electra: computeStartSlotAtEpoch(ELECTRA_FORK_EPOCH),
  fulu: computeStartSlotAtEpoch(FULU_FORK_EPOCH),
};

export type BlockTestSet<F extends ForkPostCapella> = {
  block: SignedBeaconBlock<F>;
  blockRoot: Uint8Array;
  rootHex: string;
};

export function buildBlockTestSet<F extends ForkPostCapella = ForkPostCapella>(forkName: F): BlockTestSet<F> {
  const block = ssz[forkName].SignedBeaconBlock.defaultValue();
  block.message.slot = slots[forkName];
  const blockRoot = ssz[forkName].BeaconBlock.hashTreeRoot(block.message as any);
  const rootHex = toRootHex(blockRoot);
  return {
    block,
    blockRoot,
    rootHex,
  };
}

export type ParentAndChildBlockTestSet<F extends ForkPostCapella> = {
  parentBlock: SignedBeaconBlock<F>;
  parentBlockRoot: Uint8Array;
  parentRootHex: string;
  childBlock: SignedBeaconBlock<F>;
  childBlockRoot: Uint8Array;
  childRootHex: string;
};
export function buildParentAndChildBlockTestSet<F extends ForkPostCapella = ForkPostCapella>(
  forkName: F
): ParentAndChildBlockTestSet<F> {
  const {block: parentBlock, blockRoot: parentBlockRoot, rootHex: parentRootHex} = buildBlockTestSet(forkName);
  const {block: childBlock, blockRoot: childBlockRoot, rootHex: childRootHex} = buildBlockTestSet(forkName);
  childBlock.message.slot = parentBlock.message.slot + 1;
  childBlock.message.parentRoot = parentBlockRoot;
  return {
    parentBlock,
    parentBlockRoot,
    parentRootHex,
    childBlock,
    childBlockRoot,
    childRootHex,
  };
}

export type BlockAndBlobTestSet<F extends ForkPostDeneb = ForkPostDeneb> = BlockTestSet<F> & {
  blobSidecars: deneb.BlobSidecars;
};
export function buildBlockAndBlobsTestSet(
  forkName: ForkPostDeneb,
  numberOfBlobs: number
): BlockAndBlobTestSet<ForkPostDeneb> {
  const {block, blockRoot, rootHex} = buildBlockTestSet<ForkPostDeneb>(forkName);
  const commitments = Array.from({length: numberOfBlobs}, () => Buffer.alloc(48, 0x77));
  block.message.body.blobKzgCommitments = commitments;
  const signedBlockHeader = signedBlockToSignedHeader(config, block);
  const blobSidecars: deneb.BlobSidecars = [];
  for (const kzgCommitment of commitments) {
    const blobSidecar = ssz[forkName].BlobSidecar.defaultValue();
    blobSidecar.index = blobSidecars.length;
    blobSidecar.signedBlockHeader = signedBlockHeader;
    blobSidecar.kzgCommitment = kzgCommitment;
    blobSidecars.push(blobSidecar);
  }

  return {
    block,
    blockRoot,
    rootHex,
    blobSidecars,
  };
}
