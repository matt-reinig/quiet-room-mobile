#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ENV_PATHS = [
  path.resolve(REPO_ROOT, "../.local/google-play-publisher.env"),
  path.resolve(REPO_ROOT, "../../.local/google-play-publisher.env"),
];
const LANES = {
  qa: { packageName: "com.quietroom.mobile.qa", releaseNamePrefix: "QA" },
  prod: { packageName: "com.quietroom.mobile", releaseNamePrefix: "PROD" },
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function valueFor(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function usage() {
  console.log(`Usage:
  node scripts/google-play-release.mjs --status --lane <qa|prod> [--track internal]
  node scripts/google-play-release.mjs --dry-run --lane <qa|prod> --aab <path> [--track internal]
  node scripts/google-play-release.mjs --upload --apply --lane <qa|prod> --aab <path> [options]
  node scripts/google-play-release.mjs --promote <versionCode> --confirm-publish --lane <qa|prod> [--track internal]

Options:
  --play-env <path>        Load a local Google Play publisher env file.
  --lane <qa|prod>         Selects the package id. Required.
  --package-name <id>      Override the lane package id.
  --track <name>           Defaults to internal.
  --aab <path>             Android App Bundle for --dry-run or --upload.
  --release-name <name>    Defaults to "QA internal <versionCode>" or "PROD internal <versionCode>".
  --release-notes <text>   Optional en-US release notes.
  --complete               With --upload, create a completed release instead of a draft.
  --apply                  Required acknowledgement before uploading a bundle.
  --confirm-publish        Required acknowledgement before changing a release to completed.
  --allow-prod             Required with --upload or --promote for the prod lane.

Environment:
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json

Safety:
  --status creates and abandons a temporary Play edit; it never commits changes.
  --upload creates a draft release by default. --complete requires
  --confirm-publish. --promote is available for an existing draft release.`);
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key: match[1], value };
}

async function loadEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed && process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.value;
  }
  return true;
}

