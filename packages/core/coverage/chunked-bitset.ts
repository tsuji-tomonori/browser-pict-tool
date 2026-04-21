const DEFAULT_CHUNK_BITS = 16_384;
const WORD_BITS = 32;
const WORDS_PER_CHUNK = DEFAULT_CHUNK_BITS / WORD_BITS;

export interface ChunkedBitset {
  readonly totalBits: number;
  get(bit: number): boolean;
  set(bit: number): void;
  popcount(): number;
}

function popcountWord(word: number): number {
  let current = word >>> 0;
  current -= (current >>> 1) & 0x55555555;
  current = (current & 0x33333333) + ((current >>> 2) & 0x33333333);
  return (((current + (current >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function getChunkIndex(bit: number): number {
  return Math.floor(bit / DEFAULT_CHUNK_BITS);
}

function getWordIndex(bit: number): number {
  return Math.floor((bit % DEFAULT_CHUNK_BITS) / WORD_BITS);
}

function getBitOffset(bit: number): number {
  return bit & (WORD_BITS - 1);
}

function assertBitIndex(bit: number, totalBits: number): void {
  if (!Number.isInteger(bit) || bit < 0 || bit >= totalBits) {
    throw new RangeError(`bit index out of range: ${bit}`);
  }
}

export function createChunkedBitset(totalBits: number): ChunkedBitset {
  if (!Number.isInteger(totalBits) || totalBits < 0) {
    throw new RangeError(`totalBits must be a non-negative integer: ${totalBits}`);
  }

  const chunks = new Map<number, Uint32Array>();

  return {
    totalBits,
    get(bit) {
      if (!Number.isInteger(bit) || bit < 0 || bit >= totalBits) {
        return false;
      }

      const chunk = chunks.get(getChunkIndex(bit));
      if (!chunk) {
        return false;
      }

      return (chunk[getWordIndex(bit)] & (1 << getBitOffset(bit))) !== 0;
    },
    set(bit) {
      assertBitIndex(bit, totalBits);

      const chunkIndex = getChunkIndex(bit);
      let chunk = chunks.get(chunkIndex);
      if (!chunk) {
        chunk = new Uint32Array(WORDS_PER_CHUNK);
        chunks.set(chunkIndex, chunk);
      }

      chunk[getWordIndex(bit)] |= 1 << getBitOffset(bit);
    },
    popcount() {
      let count = 0;

      for (const chunk of chunks.values()) {
        for (const word of chunk) {
          count += popcountWord(word);
        }
      }

      return count;
    },
  };
}
