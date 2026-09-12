#!/bin/sh
set -x

# CR-08 startup guard: refuse to boot when a secret is missing or set to a publicly-known
# value. The build stage passes a placeholder because next.config.ts asserts these during
# `next build`; the runner stage does not carry them, so the real value must come from the
# runtime environment (docker-compose env_file / docker run -e).
reject_insecure_secret() {
  case "$2" in
    "" | "secret" | "build-time-placeholder-not-used-at-runtime")
      echo "ERROR: $1 is unset or set to a publicly-known value."
      echo "Set a strong random value at runtime, e.g.: openssl rand -base64 32"
      exit 1
      ;;
  esac
}
reject_insecure_secret NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
reject_insecure_secret CALENDSO_ENCRYPTION_KEY "$CALENDSO_ENCRYPTION_KEY"

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

if [ -n "$DATABASE_HOST" ]; then
  scripts/wait-for-it.sh ${DATABASE_HOST} -- echo "database is up"
fi
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma
npx ts-node --transpile-only /calcom/scripts/seed-app-store.ts
yarn start
