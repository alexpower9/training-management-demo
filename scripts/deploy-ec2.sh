#!/usr/bin/env bash
set -Eeuo pipefail
umask 0022

readonly expected_repository='/opt/nme-training'
readonly api_service='nme-api.service'
readonly migration_service='nme-migrate.service'
readonly frontend_service='nme-frontend-publish.service'

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_sudo_command() {
  sudo -n -l "$@" >/dev/null 2>&1 ||
    fail 'Passwordless deployment sudo is not configured. Run npm run deploy:ec2:setup.'
}

repository="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail 'Run this command from the NME Training Git repository.'
cd "${repository}"

if [[ "${repository}" != "${expected_repository}" && "${NME_DEPLOY_ALLOW_OTHER_PATH:-0}" != '1' ]]; then
  fail "Expected the EC2 repository at ${expected_repository}; found ${repository}."
fi

for command in curl flock git npm sudo systemctl; do
  require_command "${command}"
done
systemctl_path="$(command -v systemctl)"

mkdir -p .deployment
exec 9>'.deployment/deploy.lock'
flock -n 9 || fail 'Another deployment is already running.'

git_status="$(git status --porcelain --untracked-files=normal)"
if [[ -n "${git_status}" ]]; then
  printf '%s\n' "${git_status}" >&2
  fail 'The repository has uncommitted changes. Commit or remove them before deploying.'
fi

[[ -f .env.production ]] ||
  fail 'Missing .env.production. Production frontend values must exist on the EC2 instance.'

commit="$(git rev-parse HEAD)"
short_commit="$(git rev-parse --short=12 HEAD)"
ref="$(git symbolic-ref --quiet --short HEAD || printf 'detached')"
deployment_branch="${NME_DEPLOY_BRANCH:-$(git config --get nme.deployBranch || printf 'main')}"

if [[ "${ref}" != "${deployment_branch}" && "${NME_DEPLOY_ALLOW_REF:-0}" != '1' ]]; then
  fail "Refusing to deploy ${ref}; the configured deployment branch is ${deployment_branch}."
fi

last_successful_commit=''
if [[ -f .deployment/last-successful-commit ]]; then
  read -r last_successful_commit < .deployment/last-successful-commit
fi

if [[ "${commit}" == "${last_successful_commit}" && "${NME_DEPLOY_FORCE:-0}" != '1' ]]; then
  log "${short_commit} is already the active successful deployment."
  exit 0
fi

require_sudo_command "${systemctl_path}" start "${migration_service}"
require_sudo_command "${systemctl_path}" restart "${api_service}"
require_sudo_command "${systemctl_path}" start "${frontend_service}"

log "Deploying ${ref}@${short_commit}."
log 'Installing locked dependencies.'
npm ci

log 'Generating the Prisma client.'
npm run prisma:generate

if [[ "${NME_DEPLOY_SKIP_TESTS:-0}" != '1' ]]; then
  log 'Running frontend and API tests.'
  npm test
  npm run test:api
else
  log 'Skipping tests because NME_DEPLOY_SKIP_TESTS=1.'
fi

log 'Building the production frontend and API.'
npm run build:production

log 'Applying production database migrations.'
sudo -n "${systemctl_path}" start "${migration_service}"

log 'Restarting the API.'
sudo -n "${systemctl_path}" restart "${api_service}"

api_healthy=0
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then
    api_healthy=1
    break
  fi
  sleep 1
done

if [[ "${api_healthy}" != '1' ]]; then
  "${systemctl_path}" --no-pager --full status "${api_service}" || true
  fail 'The API did not become healthy after restart. Frontend assets were not published.'
fi

log 'Publishing frontend assets.'
sudo -n "${systemctl_path}" start "${frontend_service}"

deployed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf '%s\n' "${commit}" > .deployment/last-successful-commit
printf '%s\t%s\t%s\n' "${deployed_at}" "${commit}" "${ref}" >> .deployment/deployments.log

log "Deployment ${short_commit} completed successfully at ${deployed_at}."
