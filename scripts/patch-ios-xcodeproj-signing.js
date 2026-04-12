#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const iosDir = path.join(rootDir, "ios");
const pbxprojPath = (() => {
  const xcodeproj = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(".xcodeproj"));

  if (!xcodeproj) {
    return null;
  }

  return path.join(iosDir, xcodeproj.name, "project.pbxproj");
})();

if (!pbxprojPath || !fs.existsSync(pbxprojPath)) {
  console.error(`Xcode project file not found under ${iosDir}`);
  process.exit(1);
}

const teamId = process.env.QUIET_ROOM_APPLE_TEAM_ID || "SV7SPMY2Q8";
const source = fs.readFileSync(pbxprojPath, "utf8");
const HERMES_PHASE_COMMENT = "/* Generate Hermes dSYM */";
const EMBED_PHASE_COMMENT = "/* [CP] Embed Pods Frameworks */";

const normalizeBuildConfiguration = (body, name) => {
  let nextBody = body;

  // Let Xcode automatic signing choose the right identity for the config.
  nextBody = nextBody.replace(/^\s*"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = [^;]+;\n/gm, "");

  if (nextBody.includes("CODE_SIGN_STYLE =")) {
    nextBody = nextBody.replace(/CODE_SIGN_STYLE = [^;]+;/g, "CODE_SIGN_STYLE = Automatic;");
  } else {
    nextBody += `\n\t\t\t\tCODE_SIGN_STYLE = Automatic;`;
  }

  if (nextBody.includes("DEVELOPMENT_TEAM =")) {
    nextBody = nextBody.replace(/DEVELOPMENT_TEAM = [^;]+;/g, `DEVELOPMENT_TEAM = ${teamId};`);
    nextBody = nextBody.replace(
      /"DEVELOPMENT_TEAM\[sdk=iphoneos\*\]" = [^;]+;/g,
      `"DEVELOPMENT_TEAM[sdk=iphoneos*]" = ${teamId};`
    );
  } else {
    nextBody += `\n\t\t\t\tDEVELOPMENT_TEAM = ${teamId};`;
    nextBody += `\n\t\t\t\t"DEVELOPMENT_TEAM[sdk=iphoneos*]" = ${teamId};`;
  }

  if (name === "Release") {
    if (nextBody.includes("PROVISIONING_PROFILE_SPECIFIER =")) {
      nextBody = nextBody.replace(/PROVISIONING_PROFILE_SPECIFIER = [^;]*;/g, 'PROVISIONING_PROFILE_SPECIFIER = "";');
    } else {
      nextBody += `\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "";`;
    }
  }

  return nextBody;
};

let updated = source.replace(
  /([A-F0-9]+ \/\* (Debug|Release) \*\/ = \{\s*isa = XCBuildConfiguration;[\s\S]*?buildSettings = \{)([\s\S]*?)(\n\s*\};\s*\n\s*name = \2;\s*\n\s*\};)/g,
  (_match, start, name, body, end) => `${start}${normalizeBuildConfiguration(body, name)}${end}`
);

updated = updated.replace(
  /(buildPhases = \(\n)([\s\S]*?)(\n\s*\);)/,
  (match, start, body, end) => {
    const lines = body.split("\n");
    const hermesIndex = lines.findIndex((line) => line.includes(HERMES_PHASE_COMMENT));
    const embedIndex = lines.findIndex((line) => line.includes(EMBED_PHASE_COMMENT));

    if (hermesIndex === -1 || embedIndex === -1 || hermesIndex === embedIndex + 1) {
      return match;
    }

    const [hermesLine] = lines.splice(hermesIndex, 1);
    const nextEmbedIndex = lines.findIndex((line) => line.includes(EMBED_PHASE_COMMENT));
    lines.splice(nextEmbedIndex + 1, 0, hermesLine);

    return `${start}${lines.join("\n")}${end}`;
  }
);

if (updated === source) {
  console.log("iOS Xcode project signing settings already look patched.");
  process.exit(0);
}

fs.writeFileSync(pbxprojPath, updated);
console.log(`Patched iOS Xcode project signing settings in ${pbxprojPath}`);
