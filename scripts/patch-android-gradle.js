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

function ensureBlockAfter(anchor, block) {
  const normalizedBlock = block.replace(/\s+$/, "");
  if (appSource.includes(normalizedBlock)) {
    return;
  }

  if (!appSource.includes(anchor)) {
    throw new Error(`Unable to find anchor: ${anchor}`);
  }

  appSource = appSource.replace(anchor, `${anchor}\n\n${normalizedBlock}`);
}

function ensureBlockAfterMatch(pattern, block) {
  const normalizedBlock = block.replace(/\s+$/, "");
  if (appSource.includes(normalizedBlock)) {
    return;
  }

  const match = appSource.match(pattern);
  if (!match) {
    throw new Error(`Unable to find regex anchor: ${pattern}`);
  }

  const anchor = match[0];
  appSource = appSource.replace(anchor, `${anchor}\n\n${normalizedBlock}`);
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

function ensureRootRepositoryFirst(line) {
  const repositoryLinePattern = new RegExp(`\\n\\s*${line.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}`, 'g');
  rootSource = rootSource.replace(repositoryLinePattern, '');

  const anchor = `allprojects {
  repositories {`;
  if (!rootSource.includes(anchor)) {
    throw new Error(`Unable to find repository block anchor: ${anchor}`);
  }

  rootSource = rootSource.replace(anchor, `${anchor}\n    ${line}`);
}

function replaceOnce(before, after) {
  if (appSource.includes(after)) {
    return;
  }

  if (!appSource.includes(before)) {
    throw new Error(`Unable to find replace target: ${before}`);
  }

  appSource = appSource.replace(before, after);
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

ensureBlockAfterMatch(
  /^def jscFlavor = .+$/m,
  `def resolveReleaseSigningValue(name) {
    return project.findProperty(name) ?: System.getenv(name)
}

def resolveReleaseSigningFilePath(pathValue) {
    if (pathValue == null || pathValue.toString().trim().isEmpty()) {
        return null
    }

    def candidate = new File(pathValue)
    if (candidate.isAbsolute()) {
        return candidate
    }

    return new File(rootDir.getAbsoluteFile().getParentFile().getAbsolutePath(), pathValue)
}

ext.quietRoomReleaseSigningStoreFile = resolveReleaseSigningValue("QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE")
ext.quietRoomReleaseSigningStorePassword = resolveReleaseSigningValue("QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD")
ext.quietRoomReleaseSigningKeyAlias = resolveReleaseSigningValue("QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS")
ext.quietRoomReleaseSigningKeyPassword = resolveReleaseSigningValue("QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD")
ext.quietRoomHasReleaseSigning = [
    ext.quietRoomReleaseSigningStoreFile,
    ext.quietRoomReleaseSigningStorePassword,
    ext.quietRoomReleaseSigningKeyAlias,
    ext.quietRoomReleaseSigningKeyPassword,
].every { value -> value != null && !value.toString().trim().isEmpty() }`
);
ensureLineAfter(`        versionName "1.0.0"`, `testBuildType System.getProperty('testBuildType', 'debug')`);
ensureLineAfter(
  `        testBuildType System.getProperty('testBuildType', 'debug')`,
  `testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'`
);
ensureBlockAfter(
  `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`,
  `        release {
            if (project.ext.quietRoomHasReleaseSigning) {
                storeFile resolveReleaseSigningFilePath(project.ext.quietRoomReleaseSigningStoreFile)
                storePassword project.ext.quietRoomReleaseSigningStorePassword
                keyAlias project.ext.quietRoomReleaseSigningKeyAlias
                keyPassword project.ext.quietRoomReleaseSigningKeyPassword
            }
        }`
);
ensureBlockAfter(
  `    androidResources {
        ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
    }
}`,
  `configurations.configureEach { configuration ->
    def configurationName = configuration.name.toLowerCase()
    if (configurationName.endsWith("runtimeclasspath") &&
        !configurationName.contains("androidtest") &&
        !configurationName.contains("unittest")) {
        configuration.exclude group: "androidx.test"
        configuration.exclude group: "androidx.test.ext"
        configuration.exclude group: "androidx.test.espresso"
        configuration.exclude group: "androidx.test.services"
    }
}`
);
replaceOnce(
  `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`,
  `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig project.ext.quietRoomHasReleaseSigning ? signingConfigs.release : signingConfigs.debug
            if (!project.ext.quietRoomHasReleaseSigning) {
                logger.warn("Quiet Room Android release signing is not configured. Falling back to the debug keystore.")
            }`
);
ensureDependencyAfter(`    implementation("com.facebook.react:react-android")`, `implementation("androidx.appcompat:appcompat:1.7.1")`);
ensureDependencyAfter(`    implementation("androidx.appcompat:appcompat:1.7.1")`, `implementation("androidx.core:core-splashscreen:1.0.1")`);
ensureDependencyAfter(`    implementation("androidx.core:core-splashscreen:1.0.1")`, `androidTestImplementation('com.wix:detox:+')`);
ensureDependencyAfter(`    androidTestImplementation('com.wix:detox:+')`, `androidTestImplementation("androidx.test:monitor:1.8.0")`);
ensureDependencyAfter(`    androidTestImplementation("androidx.test:monitor:1.8.0")`, `androidTestImplementation("androidx.test:runner:1.7.0")`);
ensureDependencyAfter(`    androidTestImplementation("androidx.test:runner:1.7.0")`, `androidTestImplementation("androidx.test:rules:1.7.0")`);
ensureDependencyAfter(`    androidTestImplementation("androidx.test:rules:1.7.0")`, `androidTestImplementation("androidx.test.ext:junit:1.3.0")`);
ensureDependencyAfter(`    androidTestImplementation("androidx.test.ext:junit:1.3.0")`, `androidTestImplementation("androidx.test.services:storage:1.6.0")`);
ensureDependencyAfter(`    androidTestImplementation("androidx.test.services:storage:1.6.0")`, `androidTestImplementation("junit:junit:4.13.2")`);
ensureRootRepositoryFirst(`maven { url("$rootDir/../node_modules/detox/Detox-android") }`);
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
