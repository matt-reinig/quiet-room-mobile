#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.appstoreconnect.apple.com/v1";
const DEFAULT_SCREENSHOT_DIR = "docs/qr-mob-022-ios-production-release/store-assets/iphone-api-67";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ASC_ENV_PATHS = [
  path.resolve(REPO_ROOT, "../.local/app-store-connect.env"),
  path.resolve(REPO_ROOT, "../../.local/app-store-connect.env"),
];
const KNOWN_LOCKED_VERSION_STATES = new Set([
  "ACCEPTED",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_CONTRACT",
  "PENDING_DEVELOPER_RELEASE",
  "PREORDER_READY_FOR_SALE",
  "PROCESSING_FOR_APP_STORE",
  "READY_FOR_DISTRIBUTION",
  "READY_FOR_REVIEW",
  "READY_FOR_SALE",
  "REPLACED_WITH_NEW_VERSION",
  "WAITING_FOR_EXPORT_COMPLIANCE",
  "WAITING_FOR_REVIEW",
]);

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) {
    return null;
  }

  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key: match[1], value };
}

async function loadEnvFileIfPresent(filePath) {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }

  return true;
}

async function loadDefaultAscEnv() {
  if (argValue("--asc-env", "")) {
    await loadEnvFileIfPresent(path.resolve(argValue("--asc-env")));
    return;
  }

  for (const envPath of DEFAULT_ASC_ENV_PATHS) {
    if (await loadEnvFileIfPresent(envPath)) {
      return;
    }
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function readDerLength(buffer, offset) {
  const first = buffer[offset++];
  if ((first & 0x80) === 0) {
    return { length: first, offset };
  }

  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 4) {
    throw new Error("Invalid ECDSA signature length encoding");
  }

  let length = 0;
  for (let i = 0; i < lengthBytes; i += 1) {
    length = (length << 8) | buffer[offset++];
  }

  return { length, offset };
}

function derToJose(derSignature, byteLength = 32) {
  let offset = 0;
  if (derSignature[offset++] !== 0x30) {
    throw new Error("Invalid ECDSA signature: expected sequence");
  }

  const sequence = readDerLength(derSignature, offset);
  const sequenceLength = sequence.length;
  offset = sequence.offset;
  if (sequenceLength + offset !== derSignature.length) {
    throw new Error("Invalid ECDSA signature length");
  }

  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid ECDSA signature: expected r integer");
  }
  const rInteger = readDerLength(derSignature, offset);
  const rLength = rInteger.length;
  offset = rInteger.offset;
  let r = derSignature.subarray(offset, offset + rLength);
  offset += rLength;

  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid ECDSA signature: expected s integer");
  }
  const sInteger = readDerLength(derSignature, offset);
  const sLength = sInteger.length;
  offset = sInteger.offset;
  let s = derSignature.subarray(offset, offset + sLength);

  if (r.length > byteLength) {
    r = r.subarray(r.length - byteLength);
  }
  if (s.length > byteLength) {
    s = s.subarray(s.length - byteLength);
  }

  const normalizedR = Buffer.concat([Buffer.alloc(Math.max(0, byteLength - r.length)), r]);
  const normalizedS = Buffer.concat([Buffer.alloc(Math.max(0, byteLength - s.length)), s]);
  return Buffer.concat([normalizedR, normalizedS]).toString("base64url");
}

async function readPrivateKey() {
  if (process.env.ASC_PRIVATE_KEY) {
    return process.env.ASC_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  if (!process.env.ASC_PRIVATE_KEY_PATH) {
    throw new Error("Missing ASC_PRIVATE_KEY_PATH or ASC_PRIVATE_KEY");
  }

  return fs.readFile(process.env.ASC_PRIVATE_KEY_PATH, "utf8");
}

async function createToken() {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;

  if (!keyId) {
    throw new Error("Missing ASC_KEY_ID");
  }
  if (!issuerId) {
    throw new Error("Missing ASC_ISSUER_ID");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = await readPrivateKey();
  const derSignature = crypto.sign("sha256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${derToJose(derSignature)}`;
}

async function requestJson(token, method, endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { rawBody: text };
    }
  }

  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json;
}

async function listScreenshotFiles(screenshotDir) {
  const entries = await fs.readdir(screenshotDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(screenshotDir, entry.name))
    .filter((file) => /\.(png|jpe?g)$/i.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(`No PNG/JPEG screenshots found in ${screenshotDir}`);
  }

  return files;
}

async function fileInfo(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    buffer,
    fileName: path.basename(filePath),
    fileSize: buffer.byteLength,
    md5: crypto.createHash("md5").update(buffer).digest("hex"),
  };
}

