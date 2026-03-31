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

echo 'Waiting for Canton sandbox to be ready...'
until grep -q 'ready' /tmp/sandbox.log 2>/dev/null; do sleep 2; done

echo 'Running init script...'
daml script \
  --dar .daml/dist/reputation-0.0.1.dar \
  --script-name Main:main \
  --ledger-host localhost \
  --ledger-port 6865

echo 'The Canton sandbox and JSON API are ready to use.'
tail -f /tmp/sandbox.log
