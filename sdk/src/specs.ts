/**
 * ProvenanceSpec — factory helpers for building SailsCallSpec objects.
 *
 * The key insight: Sails encodes route headers as hash-based 16-byte
 * prefixes (NOT as SCALE Vec<String>). The safest way to get correct
 * payload_bytes and expected_reply is to use vara-wallet's --dry-run
 * or the sails-js payload encoder.
 *
 * Pre-computed route bytes for Provenance methods (mainnet, current IDL):
 *   Escrow/GetNextId: 0x474d01101c8bbcde96230a9d04000100
 *   Escrow/Settle:    0x474d01101c8bbcde96230a9d06000100
 *   Registry/Stats:   use dry-run to get bytes
 *
 * Reply format: route_echo_bytes (same 16 bytes) + SCALE-encoded(result)
 *
 * SCALE u64 little-endian: encode(n) = n as 8 bytes LE
 */

import type { HexString } from "@gear-js/api";
import type { SailsCallSpec } from "./types";

/** SCALE-encode a u64 as 8 bytes little-endian */
function scaleU64(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/** Concatenate multiple Uint8Arrays */
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Decode a hex string (with or without 0x) to Uint8Array */
function fromHex(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

// ─── Known route bytes (Provenance mainnet, current IDL) ─────────────────────
// Obtained via: vara-wallet ... call <PROV_PID> Escrow/GetNextId --args '[]' --dry-run
const ESCROW_GET_NEXT_ID_ROUTE = fromHex("474d01101c8bbcde96230a9d04000100");

// ─── ProvenanceSpec factory ───────────────────────────────────────────────────

/**
 * Build a SailsCallSpec that verifies `GetNextId()` on the target program
 * returns exactly `expectedValue`.
 *
 * This is the simplest built-in verifier: it proves the counter state
 * of any Provenance-compatible program.
 *
 * @example
 * // Verify that Provenance's next_id == 42 (i.e., 41 settlements have been created)
 * const spec = ProvenanceSpec.getNextId(PROVENANCE_PROGRAM_ID, 42n);
 */
export const ProvenanceSpec = {
  getNextId(targetProgram: HexString, expectedValue: bigint): SailsCallSpec {
    const payloadBytes = ESCROW_GET_NEXT_ID_ROUTE;
    // Reply = route_echo + SCALE u64(expectedValue)
    const expectedReply = concat(ESCROW_GET_NEXT_ID_ROUTE, scaleU64(expectedValue));
    return { targetProgram, payloadBytes, expectedReply };
  },

  /**
   * Build a SailsCallSpec from raw dry-run payload bytes and an expected result.
   *
   * Use this when targeting any Sails method. Get `routeBytes` from:
   *   vara-wallet ... call <program> Service/Method --args '...' --dry-run
   * Then extract `encodedPayload` from the JSON output.
   *
   * @param targetProgram - hex ActorId of the program to query
   * @param routeBytes    - `encodedPayload` hex from --dry-run (route + encoded args)
   * @param scaleResult   - SCALE-encoded expected return value as Uint8Array
   */
  fromDryRun(
    targetProgram: HexString,
    routeBytes: HexString,
    scaleResult: Uint8Array
  ): SailsCallSpec {
    const payloadBytes = fromHex(routeBytes);
    const expectedReply = concat(payloadBytes, scaleResult);
    return { targetProgram, payloadBytes, expectedReply };
  },

  /** Encode a u64 to SCALE bytes (helper for fromDryRun) */
  scaleU64,

  /** Decode hex string to Uint8Array (helper) */
  fromHex,
};
