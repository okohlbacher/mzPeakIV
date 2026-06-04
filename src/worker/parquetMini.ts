/**
 * parquetMini.ts — build a minimal valid Parquet Uint8Array from pre-fetched
 * compressed column chunk bytes, using a hand-rolled Thrift compact encoder.
 *
 * This solves the parquet-wasm column-projection limitation: requesting
 * "scan.IMS_1000050_position_x" causes parquet-wasm to read the entire
 * ~500 MB `scan` parent column. Instead we:
 *   1. Use parquet-wasm metadata API (footer read, ~33 KB) to get byte offsets.
 *   2. Fetch target columns directly via RemoteBlob.slice() (total ~188 KB).
 *   3. Construct a valid minimal Parquet file in memory.
 *   4. Feed to parquet-wasm for ZSTD + RLE_DICTIONARY decoding.
 *
 * Thrift compact binary protocol: zigzag i32/i64 + unsigned varint,
 * struct fields inline (NOT length-prefixed like BINARY), STOP = 0x00.
 */

// ---------------------------------------------------------------------------
// Thrift compact binary encoder
// ---------------------------------------------------------------------------

const T = {
  BOOLEAN_TRUE: 1, BOOLEAN_FALSE: 2, BYTE: 3, I16: 4, I32: 5, I64: 6,
  DOUBLE: 7, BINARY: 8, LIST: 9, SET: 10, MAP: 11, STRUCT: 12,
};

class W {
  private b: number[] = [];

  /** Write a single byte. */
  byte(v: number) { this.b.push(v & 0xff); }

  /** Write raw bytes inline (no length prefix — for struct embedding). */
  raw(data: Uint8Array) { for (const b of data) this.b.push(b); }

  /** STOP byte (end of struct). */
  stop() { this.b.push(0); }

  /**
   * Unsigned varint (7 bits per byte, MSB = continuation bit).
   * Used for: list element counts, string/binary lengths.
   */
  uvarint(n: number) {
    while (n > 0x7f) { this.byte((n & 0x7f) | 0x80); n >>>= 7; }
    this.byte(n);
  }

  /**
   * Zigzag-encoded i32 written as unsigned varint.
   * Thrift compact uses zigzag for all i32/i64 fields.
   */
  i32(n: number) {
    let zz = ((n << 1) ^ (n >> 31)) >>> 0;
    while (zz > 0x7f) { this.byte((zz & 0x7f) | 0x80); zz >>>= 7; }
    this.byte(zz);
  }

  /**
   * Zigzag-encoded i64 written as unsigned varint.
   */
  i64(n: number | bigint) {
    const bn = BigInt(n);
    let zz = bn >= 0n ? bn << 1n : ~(bn << 1n);
    while (zz > 0x7fn) { this.byte(Number(zz & 0x7fn) | 0x80); zz >>= 7n; }
    this.byte(Number(zz));
  }

  /** UTF-8 string: length (unsigned varint) + bytes. */
  str(s: string) {
    const bytes = new TextEncoder().encode(s);
    this.uvarint(bytes.length);
    for (const b of bytes) this.byte(b);
  }

  /** Binary blob: length (unsigned varint) + bytes. */
  bin(data: Uint8Array) {
    this.uvarint(data.length);
    for (const b of data) this.byte(b);
  }

  /**
   * Compact field header.
   * @param prev  Previous field ID in this struct (0 at start).
   * @param id    Current field ID.
   * @param type  Thrift compact type code.
   * @returns     id (for use as next `prev`).
   */
  fh(prev: number, id: number, type: number): number {
    const delta = id - prev;
    if (delta > 0 && delta <= 15) {
      this.byte((delta << 4) | type);
    } else {
      // Long form: 0 byte + i16 field id (NOT zigzag, raw i16)
      this.byte(type);
      this.byte(id & 0xff);
      this.byte((id >> 8) & 0xff);
    }
    return id;
  }

