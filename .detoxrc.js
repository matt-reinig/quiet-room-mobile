const path = require('path');

const androidDir = path.join(__dirname, 'android');
const iosDir = path.join(__dirname, 'ios');
const iosDerivedDataDir = path.join(iosDir, 'build');
const iosDebugAppPath = path.join(
  iosDerivedDataDir,
  'Build/Products/Debug-iphonesimulator/quietroommobile.app'
);
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
const buildDebug = `cd android && ${gradlew} assembleDebug assembleAndroidTest -DtestBuildType=debug`;
const buildRelease = `cd android && ${gradlew} assembleRelease assembleAndroidTest -DtestBuildType=release`;
const attachedDeviceName = process.env.DETOX_ATTACHED_DEVICE || process.env.ANDROID_SERIAL || 'emulator-5554';
const avdName = process.env.DETOX_AVD_NAME || 'QuietRoom_API_35';
const iosSimulatorName = process.env.DETOX_IOS_DEVICE || 'iPhone 17';
const buildIosDebug = [
  'xcodebuild',
  '-workspace ios/quietroommobile.xcworkspace',
  '-scheme quietroommobile',
  '-configuration Debug',
  '-sdk iphonesimulator',
  `-destination "platform=iOS Simulator,name=${iosSimulatorName}"`,
  '-derivedDataPath ios/build',
].join(' ');

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
  },
};
