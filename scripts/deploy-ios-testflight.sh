#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
BASE_EXPORT_OPTIONS="$ROOT_DIR/scripts/ios-export-options-app-store.plist"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
PROFILE_DIR="${QUIET_ROOM_IOS_PROFILE_DIR:-$HOME/Library/MobileDevice/Provisioning Profiles}"
DOWNLOADS_DIR="${QUIET_ROOM_IOS_DOWNLOADS_DIR:-$HOME/Downloads}"

LANE="${1:-}"
if [[ "$LANE" == "qa" || "$LANE" == "prod" ]]; then
  shift
else
  LANE="prod"
fi

TEAM_ID="${QUIET_ROOM_IOS_TEAM_ID:-SV7SPMY2Q8}"
DESTINATION="export"
INTERNAL_ONLY=true
VERIFY_PROFILE_ONLY=false
CLEAN_OUTPUTS=true
SKIP_PREFLIGHT=false
ARCHIVE_PATH=""
EXPORT_PATH=""
EXPORT_OPTIONS_PATH=""
WORKSPACE="${QUIET_ROOM_IOS_WORKSPACE:-}"
SCHEME="${QUIET_ROOM_IOS_SCHEME:-}"
CONFIGURATION="${QUIET_ROOM_IOS_CONFIGURATION:-Release}"

case "$LANE" in
  qa)
    LANE_UPPER="QA"
    APP_VARIANT="qa"
    RELEASE_ENV="qa"
    BUNDLE_ID="${QUIET_ROOM_IOS_QA_BUNDLE_ID:-com.quietroom.mobile.qa}"
    PROFILE_MODE="${QUIET_ROOM_IOS_QA_SIGNING_MODE:-manual}"
    PROFILE_NAME="${QUIET_ROOM_IOS_QA_PROFILE_NAME:-}"
    PROFILE_UUID="${QUIET_ROOM_IOS_QA_PROFILE_UUID:-}"
    PROFILE_PATH="${QUIET_ROOM_IOS_QA_PROFILE_PATH:-}"
    ;;
  prod)
    LANE_UPPER="PROD"
    APP_VARIANT="prod"
    RELEASE_ENV="prod"
    BUNDLE_ID="${QUIET_ROOM_IOS_PROD_BUNDLE_ID:-com.quietroom.mobile}"
    PROFILE_MODE="${QUIET_ROOM_IOS_PROD_SIGNING_MODE:-manual}"
    PROFILE_NAME="${QUIET_ROOM_IOS_PROD_PROFILE_NAME:-matt profile}"
    PROFILE_UUID="${QUIET_ROOM_IOS_PROD_PROFILE_UUID:-}"
    PROFILE_PATH="${QUIET_ROOM_IOS_PROD_PROFILE_PATH:-}"
    ;;
  *)
    echo "Unsupported lane: $LANE" >&2
    exit 1
    ;;
esac

APP_ID="$TEAM_ID.$BUNDLE_ID"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/deploy-ios-testflight.sh <qa|prod> [--upload] [options]

Examples:
  npm run ios:testflight:export:qa
  npm run ios:testflight:deploy:qa
  npm run ios:testflight:profile:prod
  npm run ios:testflight:deploy:prod

Options:
  --upload                    Upload to App Store Connect instead of exporting an IPA locally.
  --profile-only              Validate required signing profile state, then exit.
  --archive-path PATH         Override the .xcarchive output path.
  --export-path PATH          Override the export output directory.
  --export-options-path PATH  Override the generated export options plist path.
  --profile-name NAME         Manual provisioning profile name to use.
  --profile-uuid UUID         Manual provisioning profile UUID to prefer.
  --profile-path PATH         Manual provisioning profile file to use.
  --manual-signing            Use a local manual App Store profile for this lane.
  --automatic-signing         Use unsigned archive plus automatic App Store export signing.
  --external-testflight       Do not mark an upload as internal-TestFlight-only.
  --no-clean                  Do not remove existing archive/export outputs first.
  --skip-preflight            Skip the lane env/config preflight.
  --help, -h                  Show this help.