  /**
   * List header.
   * @param elemType  Thrift compact type of elements.
   * @param count     Number of elements.
   */
  list(elemType: number, count: number) {
    if (count < 15) {
      this.byte((count << 4) | elemType);
    } else {
      this.byte(0xf0 | elemType);
      this.uvarint(count);
    }
  }

  toBytes(): Uint8Array { return new Uint8Array(this.b); }
}

// ---------------------------------------------------------------------------
// Parquet constants
// ---------------------------------------------------------------------------

// Parquet type constants (values match the Parquet Thrift enum)
export const PType  = { BOOLEAN: 0, INT32: 0, INT64: 2, INT96: 3, FLOAT: 4, DOUBLE: 5, BYTE_ARRAY: 6 };
export const Codec  = { UNCOMPRESSED: 0, SNAPPY: 1, GZIP: 2, BROTLI: 3, ZSTD: 6 };
export const Enc    = { PLAIN: 0, PLAIN_DICTIONARY: 2, RLE: 3, BIT_PACKED: 4, RLE_DICTIONARY: 8 };
const Rep    = { REQUIRED: 0, OPTIONAL: 1, REPEATED: 2 };

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ColChunk {
  /** Dot-separated column path e.g. ["scan","IMS_1000050_position_x"] */
  path: string[];
  parquetType: number;           // PType.*
  codec: number;                 // Codec.*
  encodings: number[];           // Enc.*
  data: Uint8Array;              // raw compressed Parquet page bytes
  numValues: number;
  uncompressedSize: number;
}

/**
 * Build a minimal valid Parquet file Uint8Array from pre-fetched column data.
 * Feed the result to parquet-wasm's readParquetStream() for decoding.
 */
export function buildMiniParquet(cols: ColChunk[], numRows: number): Uint8Array {
  const MAGIC = Uint8Array.from([80, 65, 82, 49]); // "PAR1"

  // Column chunks start immediately after the 4-byte leading magic.
  const offsets: number[] = [];
  let pos = 4;
  for (const col of cols) {
    offsets.push(pos);
    pos += col.data.length;
  }

  const footer = encodeFooter(cols, offsets, numRows);

  // Assemble: PAR1 + column data + footer + footer_len_LE4 + PAR1
  const total = 4 + cols.reduce((s, c) => s + c.data.length, 0) + footer.length + 4 + 4;
  const out = new Uint8Array(total);
  let p = 0;
  out.set(MAGIC, p); p += 4;
  for (const col of cols) { out.set(col.data, p); p += col.data.length; }
  out.set(footer, p); p += footer.length;
  // Footer length as 4-byte LE int
  const fl = footer.length;
  out[p++] = fl & 0xff; out[p++] = (fl >> 8) & 0xff;
  out[p++] = (fl >> 16) & 0xff; out[p++] = (fl >> 24) & 0xff;
  out.set(MAGIC, p);
  return out;
}

// ---------------------------------------------------------------------------
// Footer (Thrift compact FileMetaData)
// ---------------------------------------------------------------------------

