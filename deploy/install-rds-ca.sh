#!/usr/bin/env bash
set -euo pipefail

region="${1:-us-east-1}"
ca_identifier="${2:-rds-ca-rsa2048-g1}"
destination="${3:-/etc/pki/rds/${ca_identifier}.pem}"

case "${ca_identifier}" in
  rds-ca-rsa2048-g1)
    subject_pattern='Root CA RSA2048 G1'
    ;;
  rds-ca-rsa4096-g1)
    subject_pattern='Root CA RSA4096 G1'
    ;;
  rds-ca-ecc384-g1)
    subject_pattern='Root CA ECC384 G1'
    ;;
  *)
    echo "Unsupported RDS CA identifier: ${ca_identifier}" >&2
    exit 1
    ;;
esac

temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

bundle="${temporary_directory}/${region}-bundle.pem"
curl --fail --silent --show-error --location \
  "https://truststore.pki.rds.amazonaws.com/${region}/${region}-bundle.pem" \
  --output "${bundle}"

awk -v directory="${temporary_directory}" '
  /-----BEGIN CERTIFICATE-----/ {
    certificate_number += 1
    certificate = sprintf("%s/certificate-%02d.pem", directory, certificate_number)
  }
  certificate {
    print > certificate
  }
' "${bundle}"

matched_certificate=''
for certificate in "${temporary_directory}"/certificate-*; do
  if openssl x509 -in "${certificate}" -noout -subject 2>/dev/null |
    grep --fixed-strings --quiet "${subject_pattern}"; then
    matched_certificate="${certificate}"
    break
  fi
done

if [[ -z "${matched_certificate}" ]]; then
  echo "Could not find ${ca_identifier} in the ${region} RDS bundle." >&2
  exit 1
fi

install --directory --mode=0755 "$(dirname "${destination}")"
install --mode=0644 "${matched_certificate}" "${destination}"
openssl x509 -in "${destination}" -noout -subject -dates