function resourceData(type, id) {
  return { type, id };
}

async function findApp(token, bundleId) {
  const response = await requestJson(token, "GET", `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = response.data?.[0];
  if (!app) {
    throw new Error(`No App Store Connect app found for bundle id ${bundleId}`);
  }
  return app;
}

async function findVersion(token, appId, versionString, platform) {
  const response = await requestJson(
    token,
    "GET",
    `/apps/${appId}/appStoreVersions?filter[platform]=${encodeURIComponent(platform)}&filter[versionString]=${encodeURIComponent(versionString)}`,
  );
  const version = response.data?.[0];
  if (!version) {
    throw new Error(`No ${platform} App Store version ${versionString} found for app ${appId}`);
  }
  return version;
}

async function findLocalization(token, versionId, locale) {
  const response = await requestJson(
    token,
    "GET",
    `/appStoreVersions/${versionId}/appStoreVersionLocalizations?filter[locale]=${encodeURIComponent(locale)}`,
  );
  return response.data?.[0] || null;
}

async function findOrCreateLocalization(token, versionId, locale) {
  const localization = await findLocalization(token, versionId, locale);
  if (localization) {
    return localization;
  }

  return requestJson(token, "POST", "/appStoreVersionLocalizations", {
    data: {
      type: "appStoreVersionLocalizations",
      attributes: { locale },
      relationships: {
        appStoreVersion: {
          data: resourceData("appStoreVersions", versionId),
        },
      },
    },
  }).then((created) => created.data);
}

async function listScreenshotSets(token, localizationId) {
  const response = await requestJson(token, "GET", `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`);
  return response.data || [];
}

async function findScreenshotSet(token, localizationId, displayType) {
  const response = await requestJson(
    token,
    "GET",
    `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?filter[screenshotDisplayType]=${encodeURIComponent(displayType)}`,
  );
  return (
    response.data?.find((set) => set.attributes?.screenshotDisplayType === displayType) ||
    null
  );
}

async function findOrCreateScreenshotSet(token, localizationId, displayType) {
  const screenshotSet = await findScreenshotSet(token, localizationId, displayType);
  if (screenshotSet) {
    return screenshotSet;
  }

  return requestJson(token, "POST", "/appScreenshotSets", {
    data: {
      type: "appScreenshotSets",
      attributes: {
        screenshotDisplayType: displayType,
      },
      relationships: {
        appStoreVersionLocalization: {
          data: resourceData("appStoreVersionLocalizations", localizationId),
        },
      },
    },
  }).then((created) => created.data);
}

async function printRemoteStatus(token, app, version, locale, displayType) {
  const state = version.attributes?.appStoreState || "<unknown>";
  const localization = await findLocalization(token, version.id, locale);

  console.log(`Resolved app id: ${app.id}`);
  console.log(`Resolved version id: ${version.id} (state: ${state})`);

  if (!localization) {
    console.log(`Localization ${locale}: missing`);
    console.log("Status only. No App Store Connect changes were made.");
    return;
  }

  console.log(`Resolved localization id: ${localization.id}`);

  const screenshotSets = await listScreenshotSets(token, localization.id);
  console.log(`Screenshot sets in localization: ${screenshotSets.length}`);

  for (const screenshotSet of screenshotSets) {
    const screenshotType = screenshotSet.attributes?.screenshotDisplayType || "<unknown>";
    const screenshots = await listScreenshots(token, screenshotSet.id);
    console.log(`  ${screenshotType}: set ${screenshotSet.id}, screenshots ${screenshots.length}`);
  }

  const targetSet = screenshotSets.find(
    (screenshotSet) => screenshotSet.attributes?.screenshotDisplayType === displayType,
  );
  console.log(`Target display type ${displayType}: ${targetSet ? "present" : "missing"}`);
  console.log("Status only. No App Store Connect changes were made.");
}

async function listScreenshots(token, screenshotSetId) {
  const response = await requestJson(token, "GET", `/appScreenshotSets/${screenshotSetId}/appScreenshots`);
  return response.data || [];
}

function assertEditableVersionState(state, allowVersionState) {
  if (!KNOWN_LOCKED_VERSION_STATES.has(state) || allowVersionState) {
    return;
  }

  throw new Error(
    `App Store version state ${state} may be locked for screenshot edits. ` +
      "Confirm the version is editable in App Store Connect, or rerun with --allow-version-state if this state is expected.",
  );
}

async function uploadScreenshot(token, screenshotSetId, filePath) {
  const info = await fileInfo(filePath);
  const reservation = await requestJson(token, "POST", "/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: {
        fileName: info.fileName,
        fileSize: info.fileSize,
      },
      relationships: {
        appScreenshotSet: {
          data: resourceData("appScreenshotSets", screenshotSetId),
        },
      },
    },
  });

  const screenshot = reservation.data;
  const operations = screenshot.attributes?.uploadOperations || [];

  for (const operation of operations) {
    const offset = Number(operation.offset || 0);
    const length = Number(operation.length || info.buffer.byteLength);
    const chunk = info.buffer.subarray(offset, offset + length);
    const headers = {};

    for (const header of operation.requestHeaders || []) {
      headers[header.name] = header.value;
    }

    const uploadResponse = await fetch(operation.url, {
      method: operation.method || "PUT",
      headers,
      body: chunk,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text();
      throw new Error(`Upload operation failed for ${info.fileName} (${uploadResponse.status}): ${text}`);
    }
  }

  await requestJson(token, "PATCH", `/appScreenshots/${screenshot.id}`, {
    data: {
      type: "appScreenshots",
      id: screenshot.id,
      attributes: {
        uploaded: true,
        sourceFileChecksum: info.md5,
      },
    },
  });

  return { id: screenshot.id, fileName: info.fileName, fileSize: info.fileSize, md5: info.md5 };
}

async function main() {
  await loadDefaultAscEnv();

  const dryRun = argFlag("--dry-run");
  const statusOnly = argFlag("--status");
  const screenshotDir = argValue("--screenshots", process.env.ASC_SCREENSHOT_DIR || DEFAULT_SCREENSHOT_DIR);
  const bundleId = argValue("--bundle-id", process.env.ASC_BUNDLE_ID || "com.quietroom.mobile");
  const versionString = argValue("--version", process.env.ASC_VERSION_STRING || "1.0");
  const locale = argValue("--locale", process.env.ASC_LOCALE || "en-US");
  const platform = argValue("--platform", process.env.ASC_PLATFORM || "IOS");
  const displayType = argValue("--display-type", process.env.ASC_SCREENSHOT_DISPLAY_TYPE || "APP_IPHONE_67");
  const replaceExisting = argFlag("--replace-existing");
  const allowVersionState = argFlag("--allow-version-state");

  const screenshotFiles = await listScreenshotFiles(screenshotDir);
  const infos = await Promise.all(screenshotFiles.map(fileInfo));

  console.log("App Store screenshot upload plan");
  console.log(`  bundle id: ${bundleId}`);
  console.log(`  version: ${versionString}`);
  console.log(`  platform: ${platform}`);
  console.log(`  locale: ${locale}`);
  console.log(`  display type: ${displayType}`);
  console.log(`  screenshots: ${infos.length}`);
  for (const info of infos) {
    console.log(`    ${info.fileName} (${info.fileSize} bytes, md5 ${info.md5})`);
  }

  if (dryRun) {
    console.log("Dry run only. No App Store Connect changes were made.");
    return;
  }

  const token = await createToken();
  const app = await findApp(token, bundleId);
  const version = await findVersion(token, app.id, versionString, platform);

  if (statusOnly) {
    await printRemoteStatus(token, app, version, locale, displayType);
    return;
  }

  const state = version.attributes?.appStoreState || "<unknown>";
  assertEditableVersionState(state, allowVersionState);
  const localization = await findOrCreateLocalization(token, version.id, locale);
  const screenshotSet = await findOrCreateScreenshotSet(token, localization.id, displayType);
  const existing = await listScreenshots(token, screenshotSet.id);

  console.log(`Resolved app id: ${app.id}`);
  console.log(`Resolved version id: ${version.id} (state: ${state})`);
  console.log(`Resolved localization id: ${localization.id}`);
  console.log(`Resolved screenshot set id: ${screenshotSet.id}`);
  console.log(`Existing screenshots in set: ${existing.length}`);

  if (existing.length > 0 && !replaceExisting) {
    throw new Error("Screenshot set already has screenshots. Rerun with --replace-existing after confirming replacement is intended.");
  }

  if (existing.length > 0) {
    for (const screenshot of existing) {
      await requestJson(token, "DELETE", `/appScreenshots/${screenshot.id}`);
      console.log(`Deleted existing screenshot ${screenshot.id}`);
    }
  }

  for (const filePath of screenshotFiles) {
    const uploaded = await uploadScreenshot(token, screenshotSet.id, filePath);
    console.log(`Uploaded ${uploaded.fileName} as ${uploaded.id}`);
  }

  const finalScreenshots = await listScreenshots(token, screenshotSet.id);
  console.log(`Final screenshot count in set: ${finalScreenshots.length}`);
  console.log("Done. No App Review submission was attempted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