Environment overrides:
  QUIET_ROOM_IOS_QA_SIGNING_MODE, QUIET_ROOM_IOS_QA_PROFILE_NAME,
  QUIET_ROOM_IOS_QA_PROFILE_UUID, QUIET_ROOM_IOS_QA_PROFILE_PATH,
  QUIET_ROOM_IOS_PROD_SIGNING_MODE, QUIET_ROOM_IOS_PROD_PROFILE_NAME,
  QUIET_ROOM_IOS_PROD_PROFILE_UUID, QUIET_ROOM_IOS_PROD_PROFILE_PATH,
  QUIET_ROOM_IOS_TEAM_ID, QUIET_ROOM_IOS_WORKSPACE, QUIET_ROOM_IOS_SCHEME.
EOF
}

replace_bool() {
  local key="$1"
  local value="$2"
  local plist="$3"

  if [[ "$value" == true ]]; then
    plutil -insert "$key" -bool true "$plist" 2>/dev/null || plutil -replace "$key" -bool true "$plist"
  else
    plutil -insert "$key" -bool false "$plist" 2>/dev/null || plutil -replace "$key" -bool false "$plist"
  fi
}

decode_profile() {
  local profile="$1"
  local plist="$2"

  /usr/bin/security cms -D -i "$profile" >"$plist" 2>/dev/null
}

read_plist_value() {
  local plist="$1"
  local key_path="$2"

  "$PLIST_BUDDY" -c "Print $key_path" "$plist" 2>/dev/null || true
}

find_prod_file() {
  local pattern="$1"
  find "$IOS_DIR" -path "*/Pods.xcodeproj/*" -prune -o -name "$pattern" -print | head -n 1
}

detect_workspace_and_scheme() {
  if [[ -z "$WORKSPACE" ]]; then
    WORKSPACE="$(find "$IOS_DIR" -maxdepth 1 -name "*.xcworkspace" -print | head -n 1)"
    WORKSPACE="${WORKSPACE#$ROOT_DIR/}"
  fi

  if [[ -z "$SCHEME" ]]; then
    local scheme_file
    scheme_file="$(find_prod_file "*.xcscheme")"
    SCHEME="$(basename "$scheme_file" .xcscheme)"
  fi

  if [[ -z "$WORKSPACE" || -z "$SCHEME" ]]; then
    echo "Could not detect iOS workspace and scheme. Run npm run native:sync:$LANE first." >&2
    exit 1
  fi
}

validate_native_bundle_id() {
  local pbxproj info_plist native_bundle_ids plist_bundle_id
  pbxproj="$(find_prod_file project.pbxproj)"
  info_plist="$(find "$IOS_DIR" -maxdepth 2 -name Info.plist -print | head -n 1)"

  if [[ ! -f "$pbxproj" || ! -f "$info_plist" ]]; then
    echo "Missing generated iOS project files. Run npm run native:sync:$LANE first." >&2
    exit 1
  fi

  native_bundle_ids="$(sed -n 's/.*PRODUCT_BUNDLE_IDENTIFIER = \(.*\);/\1/p' "$pbxproj" | sort -u)"
  plist_bundle_id="$(read_plist_value "$info_plist" ":CFBundleIdentifier")"

  if ! printf '%s\n' "$native_bundle_ids" | grep -qx "$BUNDLE_ID"; then
    cat >&2 <<EOF
Native iOS project is not synced for $LANE.

Expected PRODUCT_BUNDLE_IDENTIFIER:
  $BUNDLE_ID

Found:
$native_bundle_ids

Run:
  npm run native:sync:$LANE
  bash ./scripts/prepare-ios-testflight.sh --version <version> --build-number <build>
EOF
    exit 1
  fi

  if [[ "$plist_bundle_id" != "\$(PRODUCT_BUNDLE_IDENTIFIER)" && "$plist_bundle_id" != "$BUNDLE_ID" ]]; then
    echo "Info.plist CFBundleIdentifier is $plist_bundle_id, expected $BUNDLE_ID or \$(PRODUCT_BUNDLE_IDENTIFIER)." >&2
    exit 1
  fi
}

