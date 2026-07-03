const fs = require('fs');
const path = require('path');

function resolveAppVariant(value) {
  return value === 'qa' ? 'qa' : 'prod';
}

function findFirstEntry(rootDir, matcher) {
  if (!fs.existsSync(rootDir)) {
    return null;
  }

  for (const entry of fs.readdirSync(rootDir)) {
    if (matcher(entry)) {
      return entry;
    }
  }

  return null;
}

const androidDir = path.join(__dirname, 'android');
const iosDir = path.join(__dirname, 'ios');
const appVariant = resolveAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
const iosProjectEntry = findFirstEntry(iosDir, (entry) => entry.endsWith('.xcodeproj'));
const iosWorkspaceEntry = findFirstEntry(iosDir, (entry) => entry.endsWith('.xcworkspace'));
const iosProjectName = iosProjectEntry ? path.basename(iosProjectEntry, '.xcodeproj') : 'quietroommobile';
const iosDebugAppPath = path.join(
  iosDir,
  'build',
  'Build/Products/Debug-iphonesimulator',
  `${iosProjectName}.app`
);
const iosReleaseAppPath = path.join(
  iosDir,
  'build',
  'Build/Products/Release-iphonesimulator',
  `${iosProjectName}.app`
);
const iosDerivedDataDir = path.join(iosDir, 'build');
const debugApkPath = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
const debugTestApkPath = path.join(
  androidDir,
  'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
);
const releaseApkPath = path.join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
const releaseTestApkPath = path.join(
  androidDir,
  'app/build/outputs/apk/androidTest/release/app-release-androidTest.apk'
);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const buildDebug = `cd android && ${gradlew} :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug`;
const buildRelease = `cd android && ${gradlew} :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=release`;
const attachedDeviceName = process.env.DETOX_ATTACHED_DEVICE || process.env.ANDROID_SERIAL || 'emulator-5554';
const avdName = process.env.DETOX_AVD_NAME || 'Pixel34AVD_2';
const iosSimulatorName = process.env.DETOX_IOS_DEVICE || 'iPhone 17';
const buildIosDebugArgs = [
  'xcodebuild',
  iosWorkspaceEntry ? `-workspace ios/${iosWorkspaceEntry}` : `-project ios/${iosProjectEntry || 'quietroommobile.xcodeproj'}`,
  `-scheme ${iosProjectName}`,
  '-configuration Debug',
  '-sdk iphonesimulator',
  `-destination "platform=iOS Simulator,name=${iosSimulatorName}"`,
  '-derivedDataPath ios/build',
];
const buildIosDebug = buildIosDebugArgs.join(' ');
const buildIosReleaseArgs = [
  'xcodebuild',
  iosWorkspaceEntry ? `-workspace ios/${iosWorkspaceEntry}` : `-project ios/${iosProjectEntry || 'quietroommobile.xcodeproj'}`,
  `-scheme ${iosProjectName}`,
  '-configuration Release',
  '-sdk iphonesimulator',
  `-destination "platform=iOS Simulator,name=${iosSimulatorName}"`,
  '-derivedDataPath ios/build',
];
const buildIosRelease = buildIosReleaseArgs.join(' ');

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 180000,
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: debugApkPath,
      testBinaryPath: debugTestApkPath,
      build: buildDebug,
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: releaseApkPath,
      testBinaryPath: releaseTestApkPath,
      build: buildRelease,
    },
    'ios.debug': {
      type: 'ios.app',
      binaryPath: iosDebugAppPath,
      build: buildIosDebug,
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: iosReleaseAppPath,
      build: buildIosRelease,
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName,
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: attachedDeviceName,
      },
    },
    iosSimulator: {
      type: 'ios.simulator',
      device: {
        type: iosSimulatorName,
      },
    },
  },
  configurations: {
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release',
    },
    'ios.sim.debug': {
      device: 'iosSimulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'iosSimulator',
      app: 'ios.release',
    },
  },
};
