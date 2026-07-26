#!/usr/bin/env bash
# Install or update n8n-nodes-prodex into a self-hosted Docker n8n instance.
#
# Usage (from a git clone):
#   sudo bash scripts/install-prodex-on-server.sh
#
# One-liner on a fresh server:
#   curl -fsSL https://raw.githubusercontent.com/Chief-digital-transformation-officer/n8n-nodes-prodex/master/scripts/install-prodex-on-server.sh | sudo bash
#
# Environment overrides:
#   REPO_URL          git remote (default: this repo)
#   REPO_DIR          source tree (default: auto)
#   N8N_CONTAINER     main n8n container name
#   N8N_STORAGE       host path for n8n data (auto-detected from mounts/volumes)
#   COMPOSE_DIR       directory with docker-compose.yml
#   NODE_IMAGE        build image (default: node:24-alpine)
#   SKIP_RESTART=1    install without restarting n8n
#   SKIP_BUILD=1      only reinstall existing tarball

set -eu

REPO_URL="${REPO_URL:-https://github.com/Chief-digital-transformation-officer/n8n-nodes-prodex.git}"
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

resolve_repo_dir() {
  if [ -n "${REPO_DIR:-}" ]; then
    [ -f "$REPO_DIR/package.json" ] || die "REPO_DIR has no package.json: $REPO_DIR"
    return 0
  fi

  local candidate
  candidate="$(script_dir)/.."
  if [ -f "$candidate/package.json" ] && grep -q '"name": "n8n-nodes-prodex"' "$candidate/package.json"; then
    REPO_DIR="$(cd "$candidate" && pwd)"
    return 0
  fi

  if [ -d "$DEFAULT_CLONE_DIR/.git" ]; then
    REPO_DIR="$DEFAULT_CLONE_DIR"
    log "Using existing clone: $REPO_DIR"
    git -C "$REPO_DIR" fetch origin
    git -C "$REPO_DIR" reset --hard origin/master
    return 0
  fi

  log "Cloning $REPO_URL -> $DEFAULT_CLONE_DIR"
  mkdir -p "$(dirname "$DEFAULT_CLONE_DIR")"
  git clone "$REPO_URL" "$DEFAULT_CLONE_DIR"
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
  echo "$image" | grep -qiE '(^|/)n8nio/n8n|/n8n:' || return 1
  echo "$name" | grep -qiE 'worker|postgres|redis|traefik|mailhog|browserless' && return 1
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
  done < <(docker ps --format '{{.Names}}')
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
  [ -n "$N8N_CONTAINER" ] || die "No running n8n container found (image n8nio/n8n). Set N8N_CONTAINER manually."

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
  restart_n8n
  log "Done. Open n8n → ProDex Setup → Runtime Status, then complete device login."
}

main "$@"
