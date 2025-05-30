import {randomBytes} from "node:crypto";
import {createChainForkConfig, defaultChainConfig} from "@lodestar/config";
import {
  BYTES_PER_FIELD_ELEMENT,
  FIELD_ELEMENTS_PER_BLOB,
  ForkPostCapella,
  ForkPostDeneb,
  isForkPostDeneb,
} from "@lodestar/params";
import {computeStartSlotAtEpoch, signedBlockToSignedHeader} from "@lodestar/state-transition";
import {SignedBeaconBlock, deneb, ssz} from "@lodestar/types";
import {toRootHex} from "@lodestar/utils";
import {VersionedHashes} from "../../src/execution/index.js";
import {computeInclusionProof, kzgCommitmentToVersionedHash} from "../../src/util/blobs.js";
import {ckzg} from "../../src/util/kzg.js";

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

export function buildBlockTestSet<F extends ForkPostCapella = ForkPostCapella>(
  forkName: F,
  slot?: number,
  parentRoot?: Uint8Array
): BlockTestSet<F> {
  const block = ssz[forkName].SignedBeaconBlock.defaultValue();
  block.message.slot = slot ? slot : slots[forkName];
  if (parentRoot) {
    block.message.parentRoot = parentRoot;
  }
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
  const {
    block: childBlock,
    blockRoot: childBlockRoot,
    rootHex: childRootHex,
  } = buildBlockTestSet(forkName, parentBlock.message.slot + 1);
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

export function generateBlobSidecars(
  forkName: ForkPostDeneb,
  block: SignedBeaconBlock<ForkPostDeneb>,
  count: number
): {blobSidecars: deneb.BlobSidecars; blobKzgCommitments: Uint8Array[]; versionedHashes: VersionedHashes} {
  const blobKzgCommitments: Uint8Array[] = [];
  const blobSidecars: deneb.BlobSidecars = [];

  const signedBlockHeader = signedBlockToSignedHeader(config, block);
  for (let index = 0; index < count; index++) {
    const blobSidecar = ssz[forkName].BlobSidecar.defaultValue();
    blobSidecar.index = index;
    blobSidecar.signedBlockHeader = signedBlockHeader;
    blobSidecar.blob = Uint8Array.from(randomBytes(FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT));
    blobSidecar.kzgCommitment = ckzg.blobToKzgCommitment(blobSidecar.blob);
    blobSidecar.kzgCommitmentInclusionProof = computeInclusionProof(forkName, block.message.body, index);
    blobSidecar.kzgProof = ckzg.computeBlobKzgProof(blobSidecar.blob, blobSidecar.kzgCommitment);

    blobSidecars.push(blobSidecar);
    blobKzgCommitments.push(blobSidecar.kzgCommitment);
  }

  const versionedHashes = blobKzgCommitments.map((commitment) => kzgCommitmentToVersionedHash(commitment));

  return {
    blobSidecars,
    blobKzgCommitments,
    versionedHashes,
  };
}

export type BlockAndBlobTestSet<F extends ForkPostDeneb = ForkPostDeneb> = BlockTestSet<F> & {
  blobSidecars: deneb.BlobSidecars;
  versionedHashes: VersionedHashes;
};
export function buildBlockAndBlobsTestSet<
  F extends ForkPostCapella,
  R extends F extends ForkPostDeneb ? BlockAndBlobTestSet<F> : BlockTestSet<F>,
>(forkName: F, numberOfBlobs: number, slot?: number, parentRoot?: Uint8Array): R {
  const {block, blockRoot, rootHex} = buildBlockTestSet<F>(forkName, slot, parentRoot);

  let blobSidecars: undefined | deneb.BlobSidecars;
  let versionedHashes: undefined | VersionedHashes;
  if (isForkPostDeneb(forkName)) {
    const {
      blobKzgCommitments,
      blobSidecars: blobs,
      versionedHashes: hashes,
    } = generateBlobSidecars(forkName, block as SignedBeaconBlock<ForkPostDeneb>, numberOfBlobs);
    (block as SignedBeaconBlock<ForkPostDeneb>).message.body.blobKzgCommitments = blobKzgCommitments;
    blobSidecars = blobs;
    versionedHashes = hashes;
  }

  return {
    block,
    blockRoot,
    rootHex,
    blobSidecars,
    versionedHashes,
  } as R;
}

export function buildBatchOfBlockWithBlobs<
  F extends ForkPostCapella,
  R extends F extends ForkPostDeneb ? BlockAndBlobTestSet<F> : BlockTestSet<F>,
>(forkName: F, startSlot: number, count: number, minBlobs: number, maxBlobs: number): R[] {
  const blocks: R[] = [];
  let parentRoot = Uint8Array.from(randomBytes(32));
  for (let slot = startSlot; slot < startSlot + count; slot++) {
    const numberOfBlobs = Math.random() * (maxBlobs + 1 - minBlobs) + minBlobs;
    const blockMaybeBlobs = buildBlockAndBlobsTestSet<F, R>(forkName, numberOfBlobs, slot, parentRoot);
    parentRoot = blockMaybeBlobs.blockRoot;
    blocks.push(blockMaybeBlobs as R);
  }
  return blocks;
}
