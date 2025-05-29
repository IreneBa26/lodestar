import {ForkName} from "@lodestar/params";
import {describe, expect, it} from "vitest";
import {
  AddBlob,
  AddBlock,
  BlockInputBlobs,
  BlockInputSource,
  CreateBlockInputMeta,
  ForkBlobsDA,
} from "../../../../src/chain/blocks/blockInput/index.js";
import {buildBlockAndBlobsTestSet} from "../../../utils/blocksAndData.js";

const testCases: {name: string; blobCount: number; blobsBeforeBlock: number}[] = [
  {
    name: "no blobs",
    blobCount: 0,
    blobsBeforeBlock: 0,
  },
  {
    name: "1 blob, block first",
    blobCount: 1,
    blobsBeforeBlock: 0,
  },
  {
    name: "1 blob, blob first",
    blobCount: 1,
    blobsBeforeBlock: 1,
  },
  {
    name: "6 blobs, block first",
    blobCount: 6,
    blobsBeforeBlock: 0,
  },
  {
    name: "4 blobs, block in middle",
    blobCount: 4,
    blobsBeforeBlock: 2,
  },
  {
    name: "3 blobs, block in end",
    blobCount: 3,
    blobsBeforeBlock: 3,
  },
];

type TestCaseArray = (AddBlock<ForkBlobsDA> | AddBlob) & CreateBlockInputMeta;

describe("BlockInput", () => {
  describe("Blob timing", () => {
    for (const {name, blobCount, blobsBeforeBlock} of testCases) {
      it(name, () => {
        const {block, rootHex, blobSidecars} = buildBlockAndBlobsTestSet(ForkName.deneb, blobCount);
        const testArray: TestCaseArray[] = [];
        for (let i = 0; i < blobsBeforeBlock; i++) {
          const blobSidecar = blobSidecars.shift();
          if (!blobSidecar) throw new Error("must have blobSidecar to add to TestCaseArray");
          testArray.push({
            blobSidecar,
            blockRootHex: rootHex,
            daOutOfRange: false,
            forkName: ForkName.deneb,
            seenTimestampSec: Date.now(),
            source: BlockInputSource.gossip,
          } as AddBlob & CreateBlockInputMeta);
        }
        testArray.push({
          block,
          blockRootHex: rootHex,
          daOutOfRange: false,
          forkName: ForkName.deneb,
          source: {
            source: BlockInputSource.gossip,
            seenTimestampSec: Date.now(),
          },
        } as AddBlock<ForkBlobsDA> & CreateBlockInputMeta);
        for (const blobSidecar of blobSidecars) {
          testArray.push({
            blobSidecar,
            blockRootHex: rootHex,
            daOutOfRange: false,
            forkName: ForkName.deneb,
            seenTimestampSec: Date.now(),
            source: BlockInputSource.gossip,
          } as AddBlob & CreateBlockInputMeta);
        }

        let blockInput: BlockInputBlobs;
        let testCaseEntry = testArray.shift();
        if (!testCaseEntry) throw new Error("undefined testCaseEntry state. debug unit test");
        if ("block" in testCaseEntry) {
          blockInput = BlockInputBlobs.createFromBlock(testCaseEntry);
          expect(blockInput.hasBlock()).toBeTruthy();
          expect(blockInput.hasBlob(0)).toBeFalsy();
          if (blobCount === 0) {
            expect(blockInput.hasAllData()).toBeTruthy();
          } else {
            expect(blockInput.hasAllData()).toBeFalsy();
          }
        } else {
          blockInput = BlockInputBlobs.createFromBlob(testCaseEntry as AddBlob & CreateBlockInputMeta);
          expect(blockInput.hasBlock()).toBeFalsy();
          expect(blockInput.hasBlob(0)).toBeTruthy();
          // expect falsy here because block/blobCount not known yet
          expect(blockInput.hasAllData()).toBeFalsy();
        }

        for (testCaseEntry of testArray) {
          if ("block" in testCaseEntry) {
            expect(blockInput.hasBlock()).toBeFalsy();
            blockInput.addBlock(testCaseEntry);
            expect(blockInput.hasBlock()).toBeTruthy();
          } else {
            expect(blockInput.hasAllData()).toBeFalsy();
            expect(blockInput.hasBlob(testCaseEntry.blobSidecar.index)).toBeFalsy();
            blockInput.addBlob(testCaseEntry as AddBlob);
            expect(blockInput.hasBlob(testCaseEntry.blobSidecar.index)).toBeTruthy();
          }
        }
        expect(blockInput.hasAllData()).toBeTruthy();
      });
    }
  });
});
