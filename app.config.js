const fs = require("fs");
const path = require("path");

const appJson = require("./app.json");

const androidGoogleServicesFile =
  process.env.EXPO_PUBLIC_GOOGLE_SERVICES_FILE || "./google-services.json";
const iosGoogleServicesFile =
  process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE || "./GoogleService-Info.plist";
const resolvedAndroidGoogleServicesFile = path.resolve(__dirname, androidGoogleServicesFile);
const resolvedIosGoogleServicesFile = path.resolve(__dirname, iosGoogleServicesFile);
const expoConfig = { ...appJson.expo };
const androidConfig = { ...(expoConfig.android || {}) };
const iosConfig = { ...(expoConfig.ios || {}) };
const plugins = [...(expoConfig.plugins || [])];

if (!plugins.includes("./plugins/withHermesDsymPhase")) {
  plugins.push("./plugins/withHermesDsymPhase");
}

if (fs.existsSync(resolvedAndroidGoogleServicesFile)) {
  androidConfig.googleServicesFile = androidGoogleServicesFile;
} else {
  delete androidConfig.googleServicesFile;
}

if (fs.existsSync(resolvedIosGoogleServicesFile)) {
  iosConfig.googleServicesFile = iosGoogleServicesFile;
} else {
  delete iosConfig.googleServicesFile;
}

module.exports = {
  ...appJson,
  expo: {
    ...expoConfig,
    plugins,
    android: androidConfig,
    ios: iosConfig,
  },
};
