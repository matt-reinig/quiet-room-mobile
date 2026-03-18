const fs = require("fs");
const path = require("path");

const appJson = require("./app.json");

const googleServicesFile =
  process.env.EXPO_PUBLIC_GOOGLE_SERVICES_FILE || "./google-services.json";
const resolvedGoogleServicesFile = path.resolve(__dirname, googleServicesFile);
const expoConfig = { ...appJson.expo };
const androidConfig = { ...(expoConfig.android || {}) };

if (fs.existsSync(resolvedGoogleServicesFile)) {
  androidConfig.googleServicesFile = googleServicesFile;
} else {
  delete androidConfig.googleServicesFile;
}

module.exports = {
  ...appJson,
  expo: {
    ...expoConfig,
    android: androidConfig,
  },
};
