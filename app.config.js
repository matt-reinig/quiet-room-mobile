const fs = require("fs");
const path = require("path");

const appJson = require("./app.json");

const APP_VARIANTS = {
  prod: {
    androidPackage: "com.quietroom.mobile",
    appName: "Quiet Room",
    bundleIdentifier: "com.quietroom.mobile",
    scheme: "quietroommobile",
    defaultAndroidGoogleServicesFile: "./google-services.prod.json",
    defaultIosGoogleServicesFile: "./GoogleService-Info.prod.plist",
  },
  qa: {
    androidPackage: "com.quietroom.mobile.qa",
    appName: "Quiet Room QA",
    bundleIdentifier: "com.quietroom.mobile.qa",
    scheme: "quietroommobileqa",
    defaultAndroidGoogleServicesFile: "./google-services.qa.json",
    defaultIosGoogleServicesFile: "./GoogleService-Info.qa.plist",
    legacyAndroidGoogleServicesFile: "./google-services.json",
    legacyIosGoogleServicesFile: "./GoogleService-Info.plist",
  },
};

const RELEASE_ENVS = new Set(["local", "qa", "prod"]);

function resolveAppVariant(value) {
  return value === "qa" ? "qa" : "prod";
}

function resolveReleaseEnv(value) {
  if (RELEASE_ENVS.has(value)) {
    return value;
  }

  return "qa";
}

function pickExistingFile(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolvedPath = path.resolve(__dirname, candidate);
    if (fs.existsSync(resolvedPath)) {
      return candidate;
    }
  }

  return candidates.find(Boolean) || null;
}

const appVariant = resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
const releaseEnv = resolveReleaseEnv(process.env.EXPO_PUBLIC_RELEASE_ENV);
const variantConfig = APP_VARIANTS[appVariant];
const androidGoogleServicesFile = pickExistingFile(
  process.env.EXPO_PUBLIC_GOOGLE_SERVICES_FILE,
  variantConfig.defaultAndroidGoogleServicesFile,
  variantConfig.legacyAndroidGoogleServicesFile || null
);
const iosGoogleServicesFile = pickExistingFile(
  process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE,
  variantConfig.defaultIosGoogleServicesFile,
  variantConfig.legacyIosGoogleServicesFile || null
);
const resolvedAndroidGoogleServicesFile = androidGoogleServicesFile
  ? path.resolve(__dirname, androidGoogleServicesFile)
  : null;
const resolvedIosGoogleServicesFile = iosGoogleServicesFile
  ? path.resolve(__dirname, iosGoogleServicesFile)
  : null;
const expoConfig = { ...appJson.expo };
const androidConfig = { ...(expoConfig.android || {}) };
const iosConfig = { ...(expoConfig.ios || {}) };
const plugins = [...(expoConfig.plugins || [])];
const extraConfig = { ...(expoConfig.extra || {}) };

if (!plugins.includes("./plugins/withHermesDsymPhase")) {
  plugins.push("./plugins/withHermesDsymPhase");
}

if (resolvedAndroidGoogleServicesFile && fs.existsSync(resolvedAndroidGoogleServicesFile)) {
  androidConfig.googleServicesFile = androidGoogleServicesFile;
} else {
  delete androidConfig.googleServicesFile;
}

if (resolvedIosGoogleServicesFile && fs.existsSync(resolvedIosGoogleServicesFile)) {
  iosConfig.googleServicesFile = iosGoogleServicesFile;
} else {
  delete iosConfig.googleServicesFile;
}

androidConfig.package = variantConfig.androidPackage;
iosConfig.bundleIdentifier = variantConfig.bundleIdentifier;

module.exports = {
  ...appJson,
  expo: {
    ...expoConfig,
    name: variantConfig.appName,
    scheme: variantConfig.scheme,
    plugins,
    extra: {
      ...extraConfig,
      appVariant,
      releaseEnv,
    },
    android: androidConfig,
    ios: iosConfig,
  },
};
