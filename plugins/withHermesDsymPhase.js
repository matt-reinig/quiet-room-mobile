const { createRunOncePlugin, withXcodeProject } = require("expo/config-plugins");

const PHASE_NAME = "Generate Hermes dSYM";
const INPUT_PATH = "\"${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/hermes.framework/hermes\"";
const OUTPUT_PATH = "\"${DWARF_DSYM_FOLDER_PATH}/hermes.framework.dSYM\"";
const SHELL_SCRIPT = [
  "if [ \"$CONFIGURATION\" != \"Release\" ]; then",
  "  exit 0",
  "fi",
  "",
  "HERMES_BINARY=\"${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/hermes.framework/hermes\"",
  "HERMES_DSYM=\"${DWARF_DSYM_FOLDER_PATH}/hermes.framework.dSYM\"",
  "",
  "if [ ! -f \"$HERMES_BINARY\" ]; then",
  "  echo \"warning: Hermes binary not found at $HERMES_BINARY\"",
  "  exit 0",
  "fi",
  "",
  "rm -rf \"$HERMES_DSYM\"",
  "echo \"Generating Hermes dSYM at $HERMES_DSYM\"",
  "xcrun dsymutil \"$HERMES_BINARY\" -o \"$HERMES_DSYM\"",
  "",
].join("\\n");

function hasHermesDsymPhase(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};

  return Object.values(phases).some(
    (phase) => phase && typeof phase === "object" && phase.name === `"${PHASE_NAME}"`
  );
}

function getHermesDsymPhaseId(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};

  return Object.entries(phases).find(
    ([, phase]) => phase && typeof phase === "object" && phase.name === `"${PHASE_NAME}"`
  )?.[0] || null;
}

function getFirstTargetBuildPhases(project) {
  const target = project.getFirstTarget();
  return target?.firstTarget?.buildPhases || [];
}

function reorderHermesDsymPhase(project) {
  const buildPhases = getFirstTargetBuildPhases(project);
  const hermesPhaseId = getHermesDsymPhaseId(project);

  if (!hermesPhaseId || !Array.isArray(buildPhases)) {
    return;
  }

  const hermesIndex = buildPhases.findIndex((phase) => phase.value === hermesPhaseId);
  const embedPodsIndex = buildPhases.findIndex(
    (phase) => phase.comment === "[CP] Embed Pods Frameworks"
  );

  if (hermesIndex === -1 || embedPodsIndex === -1 || hermesIndex === embedPodsIndex + 1) {
    return;
  }

  const [hermesPhase] = buildPhases.splice(hermesIndex, 1);
  const nextEmbedPodsIndex = buildPhases.findIndex(
    (phase) => phase.comment === "[CP] Embed Pods Frameworks"
  );

  buildPhases.splice(nextEmbedPodsIndex + 1, 0, hermesPhase);
}

const withHermesDsymPhase = (config) =>
  withXcodeProject(config, (configWithProject) => {
    const project = configWithProject.modResults;

    if (!hasHermesDsymPhase(project)) {
      project.addBuildPhase([], "PBXShellScriptBuildPhase", PHASE_NAME, project.getFirstTarget().uuid, {
        shellPath: "/bin/sh",
        shellScript: SHELL_SCRIPT,
        inputPaths: [INPUT_PATH],
        outputPaths: [OUTPUT_PATH],
      });
    }

    reorderHermesDsymPhase(project);

    return configWithProject;
  });

module.exports = createRunOncePlugin(withHermesDsymPhase, "with-hermes-dsym-phase", "1.0.0");
