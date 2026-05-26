#!/bin/bash
set -e

daml sandbox \
  --port 6865 \
  --json-api-port 7575 \
  --dar .daml/dist/reputation-0.0.1.dar \
  -C canton.participants.sandbox.ledger-api.address=0.0.0.0 \
  -C canton.participants.sandbox.http-ledger-api.server.address=0.0.0.0 \
  --log-level-root=WARN \
  --log-profile=container \
  2>&1 | tee /tmp/sandbox.log &

until grep -q 'Canton sandbox is ready' /tmp/sandbox.log 2>/dev/null; do sleep 1; done

# Wait for the JSON API to accept requests
until curl -sf http://localhost:7575/v2/parties > /dev/null 2>&1; do sleep 1; done

# Retry party allocation until the synchronizer is connected (allocation fails before that)
until curl -s -X POST http://localhost:7575/v2/parties \
  -H "content-type: application/json" \
  -d '{"displayName": "Operator", "partyIdHint": "Operator"}' \
  | grep -q '"party"'; do
  sleep 2
done

echo "canton-init-complete" | tee -a /tmp/sandbox.log

wait
