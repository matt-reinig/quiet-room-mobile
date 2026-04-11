const config = require("../app.config.js").expo;

const summary = {
  loadedEnvFiles: {
    base: process.env.MOBILE_ENV_BASE_FILE || null,
    overlay: process.env.MOBILE_ENV_OVERLAY_FILE || null,
  },
  app: {
    name: config.name,
    scheme: config.scheme,
    slug: config.slug,
    variant: config.extra?.appVariant ?? null,
    releaseEnv: config.extra?.releaseEnv ?? null,
  },
  ios: {
    bundleIdentifier: config.ios?.bundleIdentifier ?? null,
    googleServicesFile: config.ios?.googleServicesFile ?? null,
  },
  android: {
    package: config.android?.package ?? null,
    googleServicesFile: config.android?.googleServicesFile ?? null,
  },
  runtime: {
    apiBase: process.env.EXPO_PUBLIC_API_BASE || null,
    streamingBase: process.env.EXPO_PUBLIC_STREAMING_BASE || "",
    webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL || null,
    firebaseProjectId: process.env.EXPO_PUBLIC_FB_PROJECT_ID || null,
  },
};

console.log(JSON.stringify(summary, null, 2));
