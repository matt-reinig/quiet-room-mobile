const fs = require("fs");
const path = require("path");

const config = require("../app.config.js").expo;

const expectedVariant = process.argv[2];
const expectedReleaseEnv = process.argv[3];

if (!expectedVariant || !expectedReleaseEnv) {
  console.error("Usage: node ./scripts/verify-mobile-config.js <app-variant> <release-env>");
  process.exit(1);
}

const failures = [];
const warnings = [];

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} expected '${expected}' but received '${actual}'`);
  }
}

function expectTruthy(label, value) {
  if (!value) {
    failures.push(`${label} is missing`);
  }
}

function expectIncludes(label, value, expectedFragment) {
  if (!String(value).includes(expectedFragment)) {
    failures.push(`${label} expected to include '${expectedFragment}' but received '${value}'`);
  }
}

function expectNotIncludes(label, value, forbiddenFragment) {
  if (String(value).includes(forbiddenFragment)) {
    failures.push(`${label} must not include '${forbiddenFragment}' but received '${value}'`);
  }
}

const resolvedVariant = config.extra?.appVariant ?? null;
const resolvedReleaseEnv = config.extra?.releaseEnv ?? null;
const appName = config.name ?? "";
const scheme = config.scheme ?? "";
const bundleIdentifier = config.ios?.bundleIdentifier ?? "";
const packageId = config.android?.package ?? "";
const iosGoogleServicesFile = config.ios?.googleServicesFile ?? "";
const androidGoogleServicesFile = config.android?.googleServicesFile ?? "";
const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? "";
const streamingBase = process.env.EXPO_PUBLIC_STREAMING_BASE ?? "";
const webAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "";
const firebaseProjectId = process.env.EXPO_PUBLIC_FB_PROJECT_ID ?? "";
const rootDir = path.resolve(__dirname, "..");

function readAndroidPackageFromGoogleServices(relativePath) {
  if (!relativePath) {
    return null;
  }

  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  return raw?.client?.[0]?.client_info?.android_client_info?.package_name ?? null;
}

function readBundleIdFromGoogleServiceInfo(relativePath) {
  if (!relativePath) {
    return null;
  }

  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const match = raw.match(/<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/);
  return match ? match[1] : null;
}

const firebaseAndroidPackage = readAndroidPackageFromGoogleServices(androidGoogleServicesFile);
const firebaseIosBundleId = readBundleIdFromGoogleServiceInfo(iosGoogleServicesFile);

expectEqual("app variant", resolvedVariant, expectedVariant);
expectEqual("release env", resolvedReleaseEnv, expectedReleaseEnv);
expectTruthy("EXPO_PUBLIC_API_BASE", apiBase);
expectTruthy("EXPO_PUBLIC_WEB_APP_URL", webAppUrl);

if (expectedVariant === "qa") {
  expectEqual("app name", appName, "Quiet Room QA");
  expectEqual("scheme", scheme, "quietroommobileqa");
  expectEqual("iOS bundle identifier", bundleIdentifier, "com.quietroom.mobile.qa");
  expectEqual("Android package", packageId, "com.quietroom.mobile.qa");
} else {
  expectEqual("app name", appName, "Quiet Room");
  expectEqual("scheme", scheme, "quietroommobile");
  expectEqual("iOS bundle identifier", bundleIdentifier, "com.quietroom.mobile");
  expectEqual("Android package", packageId, "com.quietroom.mobile");
}

if (expectedReleaseEnv === "local") {
  const localHostDetected =
    apiBase.includes("localhost") ||
    apiBase.includes("127.0.0.1") ||
    apiBase.includes("10.0.2.2");

  if (!localHostDetected) {
    failures.push(`local release env should point at a local API base, received '${apiBase}'`);
  }

  if (streamingBase && !/(localhost|127\.0\.0\.1|10\.0\.2\.2)/.test(streamingBase)) {
    failures.push(
      `local release env streaming base should be empty or local, received '${streamingBase}'`
    );
  }
}

if (expectedReleaseEnv === "qa") {
  expectNotIncludes("API base", apiBase, "your-prod-api.com");
  expectNotIncludes("web app URL", webAppUrl, "your-prod-web-app.com");
  expectNotIncludes("API base", apiBase, "localhost");
  expectNotIncludes("API base", apiBase, "127.0.0.1");
  expectNotIncludes("API base", apiBase, "10.0.2.2");
}

if (expectedReleaseEnv === "prod") {
  expectNotIncludes("API base", apiBase, "qa");
  expectNotIncludes("web app URL", webAppUrl, "qa");
  expectNotIncludes("API base", apiBase, "localhost");
  expectNotIncludes("API base", apiBase, "127.0.0.1");
  expectNotIncludes("API base", apiBase, "10.0.2.2");
  expectNotIncludes("API base", apiBase, "your-prod-api.com");
  expectNotIncludes("web app URL", webAppUrl, "your-prod-web-app.com");

  if (firebaseProjectId) {
    expectNotIncludes("Firebase project id", firebaseProjectId, "qa");
  }
}

if (!iosGoogleServicesFile) {
  if (expectedVariant === "prod") {
    failures.push("iOS Google services file is missing for the prod app variant");
  } else {
    warnings.push("iOS Google services file is missing");
  }
} else if (iosGoogleServicesFile === "./GoogleService-Info.plist") {
  warnings.push(
    `iOS Google services file is still using the legacy path '${iosGoogleServicesFile}'`
  );
} else {
  expectIncludes("iOS Google services file", iosGoogleServicesFile, expectedVariant);
}

if (!androidGoogleServicesFile) {
  if (expectedVariant === "prod") {
    failures.push("Android Google services file is missing for the prod app variant");
  } else {
    warnings.push("Android Google services file is missing");
  }
} else if (androidGoogleServicesFile === "./google-services.json") {
  warnings.push(
    `Android Google services file is still using the legacy path '${androidGoogleServicesFile}'`
  );
} else {
  expectIncludes("Android Google services file", androidGoogleServicesFile, expectedVariant);
}

if (firebaseAndroidPackage) {
  expectEqual("Android Firebase package", firebaseAndroidPackage, packageId);
}

if (firebaseIosBundleId) {
  expectEqual("iOS Firebase bundle id", firebaseIosBundleId, bundleIdentifier);
}

const summary = {
  appName,
  bundleIdentifier,
  packageId,
  scheme,
  resolvedVariant,
  resolvedReleaseEnv,
  apiBase,
  streamingBase,
  webAppUrl,
  firebaseProjectId,
  firebaseAndroidPackage,
  firebaseIosBundleId,
  iosGoogleServicesFile,
  androidGoogleServicesFile,
  warnings,
  failures,
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
