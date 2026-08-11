#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="$repo_root/dist/mac-arm64/TokenStats.app"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/tokenstats-macos-arm64.XXXXXX")"
user_data_dir="$temp_root/user-data"
signature_details="$temp_root/codesign.txt"
process_id=""
debug_port="$((20000 + RANDOM % 20000))"

cleanup() {
  local status=$?
  if [[ -n "$process_id" ]] && kill -0 "$process_id" 2>/dev/null; then
    kill "$process_id" 2>/dev/null || true
    wait "$process_id" 2>/dev/null || true
  fi
  rm -rf -- "$temp_root"
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "macOS arm64 validation failed: $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "host must be Darwin"
[[ "$(uname -m)" == "arm64" ]] || fail "host must be arm64 (got $(uname -m))"
[[ -d "$app_path" ]] || fail "packaged app not found at $app_path"

main_executable="$app_path/Contents/MacOS/TokenStats"
[[ -x "$main_executable" ]] || fail "main executable not found at $main_executable"

require_arm64() {
  local binary=$1
  local description=$2
  local binary_type
  binary_type="$(file -b "$binary")"
  [[ "$binary_type" == *"arm64"* ]] || fail "$description is not arm64: $binary_type"
}

require_arm64 "$main_executable" "main executable"
native_modules=()
while IFS= read -r -d '' native_module; do
  native_modules+=("$native_module")
done < <(find "$app_path" -type f -name '*.node' -print0)
(( ${#native_modules[@]} > 0 )) || fail "no packaged native modules found"

better_sqlite3_module=""
for native_module in "${native_modules[@]}"; do
  require_arm64 "$native_module" "native module $native_module"
  if [[ "$(basename "$native_module")" == "better_sqlite3.node" ]]; then
    better_sqlite3_module="$native_module"
  fi
done
[[ -n "$better_sqlite3_module" ]] || fail "packaged better_sqlite3.node not found"

codesign --verify --deep --strict "$app_path" || fail "codesign verification failed"
codesign --display --verbose=4 "$app_path" >"$signature_details" 2>&1 || fail "could not inspect code signature"
grep -q '^Signature=adhoc$' "$signature_details" || fail "app is not ad-hoc signed"

echo "Validated arm64 binaries, including $(basename "$better_sqlite3_module"), and ad-hoc signature."
mkdir -p "$user_data_dir"
"$main_executable" --user-data-dir="$user_data_dir" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$debug_port" >"$temp_root/app.log" 2>&1 &
process_id=$!

for _ in {1..40}; do
  if ! kill -0 "$process_id" 2>/dev/null; then
    tail -n 20 "$temp_root/app.log" >&2 || true
    fail "packaged app exited before its renderer appeared"
  fi
  pages="$(curl --fail --silent --show-error "http://127.0.0.1:$debug_port/json/list" 2>/dev/null || true)"
  if printf '%s' "$pages" | grep -Eq '"title"[[:space:]]*:[[:space:]]*"TokenStats"'; then
    echo "Packaged TokenStats renderer appeared through local DevTools."
    exit 0
  fi
  sleep 0.5
done

tail -n 20 "$temp_root/app.log" >&2 || true
fail "TokenStats renderer did not appear through local DevTools"
