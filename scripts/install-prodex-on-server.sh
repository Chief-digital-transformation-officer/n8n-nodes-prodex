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
#   N8N_STORAGE       host path mounted to /home/node/.n8n
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

find_n8n_container() {
  if [ -n "${N8N_CONTAINER:-}" ]; then
    docker inspect "$N8N_CONTAINER" >/dev/null 2>&1 || die "Container not found: $N8N_CONTAINER"
    return 0
  fi

  local name mount
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    mount="$(docker inspect "$name" --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
    if [ -n "$mount" ]; then
      N8N_CONTAINER="$name"
      N8N_STORAGE="${N8N_STORAGE:-$mount}"
      log "Found n8n container: $N8N_CONTAINER (storage: $N8N_STORAGE)"
      return 0
    fi
  done < <(docker ps --format '{{.Names}}' | grep -E 'n8n' || true)

  die "Could not find a running n8n container with /home/node/.n8n mount. Set N8N_CONTAINER and N8N_STORAGE."
}

resolve_n8n_storage() {
  find_n8n_container
  if [ -z "${N8N_STORAGE:-}" ]; then
    N8N_STORAGE="$(docker inspect "$N8N_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Source}}{{end}}{{end}}')"
  fi
  [ -n "$N8N_STORAGE" ] || die "N8N storage path empty. Set N8N_STORAGE to the host folder mounted as /home/node/.n8n"
  [ -d "$N8N_STORAGE" ] || die "N8N storage not a directory: $N8N_STORAGE"
  NODES_DIR="$N8N_STORAGE/nodes"
  mkdir -p "$NODES_DIR"
}

resolve_compose_dir() {
  if [ -n "${COMPOSE_DIR:-}" ]; then
    [ -f "$COMPOSE_DIR/docker-compose.yml" ] || [ -f "$COMPOSE_DIR/docker-compose.yaml" ] || die "No compose file in COMPOSE_DIR"
    return 0
  fi

  local wd
  wd="$(docker inspect "$N8N_CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  if [ -n "$wd" ] && [ -f "$wd/docker-compose.yml" ] || [ -f "$wd/docker-compose.yaml" ]; then
    COMPOSE_DIR="$wd"
    log "Compose dir from container label: $COMPOSE_DIR"
    return 0
  fi

  for candidate in /opt/n8n /opt/n8n-stack /root/n8n; do
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
  local dest="$NODES_DIR/n8n-nodes-prodex-${VERSION}.tgz"
  cp "$TGZ" "$dest"
  n8n_node_uid_gid
  chown "$N8N_UID:$N8N_GID" "$dest"
  update_nodes_package_json
  chown "$N8N_UID:$N8N_GID" "$NODES_DIR/package.json"

  log "Installing into container $N8N_CONTAINER ..."
  docker exec -u node "$N8N_CONTAINER" sh -c "cd /home/node/.n8n/nodes && npm install ./n8n-nodes-prodex-${VERSION}.tgz"

  docker exec -u node "$N8N_CONTAINER" node -e \
    "const p=require('/home/node/.n8n/nodes/node_modules/n8n-nodes-prodex/package.json'); console.log('Installed ProDex', p.version);"
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
