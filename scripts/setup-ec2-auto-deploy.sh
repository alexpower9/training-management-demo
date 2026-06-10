#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_repository='/opt/nme-training'

log() {
  printf '[deploy-setup] %s\n' "$*"
}

fail() {
  printf '[deploy-setup] ERROR: %s\n' "$*" >&2
  exit 1
}

repository="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail 'Run this command from the NME Training Git repository.'
cd "${repository}"

[[ "${repository}" == "${expected_repository}" ]] ||
  fail "The systemd units expect the repository at ${expected_repository}; found ${repository}."
[[ "${EUID}" -ne 0 ]] ||
  fail 'Run this npm command as the EC2 deployment user, not as root.'
[[ -w "${repository}" ]] ||
  fail "The deployment user must be able to write to ${repository}."

for command in git npm rsync sudo systemctl; do
  command -v "${command}" >/dev/null 2>&1 ||
    fail "Required command not found: ${command}"
done

deployment_user="$(id -un)"
deployment_branch="$(git symbolic-ref --quiet --short HEAD)" ||
  fail 'Check out the production deployment branch before running setup.'
systemctl_path="$(command -v systemctl)"
visudo_path="$(command -v visudo 2>/dev/null || printf '/usr/sbin/visudo')"
[[ -x "${visudo_path}" ]] || fail 'Required command not found: visudo'
sudoers_file="$(mktemp)"
trap 'rm -f "${sudoers_file}"' EXIT

cat > "${sudoers_file}" <<EOF
${deployment_user} ALL=(root) NOPASSWD: ${systemctl_path} start nme-migrate.service
${deployment_user} ALL=(root) NOPASSWD: ${systemctl_path} restart nme-api.service
${deployment_user} ALL=(root) NOPASSWD: ${systemctl_path} start nme-frontend-publish.service
EOF

sudo "${visudo_path}" -cf "${sudoers_file}"
sudo install -o root -g root -m 0440 \
  "${sudoers_file}" "/etc/sudoers.d/nme-training-deploy-${deployment_user}"

for unit in nme-api.service nme-migrate.service nme-frontend-publish.service; do
  sudo install -o root -g root -m 0644 \
    "deploy/${unit}" "/etc/systemd/system/${unit}"
done

sudo install -d -o nme-training -g nme-training -m 0755 \
  /var/www/nme-training /var/www/nme-training/dist
sudo chown -R nme-training:nme-training /var/www/nme-training
sudo chmod -R u+rwX,go+rX /var/www/nme-training
sudo systemctl daemon-reload
sudo systemctl enable nme-api.service

git config core.hooksPath .githooks
git config nme.deployBranch "${deployment_branch}"
mkdir -p .deployment

log "Installed deployment units and enabled ${deployment_branch} deployment hooks for ${deployment_user}."
log 'Run npm run deploy:ec2 once to perform the first deployment.'
