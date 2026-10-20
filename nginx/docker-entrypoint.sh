#!/bin/sh
# Genereert een self-signed certificaat als dat ontbreekt, start daarna nginx.
set -eu

CERT_DIR="${CERT_DIR:-/etc/nginx/certs}"
CN="${CERT_CN:-nc.teunesen.nl}"
CRT="${CERT_DIR}/fullchain.pem"
KEY="${CERT_DIR}/privkey.pem"
DAYS="${CERT_DAYS:-3650}"

mkdir -p "$CERT_DIR"

if [ ! -f "$CRT" ] || [ ! -f "$KEY" ]; then
  echo "geen TLS-certificaat gevonden; genereer self-signed voor CN=${CN}"
  TMP_CONF="${CERT_DIR}/openssl.cnf"
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
  echo "self-signed certificaat aangemaakt in ${CERT_DIR}"
else
  echo "bestaand TLS-certificaat gebruikt: ${CRT}"
fi

exec nginx -g "daemon off;"
