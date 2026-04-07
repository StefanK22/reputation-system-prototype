#!/bin/bash
set -e

CANTON_HOST="${CANTON_HOST:-canton-sandbox}"
CANTON_JSON_PORT="${CANTON_JSON_PORT:-7575}"
CANTON_JSON_URL="http://${CANTON_HOST}:${CANTON_JSON_PORT}"

echo "Waiting for Canton JSON API at ${CANTON_JSON_URL}..."
until curl -sf "${CANTON_JSON_URL}/v2/parties" > /dev/null 2>&1; do
  sleep 2
done
echo "Canton is ready."

OPERATOR=$(curl -s "${CANTON_JSON_URL}/v2/parties" \
  | python3 -c "
import sys, json
parties = json.load(sys.stdin)['partyDetails']
operator = [p for p in parties if 'operator' in p['party'].lower()]
print(operator[0]['party'] if operator else '')
")

if [ -z "$OPERATOR" ]; then
  echo "ERROR: Could not find operator party. Has the init script run?"
  exit 1
fi

echo "Operator party: ${OPERATOR}"

exec java \
  -Dcanton.operator-party-id="${OPERATOR}" \
  -jar app.jar
