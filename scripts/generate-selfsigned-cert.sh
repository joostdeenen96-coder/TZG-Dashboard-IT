#!/bin/sh
# Genereert een self-signed TLS-certificaat voor de NGINX reverse proxy.
# Gebruik: ./scripts/generate-selfsigned-cert.sh [doelmap]
# Standaard: ./certs (of CERT_DIR). CN standaard nc.teunesen.nl (CERT_CN).
set -eu

CN="${CERT_CN:-nc.teunesen.nl}"
OUT_DIR="${1:-${CERT_DIR:-./certs}}"
CRT="${OUT_DIR}/fullchain.pem"
KEY="${OUT_DIR}/privkey.pem"
DAYS="${CERT_DAYS:-3650}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl ontbreekt" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
umask 077

if [ -f "$CRT" ] && [ -f "$KEY" ]; then
  echo "certificaat bestaat al: $CRT"
  openssl x509 -in "$CRT" -noout -subject -dates 2>/dev/null || true
  exit 0
fi

TMP_CONF="${OUT_DIR}/openssl.cnf"
cat >"$TMP_CONF" <<EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = ${CN}

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = ${CN}
EOF

openssl req -x509 -nodes -newkey rsa:4096 \
  -keyout "$KEY" \
  -out "$CRT" \
  -days "$DAYS" \
  -config "$TMP_CONF"

chmod 600 "$KEY"
chmod 644 "$CRT"
rm -f "$TMP_CONF"

echo "aangemaakt: $CRT"
echo "aangemaakt: $KEY"
openssl x509 -in "$CRT" -noout -subject -dates
