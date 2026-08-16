#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.appstoreconnect.apple.com/v1";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ASC_ENV_PATHS = [
  path.resolve(REPO_ROOT, "../.local/app-store-connect.env"),
  path.resolve(REPO_ROOT, "../../.local/app-store-connect.env"),
];

const LISTING = {
  description: [
    "Quiet Room is a calm digital space for prayerful reflection, stillness, and thoughtful conversation.",
    "",
    "The app offers gentle AI-guided dialogue shaped for people who want a quiet place to bring what feels present, reflect with care, and return to a more attentive interior posture. Quiet Room is designed to feel simple, spacious, and grounded rather than noisy or performative.",
    "",
    "You can use Quiet Room to:",
    "",
    "- Begin from silence or a simple prompt",
    "- Reflect through concise, thoughtful conversation",
    "- Revisit conversations when signed in",
    "- Copy or listen to responses",
    "- Access privacy, support, and account deletion information from within the app",
    "",
    "Quiet Room is not a replacement for prayer, Scripture, the sacraments, spiritual direction, professional counseling, or emergency support. It is a reflective tool intended to support steadiness, attentiveness, and faithful discernment.",
  ].join("\n"),
  keywords: "prayer,reflection,spiritual,quiet,AI,conversation,journal,stillness,Catholic",
  marketingUrl: "https://quiet-room-privacy-policy.vercel.app/",
  promotionalText: "A calm space for prayerful reflection with grounded AI conversation.",
  supportUrl: "https://quiet-room-privacy-policy.vercel.app/support",
};

const REVIEW_NOTES = [
  "Privacy Policy: https://quiet-room-privacy-policy.vercel.app/privacy",
  "Support: https://quiet-room-privacy-policy.vercel.app/support",
  "Account deletion: https://quiet-room-privacy-policy.vercel.app/account-deletion",
  "",
  "In-app account deletion: open Quiet Room, tap the profile icon, choose Delete Account, then confirm.",
  "",
  "AI consent: Quiet Room shows an AI-sharing consent prompt before the first message is sent to the AI service. If the user chooses Not now, the pending message is not sent.",
  "",
  "iOS login: Sign in with Apple is available on iOS. Google and email/password sign-in may also be available when configured.",
  "A guest flow is available, but use the demo account to test signed-in features such as conversation history and account deletion.",
  "",
  "In-app privacy links: open the About screen to access Privacy Policy, Support, and Account Deletion links.",
].join("\n");

const AGE_RATING = {
  advertising: false,
  alcoholTobaccoOrDrugUseOrReferences: "NONE",
  contests: "NONE",
  gambling: false,
  gamblingSimulated: "NONE",
  gunsOrOtherWeapons: "NONE",
  healthOrWellnessTopics: false,
  kidsAgeBand: null,
  koreaAgeRatingOverride: "NONE",
  lootBox: false,
  matureOrSuggestiveThemes: "NONE",
  medicalOrTreatmentInformation: "NONE",
  messagingAndChat: true,
  parentalControls: false,
  profanityOrCrudeHumor: "NONE",
  ageAssurance: false,
  sexualContentGraphicAndNudity: "NONE",
  sexualContentOrNudity: "NONE",
  horrorOrFearThemes: "NONE",
  unrestrictedWebAccess: false,
  userGeneratedContent: false,
  violenceCartoonOrFantasy: "NONE",
  violenceRealistic: "NONE",
  violenceRealisticProlongedGraphicOrSadistic: "NONE",
  ageRatingOverrideV2: "NONE",
  developerAgeRatingInfoUrl: null,
};

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
  offset = sequence.offset;

  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid ECDSA signature: expected r integer");
  }
  const rInteger = readDerLength(derSignature, offset);
  let r = derSignature.subarray(rInteger.offset, rInteger.offset + rInteger.length);
  offset = rInteger.offset + rInteger.length;

  if (derSignature[offset++] !== 0x02) {
    throw new Error("Invalid ECDSA signature: expected s integer");
  }
  const sInteger = readDerLength(derSignature, offset);
  let s = derSignature.subarray(sInteger.offset, sInteger.offset + sInteger.length);

  if (r.length > byteLength) {
    r = r.subarray(r.length - byteLength);
  }
  if (s.length > byteLength) {
    s = s.subarray(s.length - byteLength);
  }

  return Buffer.concat([
    Buffer.alloc(Math.max(0, byteLength - r.length)),
    r,
    Buffer.alloc(Math.max(0, byteLength - s.length)),
    s,
  ]).toString("base64url");
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

function resourceData(type, id) {
  return { type, id };
}

