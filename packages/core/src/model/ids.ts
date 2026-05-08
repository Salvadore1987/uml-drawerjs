/**
 * UUIDv7 generator — globally-unique, time-ordered identifiers used for every
 * AST entity (Diagram, Node, Edge, Group, Attribute, Operation).
 *
 * UUIDv7 layout (RFC 9562): 48-bit Unix epoch ms timestamp · 4-bit version (7)
 * · 12 random bits · 2-bit RFC 4122 variant (10) · 62 random bits.
 *
 * Time-ordering matters because it gives deterministic AST keys for diffing,
 * lockless collaboration (Phase 17 ADR-0004), and naturally sorted log lines.
 */

const HEX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Returns a freshly-generated UUIDv7 string. */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);

  const ts = Date.now();
  // 48-bit timestamp split across the first six bytes (big-endian).
  view.setUint16(0, Math.floor(ts / 0x1_0000_0000));
  view.setUint32(2, ts >>> 0);

  // Version 7 in the high nibble of byte 6.
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
  // RFC 4122 variant (binary 10xx) in the high bits of byte 8.
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += view.getUint8(i).toString(16).padStart(2, "0");
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Returns true iff the input is a syntactically-valid UUIDv7 string. */
export function isUuidv7(value: string): boolean {
  return HEX_PATTERN.test(value);
}