async function loadPublisherEnv() {
  const suppliedPath = valueFor("--play-env");
  if (suppliedPath) {
    if (!(await loadEnvFile(path.resolve(suppliedPath)))) {
      throw new Error(`Google Play env file does not exist: ${path.resolve(suppliedPath)}`);
    }
    return;
  }
  for (const envPath of DEFAULT_ENV_PATHS) {
    if (await loadEnvFile(envPath)) return;
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function serviceAccount() {
  const credentialPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credentialPath) {
    throw new Error("Missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON. Copy .env.google-play-publisher.example into Gabriel_App/.local/google-play-publisher.env and set its local path.");
  }
  let credential;
  try {
    credential = JSON.parse(await fs.readFile(path.resolve(credentialPath), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
  if (credential.type !== "service_account" || !credential.client_email || !credential.private_key) {
    throw new Error("Google Play credential must be a service-account JSON with client_email and private_key.");
  }
  return credential;
}

async function accessToken() {
  const account = await serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 60 * 60,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Google OAuth token request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function request(token, method, endpoint, { json, bytes, headers } = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(bytes ? { "Content-Type": "application/octet-stream" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : bytes,
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { rawBody: text }; }
  }
  if (!response.ok) {
    const hint = /Only releases with status draft may be created on draft app/.test(text)
      ? " The Play app itself is still draft-only. Complete its initial publication/legal-consent transition in Play Console; the API cannot perform that transition."
      : "";
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${JSON.stringify(body)}${hint}`);
  }
  return body;
}

async function createEdit(token, packageName) {
  return request(token, "POST", `/applications/${encodeURIComponent(packageName)}/edits`);
}

async function abandonEdit(token, packageName, editId) {
  await request(token, "DELETE", `/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}`);
}

async function readTrack(token, packageName, editId, track) {
  return request(token, "GET", `/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(track)}`);
}

function printTrack(packageName, track, payload) {
  console.log(`Package: ${packageName}`);
  console.log(`Track: ${track}`);
  const releases = payload.releases || [];
  if (!releases.length) {
    console.log("Releases: none");
    return;
  }
  console.log("Releases:");
  for (const release of releases) {
    console.log(`  ${release.name || "<unnamed>"}`);
    console.log(`    versionCodes: ${(release.versionCodes || []).join(", ") || "<none>"}`);
    console.log(`    status: ${release.status || "<unset>"}`);
    if (release.userFraction !== undefined) console.log(`    userFraction: ${release.userFraction}`);
  }
}

async function withEdit(token, packageName, action) {
  const edit = await createEdit(token, packageName);
  try {
    return await action(edit.id);
  } finally {
    await abandonEdit(token, packageName, edit.id).catch(() => {});
  }
}

async function localBundleDetails(aabPath) {
  if (!aabPath) throw new Error("--aab is required for this command.");
  const resolved = path.resolve(aabPath);
  const contents = await fs.readFile(resolved);
  if (!contents.length) throw new Error(`AAB is empty: ${resolved}`);
  return { path: resolved, bytes: contents, sha256: crypto.createHash("sha256").update(contents).digest("hex") };
}

function laneConfig() {
  const lane = valueFor("--lane");
  if (!LANES[lane]) throw new Error("--lane must be qa or prod.");
  const packageName = valueFor("--package-name", LANES[lane].packageName);
  const track = valueFor("--track", "internal");
  if (lane === "prod" && (hasFlag("--upload") || valueFor("--promote")) && !hasFlag("--allow-prod")) {
    throw new Error("Prod mutations require --allow-prod in addition to their normal confirmation flag.");
  }
  return { lane, packageName, track, releaseNamePrefix: LANES[lane].releaseNamePrefix };
}

function releasePayload({ name, versionCodes, releaseNotes, status }) {
  return {
    releases: [{
      ...(name ? { name } : {}),
      versionCodes: versionCodes.map(String),
      ...(releaseNotes?.length ? { releaseNotes } : {}),
      status,
    }],
  };
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) return usage();
  await loadPublisherEnv();
  const config = laneConfig();
  const action = hasFlag("--dry-run") ? "dry-run" : hasFlag("--upload") ? "upload" : valueFor("--promote") ? "promote" : "status";

  if (action === "dry-run") {
    const bundle = await localBundleDetails(valueFor("--aab"));
    console.log("Google Play upload dry run");
    console.log(`Package: ${config.packageName}`);
    console.log(`Track: ${config.track}`);
    console.log(`AAB: ${bundle.path}`);
    console.log(`AAB SHA256: ${bundle.sha256}`);
    console.log(`Planned release status: ${hasFlag("--complete") ? "completed" : "draft"}`);
    console.log("No Google API requests or Play changes were made.");
    return;
  }

  const token = await accessToken();
  if (action === "status") {
    await withEdit(token, config.packageName, async (editId) => {
      const track = await readTrack(token, config.packageName, editId, config.track);
      printTrack(config.packageName, config.track, track);
      console.log("Status only. The temporary Play edit was abandoned without committing changes.");
    });
    return;
  }

  if (action === "upload") {
    if (!hasFlag("--apply")) throw new Error("--upload is mutating. Re-run with --apply after reviewing --dry-run.");
    if (hasFlag("--complete") && !hasFlag("--confirm-publish")) {
      throw new Error("--complete publishes to the selected track. Re-run with --confirm-publish after reviewing status.");
    }
    const bundle = await localBundleDetails(valueFor("--aab"));
    const edit = await createEdit(token, config.packageName);
    try {
      const uploaded = await request(token, "POST", `/applications/${encodeURIComponent(config.packageName)}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`, { bytes: bundle.bytes });
      const versionCode = String(uploaded.versionCode);
      const releaseName = valueFor("--release-name", `${config.releaseNamePrefix} ${config.track} ${versionCode}`);
      const notesText = valueFor("--release-notes");
      const releaseNotes = notesText ? [{ language: "en-US", text: notesText }] : [];
      const releaseStatus = hasFlag("--complete") ? "completed" : "draft";
      await request(token, "PUT", `/applications/${encodeURIComponent(config.packageName)}/edits/${encodeURIComponent(edit.id)}/tracks/${encodeURIComponent(config.track)}`, {
        json: { track: config.track, ...releasePayload({ name: releaseName, versionCodes: [versionCode], releaseNotes, status: releaseStatus }) },
      });
      await request(token, "POST", `/applications/${encodeURIComponent(config.packageName)}/edits/${encodeURIComponent(edit.id)}:commit`);
      console.log(`Committed Play edit ${edit.id}`);
      console.log(`Uploaded AAB versionCode ${versionCode}`);
      console.log(`Created ${config.track} ${releaseStatus} release: ${releaseName}`);
      console.log(`AAB SHA256: ${bundle.sha256}`);
    } catch (error) {
      await abandonEdit(token, config.packageName, edit.id).catch(() => {});
      throw error;
    }
    return;
  }

  if (!hasFlag("--confirm-publish")) throw new Error("--promote changes a release to completed. Re-run with --confirm-publish after reviewing status.");
  const versionCode = valueFor("--promote");
  await withEdit(token, config.packageName, async (editId) => {
    const track = await readTrack(token, config.packageName, editId, config.track);
    const release = (track.releases || []).find((candidate) => (candidate.versionCodes || []).map(String).includes(String(versionCode)));
    if (!release) throw new Error(`Version code ${versionCode} is not present on ${config.track}. Run --status first.`);
    if (release.status === "completed") {
      console.log(`Version code ${versionCode} is already completed on ${config.track}; no change was made.`);
      return;
    }
    await request(token, "PUT", `/applications/${encodeURIComponent(config.packageName)}/edits/${encodeURIComponent(editId)}/tracks/${encodeURIComponent(config.track)}`, {
      json: { track: config.track, ...releasePayload({ name: release.name, versionCodes: release.versionCodes || [versionCode], releaseNotes: release.releaseNotes || [], status: "completed" }) },
    });
    await request(token, "POST", `/applications/${encodeURIComponent(config.packageName)}/edits/${encodeURIComponent(editId)}:commit`);
    console.log(`Promoted ${config.track} versionCode ${versionCode} to completed.`);
  });
}

main().catch((error) => {
  console.error(`Google Play release helper failed: ${error.message}`);
  process.exitCode = 1;
});
