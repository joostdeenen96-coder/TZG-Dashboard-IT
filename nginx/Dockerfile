FROM nginx:1.27-alpine

RUN apk add --no-cache openssl \
  && rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/tzg.conf /etc/nginx/conf.d/tzg.conf
COPY docker-entrypoint.sh /docker-entrypoint-tzg.sh

RUN chmod +x /docker-entrypoint-tzg.sh \
  && mkdir -p /etc/nginx/certs /var/www/certbot/.well-known/acme-challenge \
  && chown -R nginx:nginx /etc/nginx/certs \
  && chmod 755 /etc/nginx/certs /var/www/certbot

# Named volumes: TLS-certs + ACME webroot (Let's Encrypt HTTP-01).
VOLUME ["/etc/nginx/certs", "/var/www/certbot"]

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/nginx-health || exit 1

ENTRYPOINT ["/docker-entrypoint-tzg.sh"]
