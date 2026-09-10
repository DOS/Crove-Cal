#!/bin/sh
set -x

# CR-08 startup guard: refuse to boot when secrets are missing or equal the old
# publicly-known insecure default "secret". Real values must come from the runtime
# environment (docker-compose env_file / docker run -e), never from the image.
if [ -z "$NEXTAUTH_SECRET" ] || [ "$NEXTAUTH_SECRET" = "secret" ]; then
  echo "ERROR: NEXTAUTH_SECRET is unset or equals the insecure default 'secret'."
  echo "Set a strong random value at runtime, e.g.: openssl rand -base64 32"
  exit 1
fi
if [ -z "$CALENDSO_ENCRYPTION_KEY" ] || [ "$CALENDSO_ENCRYPTION_KEY" = "secret" ]; then
  echo "ERROR: CALENDSO_ENCRYPTION_KEY is unset or equals the insecure default 'secret'."
  echo "Set a strong random value at runtime, e.g.: openssl rand -base64 32"
  exit 1
fi

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

if [ -n "$DATABASE_HOST" ]; then
  scripts/wait-for-it.sh ${DATABASE_HOST} -- echo "database is up"
fi
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma
npx ts-node --transpile-only /calcom/scripts/seed-app-store.ts
yarn start
