# Surgical repair of release 392, preserving all other deployed code.
FROM registry.fly.io/fates-entwined-main@sha256:db5012107941c2720884109b720266abf8ba9b85cf4aa38b1f8dbc16480e8d36
COPY patch.mjs regression.mjs /tmp/auth-session-hotfix/
RUN node /tmp/auth-session-hotfix/patch.mjs /app/server/authoritative-v3/fly-data-api.mjs \
 && node /tmp/auth-session-hotfix/regression.mjs /app/server/authoritative-v3/fly-data-api.mjs --warfront
