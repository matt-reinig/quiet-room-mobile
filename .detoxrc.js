const path = require('path');

const detoxBuildDir = 'D:/Temp/quiet-room-mobile-detox';

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
      binaryPath: path.join(detoxBuildDir, 'app-debug.apk'),
      testBinaryPath: path.join(detoxBuildDir, 'app-debug-androidTest.apk'),
      build: 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\prepare-detox-build.ps1 -BuildType debug',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: path.join(detoxBuildDir, 'app-release.apk'),
      testBinaryPath: path.join(detoxBuildDir, 'app-release-androidTest.apk'),
      build: 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\prepare-detox-build.ps1 -BuildType release',
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel34AVD_2',
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: 'emulator-5556',
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
  },
};