function encodeFooter(cols: ColChunk[], offsets: number[], numRows: number): Uint8Array {
  // Build flat schema list:
  // Root schema element (required by Parquet) → parent structs → leaf columns
  const parents: string[] = [];
  for (const col of cols) {
    if (col.path.length > 1) {
      const p = col.path[0];
      if (!parents.includes(p)) parents.push(p);
    }
  }
  // Count children per parent
  const childCount = new Map<string, number>();
  for (const col of cols) {
    if (col.path.length > 1) {
      childCount.set(col.path[0], (childCount.get(col.path[0]) ?? 0) + 1);
    }
  }
  const topLevelCount = parents.length + cols.filter(c => c.path.length === 1).length;

  const w = new W();
  let fid = 0;

  // field 1: version = 2 (FORMAT_VERSION_2)
  fid = w.fh(fid, 1, T.I32); w.i32(2);

  // field 2: schema (list<SchemaElement>)
  fid = w.fh(fid, 2, T.LIST);
  {
    const schemaCount = 1 + parents.length + cols.length; // root + parents + leaves
    w.list(T.STRUCT, schemaCount);

    // Root message element
    writeSchemaElement(w, "schema", undefined, Rep.REQUIRED, topLevelCount);

    // Parent structs (no type = group/struct)
    for (const parent of parents) {
      writeSchemaElement(w, parent, undefined, Rep.OPTIONAL, childCount.get(parent) ?? 1);
    }

    // Leaf columns
    for (const col of cols) {
      writeSchemaElement(w, col.path[col.path.length - 1], col.parquetType, Rep.OPTIONAL, undefined);
    }
  }

  // field 3: num_rows
  fid = w.fh(fid, 3, T.I64); w.i64(numRows);

  // field 4: row_groups (list<RowGroup>)
  fid = w.fh(fid, 4, T.LIST);
  {
    w.list(T.STRUCT, 1);
    writeRowGroup(w, cols, offsets, numRows);
  }

  w.stop(); // end FileMetaData
  return w.toBytes();
}

function writeSchemaElement(
  w: W,
  name: string,
  type: number | undefined,
  repetition: number,
  numChildren: number | undefined,
) {
  let f = 0;
  if (type !== undefined) { f = w.fh(f, 1, T.I32); w.i32(type); }
  f = w.fh(f, 3, T.I32); w.i32(repetition);
  f = w.fh(f, 4, T.BINARY); w.str(name);
  if (numChildren !== undefined) { f = w.fh(f, 5, T.I32); w.i32(numChildren); }
  w.stop();
}

function writeRowGroup(w: W, cols: ColChunk[], offsets: number[], numRows: number) {
  let f = 0;

  // field 1: columns (list<ColumnChunk>)
  f = w.fh(f, 1, T.LIST);
  w.list(T.STRUCT, cols.length);
  for (let i = 0; i < cols.length; i++) {
    writeColumnChunk(w, cols[i], offsets[i]);
  }

  // field 2: total_byte_size
  f = w.fh(f, 2, T.I64);
  w.i64(cols.reduce((s, c) => s + c.data.length, 0));

  // field 3: num_rows
  f = w.fh(f, 3, T.I64); w.i64(numRows);

  w.stop();
}

function writeColumnChunk(w: W, col: ColChunk, offset: number) {
  let f = 0;

  // field 2: file_offset
  f = w.fh(f, 2, T.I64); w.i64(offset);

  // field 3: meta_data (ColumnMetaData struct — inline, NOT length-prefixed)
  f = w.fh(f, 3, T.STRUCT);
  writeColumnMetaData(w, col, offset);

  w.stop();
}

function writeColumnMetaData(w: W, col: ColChunk, dataPageOffset: number) {
  let f = 0;

  // field 1: type
  f = w.fh(f, 1, T.I32); w.i32(col.parquetType);

  // field 2: encodings (list<Encoding>)
  f = w.fh(f, 2, T.LIST);
  w.list(T.I32, col.encodings.length);
  for (const enc of col.encodings) w.i32(enc);

  // field 3: path_in_schema (list<string>)
  f = w.fh(f, 3, T.LIST);
  w.list(T.BINARY, col.path.length);
  for (const part of col.path) w.str(part);

  // field 4: codec
  f = w.fh(f, 4, T.I32); w.i32(col.codec);

  // field 5: num_values
  f = w.fh(f, 5, T.I64); w.i64(col.numValues);

  // field 6: total_uncompressed_size
  f = w.fh(f, 6, T.I64); w.i64(col.uncompressedSize);

  // field 7: total_compressed_size
  f = w.fh(f, 7, T.I64); w.i64(col.data.length);

  // field 9: data_page_offset
  f = w.fh(f, 9, T.I64); w.i64(dataPageOffset);

  w.stop();
}
