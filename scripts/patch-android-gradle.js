const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
const rootBuildGradlePath = path.join(androidDir, 'build.gradle');
const mainManifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
const networkSecurityConfigPath = path.join(
  androidDir,
  'app',
  'src',
  'main',
  'res',
  'xml',
  'network_security_config.xml'
);

if (!fs.existsSync(appBuildGradlePath)) {
  console.error(`Android app build.gradle not found at ${appBuildGradlePath}`);
  process.exit(1);
}

if (!fs.existsSync(rootBuildGradlePath)) {
  console.error(`Android root build.gradle not found at ${rootBuildGradlePath}`);
  process.exit(1);
}

if (!fs.existsSync(mainManifestPath)) {
  console.error(`Android main manifest not found at ${mainManifestPath}`);
  process.exit(1);
}

let appSource = fs.readFileSync(appBuildGradlePath, 'utf8');
let rootSource = fs.readFileSync(rootBuildGradlePath, 'utf8');
let manifestSource = fs.readFileSync(mainManifestPath, 'utf8');

function ensureLineAfter(anchor, line) {
  if (appSource.includes(line)) {
    return;
  }

  if (!appSource.includes(anchor)) {
    throw new Error(`Unable to find anchor: ${anchor}`);
  }

  appSource = appSource.replace(anchor, `${anchor}\n        ${line}`);
}

function ensureDependencyAfter(anchor, dependencyLine) {
  if (appSource.includes(dependencyLine)) {
    return;
  }

  if (!appSource.includes(anchor)) {
    throw new Error(`Unable to find dependency anchor: ${anchor}`);
  }

  appSource = appSource.replace(anchor, `${anchor}\n    ${dependencyLine}`);
}

function ensureRootRepositoryLine(line) {
  if (rootSource.includes(line)) {
    return;
  }

  const anchor = `    maven { url 'https://www.jitpack.io' }`;
  if (!rootSource.includes(anchor)) {
    throw new Error(`Unable to find repository anchor: ${anchor}`);
  }

  rootSource = rootSource.replace(anchor, `${anchor}\n    ${line}`);
}

function resolveAndroidPackageName() {
  const namespaceMatch = appSource.match(/namespace '([^']+)'/);
  if (namespaceMatch) {
    return namespaceMatch[1];
  }

  const appIdMatch = appSource.match(/applicationId '([^']+)'/);
  if (appIdMatch) {
    return appIdMatch[1];
  }

  throw new Error('Unable to determine Android package name from build.gradle');
}

function writeDetoxTest(packageName) {
  const packagePath = packageName.split('.').join(path.sep);
  const detoxTestPath = path.join(
    androidDir,
    'app',
    'src',
    'androidTest',
    'java',
    packagePath,
    'DetoxTest.java'
  );
  const detoxTestSource = `package ${packageName};

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import com.wix.detox.Detox;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
  @Rule
  public ActivityTestRule<MainActivity> activityRule =
      new ActivityTestRule<>(MainActivity.class, false, false);

  @Test
  public void runDetoxTests() {
    Detox.runTests(activityRule);
  }
}
`;

  fs.mkdirSync(path.dirname(detoxTestPath), { recursive: true });
  fs.writeFileSync(detoxTestPath, detoxTestSource);
  return detoxTestPath;
}

function ensureManifestAttribute() {
  const attribute = `android:networkSecurityConfig="@xml/network_security_config"`;
  if (manifestSource.includes(attribute)) {
    return;
  }

  const applicationTag = `<application `;
  if (!manifestSource.includes(applicationTag)) {
    throw new Error('Unable to find <application> tag in AndroidManifest.xml');
  }

  manifestSource = manifestSource.replace(applicationTag, `<application ${attribute} `);
}

function writeNetworkSecurityConfig() {
  const contents = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />

  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

  fs.mkdirSync(path.dirname(networkSecurityConfigPath), { recursive: true });
  fs.writeFileSync(networkSecurityConfigPath, contents);
}

ensureLineAfter(`        versionName "1.0.0"`, `testBuildType System.getProperty('testBuildType', 'debug')`);
ensureLineAfter(
  `        testBuildType System.getProperty('testBuildType', 'debug')`,
  `testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'`
);
ensureDependencyAfter(`    implementation("com.facebook.react:react-android")`, `implementation("androidx.appcompat:appcompat:1.7.1")`);
ensureDependencyAfter(`    implementation("androidx.appcompat:appcompat:1.7.1")`, `androidTestImplementation('com.wix:detox:+')`);
ensureRootRepositoryLine(`maven { url("$rootDir/../node_modules/detox/Detox-android") }`);
ensureManifestAttribute();

const packageName = resolveAndroidPackageName();
const detoxTestPath = writeDetoxTest(packageName);
writeNetworkSecurityConfig();

fs.writeFileSync(appBuildGradlePath, appSource);
fs.writeFileSync(rootBuildGradlePath, rootSource);
fs.writeFileSync(mainManifestPath, manifestSource);
console.log(`Patched Android Detox Gradle config in ${appBuildGradlePath}`);
console.log(`Patched Android Detox repository config in ${rootBuildGradlePath}`);
console.log(`Patched Android manifest config in ${mainManifestPath}`);
console.log(`Patched Android network security config in ${networkSecurityConfigPath}`);
console.log(`Patched Android Detox test source in ${detoxTestPath}`);