find_manual_profile() {
  local tmp_plist
  tmp_plist="$(mktemp)"
  local best_path=""
  local best_mtime=0
  local best_uuid=""
  local best_name=""
  local best_app_id=""
  local best_signin=""
  local best_expiration=""

  shopt -s nullglob
  local candidates=()
  if [[ -n "$PROFILE_PATH" ]]; then
    candidates+=("$PROFILE_PATH")
  fi
  if [[ -n "$PROFILE_UUID" ]]; then
    candidates+=("$PROFILE_DIR/$PROFILE_UUID.mobileprovision")
  fi
  candidates+=("$PROFILE_DIR"/*.mobileprovision)
  candidates+=("$DOWNLOADS_DIR"/*.mobileprovision)
  shopt -u nullglob

  for candidate in "${candidates[@]}"; do
    [[ -f "$candidate" ]] || continue
    decode_profile "$candidate" "$tmp_plist" || continue

    local name uuid app_id signin expiration mtime
    name="$(read_plist_value "$tmp_plist" ":Name")"
    uuid="$(read_plist_value "$tmp_plist" ":UUID")"
    app_id="$(read_plist_value "$tmp_plist" ":Entitlements:application-identifier")"
    signin="$(read_plist_value "$tmp_plist" ":Entitlements:com.apple.developer.applesignin:0")"
    expiration="$(read_plist_value "$tmp_plist" ":ExpirationDate")"

    if [[ -n "$PROFILE_NAME" && "$name" != "$PROFILE_NAME" ]]; then
      continue
    fi
    [[ "$app_id" == "$APP_ID" ]] || continue
    [[ "$signin" == "Default" ]] || continue
    if [[ -n "$PROFILE_UUID" && "$uuid" != "$PROFILE_UUID" ]]; then
      continue
    fi

    mtime="$(stat -f "%m" "$candidate")"
    if [[ -z "$best_path" || "$mtime" -gt "$best_mtime" ]]; then
      best_path="$candidate"
      best_mtime="$mtime"
      best_uuid="$uuid"
      best_name="$name"
      best_app_id="$app_id"
      best_signin="$signin"
      best_expiration="$expiration"
    fi
  done

  rm -f "$tmp_plist"

  if [[ -z "$best_path" ]]; then
    cat >&2 <<EOF
Missing a usable $LANE App Store provisioning profile.

Expected:
  profile name: ${PROFILE_NAME:-<any>}
  app id: $APP_ID
  entitlement: com.apple.developer.applesignin = Default

Install the refreshed .mobileprovision under:
  $PROFILE_DIR

or set QUIET_ROOM_IOS_${LANE_UPPER}_PROFILE_PATH to the downloaded profile file.
EOF
    exit 1
  fi

  SELECTED_PROFILE_PATH="$best_path"
  SELECTED_PROFILE_UUID="$best_uuid"
  SELECTED_PROFILE_NAME="$best_name"
  SELECTED_PROFILE_APP_ID="$best_app_id"
  SELECTED_PROFILE_APPLE_SIGNIN="$best_signin"
  SELECTED_PROFILE_EXPIRATION="$best_expiration"
}

install_selected_profile_if_needed() {
  local installed_profile_path="$PROFILE_DIR/$SELECTED_PROFILE_UUID.mobileprovision"

  if [[ "$SELECTED_PROFILE_PATH" != "$installed_profile_path" ]]; then
    mkdir -p "$PROFILE_DIR"
    cp "$SELECTED_PROFILE_PATH" "$installed_profile_path"
    SELECTED_PROFILE_PATH="$installed_profile_path"
  fi
}

verify_app_entitlements() {
  local app_path="$1"
  local label="$2"
  local entitlements
  entitlements="$(mktemp)"

  /usr/bin/codesign -d --entitlements :- "$app_path" >"$entitlements" 2>/dev/null

  local signed_app_id signed_signin
  signed_app_id="$(read_plist_value "$entitlements" ":application-identifier")"
  signed_signin="$(read_plist_value "$entitlements" ":com.apple.developer.applesignin:0")"

  rm -f "$entitlements"

  if [[ "$signed_app_id" != "$APP_ID" || "$signed_signin" != "Default" ]]; then
    echo "$label is not signed with the expected $LANE Apple Sign In entitlements." >&2
    echo "  application-identifier: ${signed_app_id:-<missing>}" >&2
    echo "  com.apple.developer.applesignin: ${signed_signin:-<missing>}" >&2
    exit 1
  fi

  echo "$label entitlements verified:"
  echo "  application-identifier: $signed_app_id"
  echo "  com.apple.developer.applesignin: $signed_signin"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upload)
      DESTINATION="upload"
      shift
      ;;
    --profile-only)
      VERIFY_PROFILE_ONLY=true
      shift
      ;;
    --archive-path)
      ARCHIVE_PATH="${2:-}"
      shift 2
      ;;
    --export-path)
      EXPORT_PATH="${2:-}"
      shift 2
      ;;
    --export-options-path)
      EXPORT_OPTIONS_PATH="${2:-}"
      shift 2
      ;;
    --profile-name)
      PROFILE_NAME="${2:-}"
      shift 2
      ;;
    --profile-uuid)
      PROFILE_UUID="${2:-}"
      shift 2
      ;;
    --profile-path)
      PROFILE_PATH="${2:-}"
      shift 2
      ;;
    --manual-signing)
      PROFILE_MODE="manual"
      shift
      ;;
    --automatic-signing)
      PROFILE_MODE="automatic"
      shift
      ;;
    --external-testflight)
      INTERNAL_ONLY=false
      shift
      ;;
    --no-clean)
      CLEAN_OUTPUTS=false
      shift
      ;;
    --skip-preflight)
      SKIP_PREFLIGHT=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$BASE_EXPORT_OPTIONS" ]]; then
  echo "Missing export options template: $BASE_EXPORT_OPTIONS" >&2
  exit 1
fi

case "$PROFILE_MODE" in
  manual|automatic)
    ;;
  *)
    echo "Unsupported signing mode for $LANE: $PROFILE_MODE" >&2
    exit 1
    ;;
esac

if [[ "$PROFILE_MODE" == "manual" ]]; then
  find_manual_profile
  install_selected_profile_if_needed

  echo "Using $LANE App Store provisioning profile"
  echo "  name: $SELECTED_PROFILE_NAME"
  echo "  uuid: $SELECTED_PROFILE_UUID"
  echo "  application-identifier: $SELECTED_PROFILE_APP_ID"
  echo "  com.apple.developer.applesignin: $SELECTED_PROFILE_APPLE_SIGNIN"
  echo "  expires: $SELECTED_PROFILE_EXPIRATION"
  echo "  path: $SELECTED_PROFILE_PATH"
  echo
else
  echo "Using automatic App Store export signing for $LANE"
  echo "  app id: $APP_ID"
  echo
fi

if [[ "$VERIFY_PROFILE_ONLY" == true ]]; then
  exit 0
fi

detect_workspace_and_scheme
validate_native_bundle_id

if [[ "$SKIP_PREFLIGHT" != true ]]; then
  bash "$ROOT_DIR/scripts/with-mobile-env.sh" "$APP_VARIANT" "$RELEASE_ENV" bash "$ROOT_DIR/scripts/ios-testflight-preflight.sh" "$APP_VARIANT" "$RELEASE_ENV"
  echo
fi

build_number="$(node -e "const app=require(process.argv[1]); process.stdout.write(String(app.expo?.ios?.buildNumber || ''));" "$ROOT_DIR/app.json")"
if [[ -z "$build_number" ]]; then
  echo "Missing expo.ios.buildNumber in app.json. Run npm run ios:testflight:prepare first." >&2
  exit 1
fi

ARCHIVE_PATH="${ARCHIVE_PATH:-build/ios-${LANE}-b${build_number}.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-build/testflight-export-${LANE}-b${build_number}}"
EXPORT_OPTIONS_PATH="${EXPORT_OPTIONS_PATH:-build/exportOptions-${LANE}-b${build_number}.plist}"

mkdir -p "$(dirname "$ARCHIVE_PATH")"
mkdir -p "$(dirname "$EXPORT_OPTIONS_PATH")"

if [[ "$CLEAN_OUTPUTS" == true ]]; then
  rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
fi

cp "$BASE_EXPORT_OPTIONS" "$EXPORT_OPTIONS_PATH"
plutil -replace destination -string "$DESTINATION" "$EXPORT_OPTIONS_PATH"
plutil -replace teamID -string "$TEAM_ID" "$EXPORT_OPTIONS_PATH"

if [[ "$PROFILE_MODE" == "manual" ]]; then
  plutil -replace signingStyle -string manual "$EXPORT_OPTIONS_PATH"
  plutil -remove provisioningProfiles "$EXPORT_OPTIONS_PATH" 2>/dev/null || true
  plutil -insert provisioningProfiles -json "{\"$BUNDLE_ID\":\"$SELECTED_PROFILE_UUID\"}" "$EXPORT_OPTIONS_PATH"
else
  plutil -replace signingStyle -string automatic "$EXPORT_OPTIONS_PATH"
  plutil -remove provisioningProfiles "$EXPORT_OPTIONS_PATH" 2>/dev/null || true
fi

if [[ "$DESTINATION" == "upload" ]]; then
  replace_bool testFlightInternalTestingOnly "$INTERNAL_ONLY" "$EXPORT_OPTIONS_PATH"
fi

echo "Archiving $LANE Release build"
if [[ "$PROFILE_MODE" == "manual" ]]; then
  bash "$ROOT_DIR/scripts/with-mobile-env.sh" "$APP_VARIANT" "$RELEASE_ENV" xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    archive \
    -allowProvisioningUpdates \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_IDENTITY="Apple Distribution" \
    PROVISIONING_PROFILE="$SELECTED_PROFILE_UUID" \
    PROVISIONING_PROFILE_SPECIFIER="$SELECTED_PROFILE_NAME"
else
  bash "$ROOT_DIR/scripts/with-mobile-env.sh" "$APP_VARIANT" "$RELEASE_ENV" xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGNING_ALLOWED=NO \
    archive
fi

archive_app_path="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name "*.app" -print | head -n 1)"
if [[ -z "$archive_app_path" ]]; then
  echo "Archive did not contain an app under $ARCHIVE_PATH/Products/Applications" >&2
  exit 1
fi

if [[ "$PROFILE_MODE" == "manual" ]]; then
  echo
  verify_app_entitlements "$archive_app_path" "Archive app"
  echo
fi

echo "Exporting $LANE archive"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
  -allowProvisioningUpdates

if [[ "$DESTINATION" == "export" ]]; then
  ipa_path="$(find "$EXPORT_PATH" -maxdepth 1 -name "*.ipa" -print | head -n 1 || true)"
  if [[ -n "$ipa_path" ]]; then
    unzip_dir="$(mktemp -d)"
    unzip -q "$ipa_path" -d "$unzip_dir"
    exported_app_path="$(find "$unzip_dir/Payload" -maxdepth 1 -name "*.app" -print | head -n 1)"
    verify_app_entitlements "$exported_app_path" "Exported IPA app"
    rm -rf "$unzip_dir"
  fi
fi

echo
echo "$LANE TestFlight ${DESTINATION} complete"
echo "  archive: $ARCHIVE_PATH"
if [[ "$DESTINATION" == "upload" ]]; then
  echo "  upload destination: App Store Connect"
else
  echo "  export path: $EXPORT_PATH"
fi
echo "  export options: $EXPORT_OPTIONS_PATH"
