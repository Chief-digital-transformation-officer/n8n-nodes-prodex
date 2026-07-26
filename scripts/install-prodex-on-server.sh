#!/usr/bin/env bash
# Install or update n8n-nodes-prodex into a self-hosted Docker n8n instance.
#
# Usage (from a git clone):
#   sudo bash scripts/install-prodex-on-server.sh
#
# One-liner (install and update):
#   curl -fsSL https://raw.githubusercontent.com/Chief-digital-transformation-officer/n8n-nodes-prodex/master/scripts/install-prodex-on-server.sh | sudo bash
#
# Environment overrides:
#   REPO_URL          git remote (default: this repo)
#   REPO_BRANCH       git branch to track (default: master)
#   REPO_DIR          source tree (skip auto-sync when set)
#   SKIP_REPO_SYNC=1  use current checkout instead of syncing DEFAULT_CLONE_DIR
#   N8N_CONTAINER     main n8n container name
#   N8N_STORAGE       host path for n8n data (auto-detected from mounts/volumes)
#   COMPOSE_DIR       directory with docker-compose.yml
#   NODE_IMAGE        build image (default: node:24-alpine)
#   SKIP_RESTART=1    install without restarting n8n
#   SKIP_BUILD=1      only reinstall existing tarball
#   PRODEX_N8N_API_KEY  optional n8n API key for n8n-as-code workspace bootstrap

set -eu

REPO_URL="${REPO_URL:-https://github.com/Chief-digital-transformation-officer/n8n-nodes-prodex.git}"
REPO_BRANCH="${REPO_BRANCH:-master}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
DEFAULT_CLONE_DIR="${DEFAULT_CLONE_DIR:-/opt/n8n/n8n-nodes-prodex}"