async function findApp(token, bundleId) {
  const response = await requestJson(token, "GET", `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = response.data?.find((candidate) => candidate.attributes?.bundleId === bundleId);
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
  const localization = response.data?.[0];
  if (!localization) {
    throw new Error(`No ${locale} localization found for App Store version ${versionId}`);
  }
  return localization;
}

async function listRecentBuilds(token, appId) {
  const response = await requestJson(
    token,
    "GET",
    `/builds?filter[app]=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=20`,
  );
  return response.data || [];
}

function findBuild(builds, buildNumber) {
  return builds.find(
    (build) =>
      build.attributes?.version === buildNumber &&
      build.attributes?.processingState === "VALID" &&
      build.attributes?.expired === false,
  );
}

async function findAppInfo(token, appId) {
  const response = await requestJson(token, "GET", `/apps/${appId}/appInfos?limit=10`);
  const appInfo = response.data?.[0];
  if (!appInfo) {
    throw new Error(`No appInfo found for app ${appId}`);
  }
  return appInfo;
}

async function readStatus(token, options) {
  const app = await findApp(token, options.bundleId);
  const version = await findVersion(token, app.id, options.versionString, options.platform);
  const localization = await findLocalization(token, version.id, options.locale);
  const build = await requestJson(token, "GET", `/appStoreVersions/${version.id}/build`);
  const reviewDetail = await requestJson(token, "GET", `/appStoreVersions/${version.id}/appStoreReviewDetail`);
  const appInfo = await findAppInfo(token, app.id);
  const primaryCategory = await requestJson(token, "GET", `/appInfos/${appInfo.id}/primaryCategory`);
  const ageRating = await requestJson(token, "GET", `/appInfos/${appInfo.id}/ageRatingDeclaration`);
  let submission = null;
  try {
    submission = await requestJson(token, "GET", `/appStoreVersions/${version.id}/appStoreVersionSubmission`);
  } catch (error) {
    submission = { error: error instanceof Error ? error.message : String(error) };
  }

  return {
    app,
    version,
    localization,
    build: build.data || null,
    reviewDetail: reviewDetail.data || null,
    appInfo,
    primaryCategory: primaryCategory.data || null,
    ageRating: ageRating.data || null,
    submission: submission?.data || null,
  };
}

function requiredMissing(status, reviewPhone) {
  const missing = [];
  const localization = status.localization.attributes || {};
  const review = status.reviewDetail?.attributes || {};
  const age = status.ageRating?.attributes || {};

  if (!status.build) missing.push("build");
  if (!status.version.attributes?.copyright) missing.push("copyright");
  for (const field of ["description", "keywords", "marketingUrl", "promotionalText"]) {
    if (!localization[field]) missing.push(`localization.${field}`);
  }
  for (const field of ["contactFirstName", "contactLastName", "contactPhone", "contactEmail"]) {
    if (!review[field]) missing.push(`review.${field}`);
  }
  for (const [field, value] of Object.entries(age)) {
    if (value === null && field !== "kidsAgeBand" && field !== "developerAgeRatingInfoUrl") {
      missing.push(`ageRating.${field}`);
    }
  }
  if (!status.primaryCategory) missing.push("primaryCategory");
  if (!review.contactPhone && !reviewPhone) missing.push("local.ASC_REVIEW_CONTACT_PHONE");

  return missing;
}

async function applyReadiness(token, status, options) {
  const builds = await listRecentBuilds(token, status.app.id);
  const targetBuild = findBuild(builds, options.buildNumber);
  if (!targetBuild) {
    throw new Error(`No valid unexpired build ${options.buildNumber} found for app ${status.app.id}`);
  }

  const currentReview = status.reviewDetail?.attributes || {};
  const reviewPhone = options.reviewPhone || currentReview.contactPhone;
  const reviewAttributes = {
    contactFirstName: currentReview.contactFirstName || options.reviewFirstName,
    contactLastName: currentReview.contactLastName || options.reviewLastName,
    contactEmail: currentReview.contactEmail || options.reviewEmail,
    notes: REVIEW_NOTES,
  };
  if (reviewPhone) {
    reviewAttributes.contactPhone = reviewPhone;
  }

  await requestJson(token, "PATCH", `/appStoreVersions/${status.version.id}`, {
    data: {
      type: "appStoreVersions",
      id: status.version.id,
      attributes: {
        copyright: options.copyright,
        usesIdfa: false,
      },
      relationships: {
        build: {
          data: resourceData("builds", targetBuild.id),
        },
      },
    },
  });

  await requestJson(token, "PATCH", `/appStoreVersionLocalizations/${status.localization.id}`, {
    data: {
      type: "appStoreVersionLocalizations",
      id: status.localization.id,
      attributes: LISTING,
    },
  });

  if (reviewPhone) {
    await requestJson(token, "PATCH", `/appStoreReviewDetails/${status.reviewDetail.id}`, {
      data: {
        type: "appStoreReviewDetails",
        id: status.reviewDetail.id,
        attributes: reviewAttributes,
      },
    });
  } else {
    console.log("Skipped App Review contact update because ASC_REVIEW_CONTACT_PHONE/--review-phone is missing.");
  }

  await requestJson(token, "PATCH", `/appInfos/${status.appInfo.id}`, {
    data: {
      type: "appInfos",
      id: status.appInfo.id,
      relationships: {
        primaryCategory: {
          data: resourceData("appCategories", options.primaryCategory),
        },
      },
    },
  });

  await requestJson(token, "PATCH", `/ageRatingDeclarations/${status.ageRating.id}`, {
    data: {
      type: "ageRatingDeclarations",
      id: status.ageRating.id,
      attributes: AGE_RATING,
    },
  });
}

function printStatus(status, reviewPhone) {
  const localization = status.localization.attributes || {};
  const review = status.reviewDetail?.attributes || {};
  const age = status.ageRating?.attributes || {};

  console.log(`App: ${status.app.attributes?.name} (${status.app.id})`);
  console.log(`Bundle ID: ${status.app.attributes?.bundleId}`);
  console.log(`Version: ${status.version.attributes?.versionString} (${status.version.id})`);
  console.log(`Version state: ${status.version.attributes?.appStoreState}`);
  console.log(`Attached build: ${status.build ? `${status.build.attributes?.version} (${status.build.id})` : "none"}`);
  console.log(`Copyright: ${status.version.attributes?.copyright || "missing"}`);
  console.log(`Uses IDFA: ${status.version.attributes?.usesIdfa}`);
  console.log(`Localization: ${localization.locale} (${status.localization.id})`);
  console.log(`Description: ${localization.description ? "set" : "missing"}`);
  console.log(`Keywords: ${localization.keywords || "missing"}`);
  console.log(`Marketing URL: ${localization.marketingUrl || "missing"}`);
  console.log(`Promotional text: ${localization.promotionalText ? "set" : "missing"}`);
  console.log(`What's new: ${localization.whatsNew ? "set" : "not editable for first version"}`);
  console.log(`Support URL: ${localization.supportUrl || "missing"}`);
  console.log(
    `Review contact: firstName ${review.contactFirstName ? "set" : "missing"}, ` +
      `lastName ${review.contactLastName ? "set" : "missing"}, ` +
      `email ${review.contactEmail ? "set" : "missing"}, ` +
      `phone ${review.contactPhone ? "set" : "missing"}`
  );
  console.log(`Review notes: ${review.notes ? "set" : "missing"}`);
  console.log(`Demo account required: ${review.demoAccountRequired}`);
  console.log(`Primary category: ${status.primaryCategory?.id || "missing"}`);
  console.log(`Age rating null fields: ${Object.entries(age).filter(([, value]) => value === null).map(([key]) => key).join(", ") || "none"}`);
  console.log(`Submission object: ${status.submission ? "present" : "not found"}`);

  const missing = requiredMissing(status, reviewPhone);
  console.log(`Readiness gaps: ${missing.length ? missing.join(", ") : "none"}`);
}

async function main() {
  await loadDefaultAscEnv();

  const options = {
    bundleId: argValue("--bundle-id", process.env.ASC_BUNDLE_ID || "com.quietroom.mobile"),
    versionString: argValue("--version", process.env.ASC_VERSION_STRING || "1.0"),
    locale: argValue("--locale", process.env.ASC_LOCALE || "en-US"),
    platform: argValue("--platform", process.env.ASC_PLATFORM || "IOS"),
    buildNumber: argValue("--build", process.env.ASC_BUILD_NUMBER || "30"),
    copyright: argValue("--copyright", process.env.ASC_COPYRIGHT || "2026 Quiet Room"),
    primaryCategory: argValue("--primary-category", process.env.ASC_PRIMARY_CATEGORY || "LIFESTYLE"),
    reviewFirstName: argValue("--review-first-name", process.env.ASC_REVIEW_CONTACT_FIRST_NAME || "Quiet"),
    reviewLastName: argValue("--review-last-name", process.env.ASC_REVIEW_CONTACT_LAST_NAME || "Room"),
    reviewEmail: argValue("--review-email", process.env.ASC_REVIEW_CONTACT_EMAIL || process.env.EXPO_PUBLIC_CONTACT_EMAIL || "Quietroomapp@gmail.com"),
    reviewPhone: argValue("--review-phone", process.env.ASC_REVIEW_CONTACT_PHONE || ""),
  };

  const apply = argFlag("--apply");
  const token = await createToken();
  const before = await readStatus(token, options);

  if (!apply) {
    printStatus(before, options.reviewPhone);
    console.log("Status only. No App Store Connect changes were made.");
    return;
  }

  await applyReadiness(token, before, options);
  const after = await readStatus(token, options);
  printStatus(after, options.reviewPhone);
  console.log("Done. No App Review submission was attempted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
