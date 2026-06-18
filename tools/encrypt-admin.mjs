/*
 * Generates admin/payload.js — an AES-GCM blob, encrypted with a PBKDF2 key
 * derived from the admin password. admin.js decrypts it client-side as one half
 * of the login (the other half is Firebase Authentication).
 *
 * Art Jewelry has no private client-side content to ship, so the encrypted
 * bundle is intentionally empty: the dashboard markup lives in admin.js. The
 * payload still exists so the password must successfully *decrypt* something,
 * preserving the same dual-check login design as the shared admin console. If
 * you ever want a private, password-gated panel (notes, a price sheet, etc.),
 * fill the `bundle` below with { html, css, script } and re-run this script.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_PASSWORD = "***REMOVED***"; node tools/encrypt-admin.mjs
 *
 * Usage (bash):
 *   ADMIN_PASSWORD="***REMOVED***" node tools/encrypt-admin.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { webcrypto } from "node:crypto";

const PASSWORD = process.env.ADMIN_PASSWORD;
const OUTPUT = resolve(process.argv[2] || "admin/payload.js");
const ITERATIONS = Number(process.env.ADMIN_PBKDF2_ITERATIONS || 600000);

if (!PASSWORD) {
  throw new Error("Set ADMIN_PASSWORD before running this script.");
}

const { subtle } = webcrypto;
const encoder = new TextEncoder();
const bytesToBase64 = (bytes) => Buffer.from(bytes).toString("base64");

// Optional private, password-gated content. Empty by default.
const bundle = {
  html: "",
  css: "",
  script: ""
};

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const baseKey = await subtle.importKey("raw", encoder.encode(PASSWORD), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"]
);
const ciphertext = new Uint8Array(
  await subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(bundle)))
);

const payload = {
  version: 1,
  algorithm: "AES-GCM",
  kdf: "PBKDF2-SHA-256",
  iterations: ITERATIONS,
  salt: bytesToBase64(salt),
  iv: bytesToBase64(iv),
  ciphertext: bytesToBase64(ciphertext)
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `window.ARTJEWELRY_ADMIN_PAYLOAD = ${JSON.stringify(payload)};\n`,
  "utf8"
);

console.log(`Wrote admin payload to ${OUTPUT}`);
