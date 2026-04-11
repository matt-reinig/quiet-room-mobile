#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const podfilePath = path.join(rootDir, "ios", "Podfile");

if (!fs.existsSync(podfilePath)) {
  console.error(`Podfile not found at ${podfilePath}`);
  process.exit(1);
}

const existing = fs.readFileSync(podfilePath, "utf8");

if (existing.includes("target.name == 'fmt'")) {
  console.log("iOS Podfile already includes the fmt Xcode 26 workaround.");
  process.exit(0);
}

const anchor = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
`;

const addition = `

    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |build_configuration|
        # fmt 11.0.2 fails under Xcode 26 when compiled as C++20.
        build_configuration.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
`;

if (!existing.includes(anchor)) {
  console.error("Unable to find the Podfile post_install anchor for the fmt workaround.");
  process.exit(1);
}

const updated = existing.replace(anchor, `${anchor}${addition}`);
fs.writeFileSync(podfilePath, updated);
console.log("Patched iOS Podfile with the fmt Xcode 26 workaround.");