log() { printf '%s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Run as root (sudo bash $0)"
  fi
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_pkg() {
  local pkg="$1"
  if command -v "$pkg" >/dev/null 2>&1; then
    return 0
  fi
  log "Installing missing dependency: $pkg"
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update -qq
    run_as_root apt-get install -y "$pkg"
    return 0
  fi
  if command -v apk >/dev/null 2>&1; then
    run_as_root apk add --no-cache "$pkg"
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y "$pkg"
    return 0
  fi
  die "Cannot install $pkg automatically. Install it and rerun."
}

ensure_prerequisites() {
  install_pkg git
  install_pkg python3
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker not found. Trying docker.io (Debian/Ubuntu)..."
    if command -v apt-get >/dev/null 2>&1; then
      run_as_root apt-get update -qq
      run_as_root apt-get install -y docker.io docker-compose-plugin || run_as_root apt-get install -y docker.io docker-compose
    else
      die "Install Docker manually, then rerun."
    fi
  fi
  if ! docker info >/dev/null 2>&1; then
    die "Docker is installed but not running. Start docker and rerun."
  fi
}

script_dir() {
  cd "$(dirname "$0")" && pwd
}

sync_default_clone() {
  if [ -d "$DEFAULT_CLONE_DIR/.git" ]; then
    log "Updating $DEFAULT_CLONE_DIR (origin/$REPO_BRANCH) ..."
    git -C "$DEFAULT_CLONE_DIR" fetch origin
    git -C "$DEFAULT_CLONE_DIR" reset --hard "origin/$REPO_BRANCH"
    return 0
  fi

  log "Cloning $REPO_URL -> $DEFAULT_CLONE_DIR"
  mkdir -p "$(dirname "$DEFAULT_CLONE_DIR")"
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$DEFAULT_CLONE_DIR"
}

resolve_repo_dir() {
  if [ -n "${REPO_DIR:-}" ]; then
    [ -f "$REPO_DIR/package.json" ] || die "REPO_DIR has no package.json: $REPO_DIR"
    return 0
  fi

  if [ "${SKIP_REPO_SYNC:-0}" = "1" ]; then
    local candidate
    candidate="$(script_dir)/.."
    if [ -f "$candidate/package.json" ] && grep -q '"name": "n8n-nodes-prodex"' "$candidate/package.json"; then
      REPO_DIR="$(cd "$candidate" && pwd)"
      return 0
    fi
    die "SKIP_REPO_SYNC=1 but script is not inside an n8n-nodes-prodex checkout"
  fi

  sync_default_clone
  REPO_DIR="$DEFAULT_CLONE_DIR"
}

running_from_repo_script() {
  local repo_script="$1"
  local current="${BASH_SOURCE[0]:-$0}"
  if [ ! -f "$current" ]; then
    return 1
  fi
  [ "$(cd "$(dirname "$current")" && pwd -P)/$(basename "$current")" = "$(cd "$(dirname "$repo_script")" && pwd -P)/$(basename "$repo_script")" ]
}

reexec_from_repo_if_needed() {
  local repo_script="$REPO_DIR/scripts/install-prodex-on-server.sh"
  [ -f "$repo_script" ] || return 0
  if [ "${PRODEX_INSTALL_REEXEC:-0}" = "1" ]; then
    return 0
  fi
  if running_from_repo_script "$repo_script"; then
    return 0
  fi
  log "Re-running from clone: $repo_script"
  PRODEX_INSTALL_REEXEC=1 exec bash "$repo_script" "$@"
}

n8n_data_dir_in_container() {
  docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n 's/^N8N_USER_FOLDER=//p' | head -n1
}

inspect_n8n_mount() {
  local container="$1"
  local user_folder
  user_folder="$(n8n_data_dir_in_container "$container")"
  user_folder="${user_folder:-/home/node/.n8n}"
  python3 - "$container" "$user_folder" <<'PY'
import json, subprocess, sys

container, user_folder = sys.argv[1], sys.argv[2]
raw = subprocess.check_output(
    ["docker", "inspect", container, "--format", "{{json .Mounts}}"],
    text=True,
)
mounts = json.loads(raw or "[]")
destinations = {user_folder, "/home/node/.n8n", "/data"}

for mount in mounts:
    dest = mount.get("Destination", "")
    if dest not in destinations and not dest.rstrip("/").endswith(".n8n"):
        continue
    source = mount.get("Source", "")
    if source:
        print(source)
        sys.exit(0)

name = ""
for mount in mounts:
    dest = mount.get("Destination", "")
    if dest in destinations or dest.rstrip("/").endswith(".n8n"):
        name = mount.get("Name", "")
        break

if name:
    raw = subprocess.check_output(["docker", "volume", "inspect", name, "--format", "{{json .}}"], text=True)
    data = json.loads(raw)
    if isinstance(data, list):
        data = data[0]
    mountpoint = data.get("Mountpoint", "")
    if mountpoint:
        print(mountpoint)
PY
}

is_n8n_app_container() {
  local name="$1"
  local image
  image="$(docker inspect "$name" --format '{{.Config.Image}}' 2>/dev/null || true)"
  echo "$name" | grep -qiE 'worker|postgres|redis|traefik|mailhog|browserless' && return 1
  echo "$name$image" | grep -qi 'n8n' || return 1
  return 0
}

n8n_container_score() {
  local name="$1"
  local score=0
  if echo "$name" | grep -qi 'worker'; then
    score=$((score - 100))
  fi
  if docker port "$name" 5678 >/dev/null 2>&1; then
    score=$((score + 50))
  fi
  if [ -n "$(inspect_n8n_mount "$name" 2>/dev/null || true)" ]; then
    score=$((score + 100))
  fi
  if echo "$name" | grep -qiE '(^|[-/])n8n([-.]|$)'; then
    score=$((score + 10))
  fi
  printf '%s' "$score"
}

list_n8n_candidate_containers() {
  local name
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    is_n8n_app_container "$name" || continue
    printf '%s\n' "$name"
  done < <(docker ps --format '{{.Names}}' | grep -i n8n || true)
}

pick_n8n_container() {
  local best="" best_score=-999 name score
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    score="$(n8n_container_score "$name")"
    if [ "$score" -gt "$best_score" ]; then
      best="$name"
      best_score="$score"
    fi
  done < <(list_n8n_candidate_containers)
  [ -n "$best" ] || return 1
  printf '%s' "$best"
}

find_n8n_container() {
  if [ -n "${N8N_CONTAINER:-}" ]; then
    docker inspect "$N8N_CONTAINER" >/dev/null 2>&1 || die "Container not found: $N8N_CONTAINER"
    return 0
  fi

  N8N_CONTAINER="$(pick_n8n_container || true)"
  [ -n "$N8N_CONTAINER" ] || die "No running n8n container found (docker ps | grep n8n). Set N8N_CONTAINER manually."

  local mount
  mount="$(inspect_n8n_mount "$N8N_CONTAINER" 2>/dev/null || true)"
  if [ -n "$mount" ]; then
    N8N_STORAGE="${N8N_STORAGE:-$mount}"
    log "Found n8n container: $N8N_CONTAINER (storage: $N8N_STORAGE)"
  else
    INSTALL_MODE="container"
    log "Found n8n container: $N8N_CONTAINER (no host storage — install via docker cp)"
  fi
}

resolve_n8n_storage() {
  find_n8n_container
  N8N_DATA_DIR="$(n8n_data_dir_in_container "$N8N_CONTAINER")"
  N8N_DATA_DIR="${N8N_DATA_DIR:-/home/node/.n8n}"
  CONTAINER_NODES_DIR="$N8N_DATA_DIR/nodes"

  if [ "${INSTALL_MODE:-host}" = "container" ]; then
    docker exec -u node "$N8N_CONTAINER" sh -c "mkdir -p '$CONTAINER_NODES_DIR'"
    return 0
  fi

  if [ -z "${N8N_STORAGE:-}" ]; then
    N8N_STORAGE="$(inspect_n8n_mount "$N8N_CONTAINER" 2>/dev/null || true)"
  fi
  if [ -n "$N8N_STORAGE" ] && [ -d "$N8N_STORAGE" ]; then
    NODES_DIR="$N8N_STORAGE/nodes"
    mkdir -p "$NODES_DIR"
    INSTALL_MODE="host"
    return 0
  fi

  INSTALL_MODE="container"
  log "Host storage unavailable — installing via docker cp into $CONTAINER_NODES_DIR"
  docker exec -u node "$N8N_CONTAINER" sh -c "mkdir -p '$CONTAINER_NODES_DIR'"
}

resolve_compose_dir() {
  if [ -n "${COMPOSE_DIR:-}" ]; then
    [ -f "$COMPOSE_DIR/docker-compose.yml" ] || [ -f "$COMPOSE_DIR/docker-compose.yaml" ] || die "No compose file in COMPOSE_DIR"
    return 0
  fi

  local wd
  wd="$(docker inspect "$N8N_CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  if [ -n "$wd" ] && { [ -f "$wd/docker-compose.yml" ] || [ -f "$wd/docker-compose.yaml" ]; }; then
    COMPOSE_DIR="$wd"
    log "Compose dir from container label: $COMPOSE_DIR"
    return 0
  fi

  for candidate in /opt/beget/n8n /opt/n8n /opt/n8n-stack /root/n8n; do
    if [ -f "$candidate/docker-compose.yml" ] || [ -f "$candidate/docker-compose.yaml" ]; then
      COMPOSE_DIR="$candidate"
      log "Compose dir guessed: $COMPOSE_DIR"
      return 0
    fi
  done

  log "WARN: docker-compose dir not found. Set COMPOSE_DIR to restart n8n manually."
  COMPOSE_DIR=""
}

n8n_node_uid_gid() {
  N8N_UID="$(docker exec -u node "$N8N_CONTAINER" id -u 2>/dev/null || echo 1000)"
  N8N_GID="$(docker exec -u node "$N8N_CONTAINER" id -g 2>/dev/null || echo 1000)"
}

detect_n8n_base_url() {
  python3 - "$N8N_CONTAINER" <<'PY'
import subprocess, sys
from urllib.parse import urlparse

container = sys.argv[1]
raw = subprocess.check_output(
    ["docker", "inspect", container, "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
    text=True,
)
env = {}
for line in raw.splitlines():
    if "=" in line:
        key, value = line.split("=", 1)
        env[key] = value.strip()

for key in ("PRODEX_N8N_BASE_URL", "WEBHOOK_URL", "N8N_EDITOR_BASE_URL"):
    value = env.get(key, "").strip().rstrip("/")
    if not value.startswith("http"):
        continue
    if key == "WEBHOOK_URL":
        parsed = urlparse(value)
        if parsed.scheme and parsed.netloc:
            print(f"{parsed.scheme}://{parsed.netloc}")
            sys.exit(0)
    print(value)
    sys.exit(0)

protocol = env.get("N8N_PROTOCOL", "http").strip() or "http"
host = env.get("N8N_HOST", "127.0.0.1").strip() or "127.0.0.1"
port = env.get("N8N_PORT", "5678").strip() or "5678"
if host in ("0.0.0.0", "::", ""):
    host = "127.0.0.1"
if port in ("80", "443") and protocol in ("http", "https"):
    print(f"{protocol}://{host}")
else:
    print(f"{protocol}://{host}:{port}")
PY
}

read_env_file_value() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  python3 - "$file" "$key" <<'PY'
import os, re, sys
path, key = sys.argv[1], sys.argv[2]
pattern = re.compile(rf"^{re.escape(key)}=(.*)$")
with open(path, encoding="utf-8") as handle:
    for line in handle:
        match = pattern.match(line.strip())
        if not match:
            continue
        value = match.group(1).strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        print(value)
        sys.exit(0)
PY
}

ensure_env_file_line() {
  local file="$1" key="$2" value="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >>"$file"
  log "Added ${key} to $file"
}

ensure_compose_prodex_env() {
  [ -n "${COMPOSE_DIR:-}" ] || return 0
  local env_file="$COMPOSE_DIR/.env"
  local base_url
  base_url="$(detect_n8n_base_url)"
  ensure_env_file_line "$env_file" "PRODEX_N8N_BASE_URL" "$base_url"
  ensure_env_file_line "$env_file" "N8N_USER_FOLDER" "$N8N_DATA_DIR"
  if [ -z "$(read_env_file_value "$env_file" PRODEX_N8N_API_KEY)" ] && [ -z "${PRODEX_N8N_API_KEY:-}" ]; then
    log "Tip: create an API key in n8n Settings → n8n API, then add PRODEX_N8N_API_KEY=... to $env_file and re-run this script."
  fi
}

write_n8nac_config() {
  local config_path="$1" base_url="$2"
  python3 - "$config_path" "$base_url" <<'PY'
import json, os, sys

config_path, base_url = sys.argv[1], sys.argv[2].rstrip("/")
config = {
    "version": 4,
    "activeEnvironmentId": "prodex-env",
    "environmentTargets": [
        {
            "id": "prodex-target",
            "name": "ProDex",
            "kind": "external-instance",
            "url": base_url,
        }
    ],
    "environments": [
        {
            "id": "prodex-env",
            "name": "ProDex",
            "environmentTargetId": "prodex-target",
            "projectId": "personal",
            "projectName": "Personal",
            "workflowsPath": "workflows",
            "folderSync": False,
        }
    ],
}
os.makedirs(os.path.dirname(config_path), exist_ok=True)
with open(config_path, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
PY
}

resolve_prodex_api_key() {
  if [ -n "${PRODEX_N8N_API_KEY:-}" ]; then
    printf '%s' "$PRODEX_N8N_API_KEY"
    return 0
  fi
  if [ -n "${COMPOSE_DIR:-}" ]; then
    read_env_file_value "$COMPOSE_DIR/.env" PRODEX_N8N_API_KEY
    return 0
  fi
  read_env_file_value "${N8N_STORAGE:-}/.prodex.env" PRODEX_N8N_API_KEY
}

store_n8nac_api_key() {
  local api_key="$1"
  [ -n "$api_key" ] || return 0
  local workspace="$N8N_DATA_DIR/codex/n8n-as-code"
  local n8nac_cli="$CONTAINER_NODES_DIR/node_modules/.bin/n8nac"
  if printf '%s' "$api_key" | docker exec -i -u node -w "$workspace" "$N8N_CONTAINER" \
    sh -c "test -x '$n8nac_cli' && '$n8nac_cli' env auth set ProDex --api-key-stdin"; then
    log "Stored n8n API key for n8n-as-code workspace (ProDex environment)"
  else
    log "WARN: could not store API key via n8nac; add ProDex N8N API credential in n8n UI."
  fi
}

bootstrap_n8n_as_code_workspace() {
  local base_url api_key host_workspace container_workspace host_config
  base_url="$(detect_n8n_base_url)"
  container_workspace="$N8N_DATA_DIR/codex/n8n-as-code"
  host_workspace="${N8N_STORAGE:-}/codex/n8n-as-code"
  host_config="$host_workspace/n8nac-config.json"

  if [ "${INSTALL_MODE:-host}" = "host" ]; then
    mkdir -p "$host_workspace/workflows"
    n8n_node_uid_gid
    chown -R "$N8N_UID:$N8N_GID" "${N8N_STORAGE}/codex"
  else
    docker exec -u node "$N8N_CONTAINER" sh -c "mkdir -p '$container_workspace/workflows'"
  fi

  if [ "${INSTALL_MODE:-host}" = "host" ] && [ ! -f "$host_config" ]; then
    write_n8nac_config "$host_config" "$base_url"
    n8n_node_uid_gid
    chown -R "$N8N_UID:$N8N_GID" "${N8N_STORAGE}/codex"
    log "Created n8n-as-code workspace: $host_workspace (base URL: $base_url)"
  elif [ "${INSTALL_MODE:-host}" = "host" ]; then
    log "n8n-as-code workspace already exists: $host_config"
  else
    docker exec -u node "$N8N_CONTAINER" sh -c "[ -f '$container_workspace/n8nac-config.json' ]" \
      && log "n8n-as-code workspace already exists in container" \
      || {
        local tmp_config
        tmp_config="$(mktemp)"
        write_n8nac_config "$tmp_config" "$base_url"
        docker cp "$tmp_config" "$N8N_CONTAINER:$container_workspace/n8nac-config.json"
        rm -f "$tmp_config"
        log "Created n8n-as-code workspace in container (base URL: $base_url)"
      }
  fi

  api_key="$(resolve_prodex_api_key || true)"
  store_n8nac_api_key "$api_key"
}

read_version() {
  python3 -c 'import json; print(json.load(open("package.json"))["version"])'
}

build_tarball() {
  if [ "${SKIP_BUILD:-0}" = "1" ]; then
    VERSION="$(read_version)"
    TGZ="$REPO_DIR/n8n-nodes-prodex-${VERSION}.tgz"
    [ -f "$TGZ" ] || die "SKIP_BUILD=1 but tarball missing: $TGZ"
    return 0
  fi

  log "Building package with $NODE_IMAGE ..."
  docker run --rm -v "$REPO_DIR:/app" -w /app "$NODE_IMAGE" sh -c "npm ci && npm run build && npm pack --pack-destination /app"

  VERSION="$(read_version)"
  TGZ="$REPO_DIR/n8n-nodes-prodex-${VERSION}.tgz"
  [ -f "$TGZ" ] || die "Build did not produce $TGZ"
  log "Built $TGZ"
}

update_nodes_package_json() {
  local pkg_json="$NODES_DIR/package.json"
  python3 - "$pkg_json" "$VERSION" <<'PY'
import json, os, sys
path, version = sys.argv[1], sys.argv[2]
data = {"name": "installed-nodes", "private": True, "dependencies": {}}
if os.path.isfile(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
deps = data.setdefault("dependencies", {})
deps["n8n-nodes-prodex"] = f"file:./n8n-nodes-prodex-{version}.tgz"
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

install_into_n8n() {
  local tgz_name="n8n-nodes-prodex-${VERSION}.tgz"
  local container_tgz="$CONTAINER_NODES_DIR/$tgz_name"
  local container_pkg="$CONTAINER_NODES_DIR/package.json"
  local container_mod="$CONTAINER_NODES_DIR/node_modules/n8n-nodes-prodex/package.json"

  if [ "${INSTALL_MODE:-host}" = "host" ]; then
    local dest="$NODES_DIR/$tgz_name"
    cp "$TGZ" "$dest"
    n8n_node_uid_gid
    chown "$N8N_UID:$N8N_GID" "$dest"
    update_nodes_package_json
    chown "$N8N_UID:$N8N_GID" "$NODES_DIR/package.json"
  else
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    NODES_DIR="$tmp_dir"
    update_nodes_package_json
    docker cp "$TGZ" "$N8N_CONTAINER:$container_tgz"
    docker cp "$NODES_DIR/package.json" "$N8N_CONTAINER:$container_pkg"
    rm -rf "$tmp_dir"
  fi

  log "Installing into container $N8N_CONTAINER ..."
  docker exec -u node "$N8N_CONTAINER" sh -c "cd '$CONTAINER_NODES_DIR' && npm install './$tgz_name'"

  docker exec -u node "$N8N_CONTAINER" node -e \
    "const p=require('$container_mod'); console.log('Installed ProDex', p.version);"
}

restart_n8n() {
  if [ "${SKIP_RESTART:-0}" = "1" ]; then
    log "SKIP_RESTART=1 — restart n8n manually."
    return 0
  fi
  if [ -z "${COMPOSE_DIR:-}" ]; then
    log "Restarting container $N8N_CONTAINER ..."
    docker restart "$N8N_CONTAINER"
    return 0
  fi

  log "Restarting via docker compose in $COMPOSE_DIR ..."
  cd "$COMPOSE_DIR"
  if docker compose version >/dev/null 2>&1; then
    if docker compose ps --services 2>/dev/null | grep -qx n8n-worker; then
      docker compose restart n8n n8n-worker
    else
      docker compose restart n8n
    fi
  else
    docker-compose restart n8n n8n-worker 2>/dev/null || docker-compose restart n8n
  fi
}

main() {
  need_root
  ensure_prerequisites
  resolve_repo_dir
  reexec_from_repo_if_needed "$@"
  cd "$REPO_DIR"
  log "Source: $REPO_DIR ($(git rev-parse --short HEAD) $(git log -1 --format=%s))"
  resolve_n8n_storage
  resolve_compose_dir
  build_tarball
  install_into_n8n
  bootstrap_n8n_as_code_workspace
  ensure_compose_prodex_env
  restart_n8n
  log "Done. Open n8n → ProDex Setup → Runtime Status, then complete device login."
  log "For n8n-as-code: create ProDex N8N API credential (base URL: $(detect_n8n_base_url)) or set PRODEX_N8N_API_KEY in compose .env and re-run."
}

main "$@"
