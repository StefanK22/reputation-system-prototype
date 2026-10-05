#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIRECTORY=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
SOURCE_DIRECTORY="$SCRIPT_DIRECTORY/DamlRepetitionScripts"
STAGING_DIRECTORY="$PROJECT_DIRECTORY/reputation-system/canton/daml/Scripts/Repetitions"
RESULTS_DIRECTORY="$SCRIPT_DIRECTORY/repetitions"

usage() {
    echo "Usage: $0 [repetition] or $0 [first_repetition last_repetition]"
    echo "With no arguments, all repetitions without a saved JSON result are run."
}

if [ "$#" -gt 2 ]; then
    usage
    exit 1
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    exit 0
fi

if [ "$#" -eq 0 ]; then
    first_repetition=1
    last_repetition=30
elif [ "$#" -eq 1 ]; then
    first_repetition=$1
    last_repetition=$1
else
    first_repetition=$1
    last_repetition=$2
fi

case "$first_repetition:$last_repetition" in
    *[!0-9:]*|:*)
        usage
        exit 1
        ;;
esac

if [ "$first_repetition" -lt 1 ] || [ "$last_repetition" -gt 30 ] || \
   [ "$first_repetition" -gt "$last_repetition" ]; then
    echo "Repetition numbers must define a range between 1 and 30."
    exit 1
fi

stack_started=false
staged_repetition=""

cleanup() {
    exit_code=$?
    trap - EXIT INT TERM

    if [ "$stack_started" = true ]; then
        echo
        echo "Stopping Docker services..."
        docker compose down || true
    fi

    if [ -n "$staged_repetition" ] && [ -d "$staged_repetition" ]; then
        echo "Removing staged repetition..."
        rm -rf -- "$staged_repetition"
    fi

    exit "$exit_code"
}

remove_staged_repetitions() {
    if [ -d "$STAGING_DIRECTORY" ]; then
        find "$STAGING_DIRECTORY" \
            -mindepth 1 -maxdepth 1 \
            -type d -name 'Repetition[0-9][0-9]' \
            -exec rm -rf -- {} +
    fi
}

validate_repetition() {
    source_repetition=$1

    if [ ! -s "$source_repetition/EvalSeedAgentSetup.daml" ]; then
        return 1
    fi

    round=1
    while [ "$round" -le 25 ]; do
        if [ ! -s "$source_repetition/EvalSeedAgentRound${round}.daml" ]; then
            return 1
        fi
        round=$((round + 1))
    done
}

trap cleanup EXIT INT TERM
cd "$PROJECT_DIRECTORY"
mkdir -p "$STAGING_DIRECTORY" "$RESULTS_DIRECTORY"
remove_staged_repetitions

repetition=$first_repetition
while [ "$repetition" -le "$last_repetition" ]; do
    repetition_name=$(printf 'Repetition%02d' "$repetition")
    result_name=$(printf 'run_%02d.json' "$repetition")
    source_repetition="$SOURCE_DIRECTORY/$repetition_name"
    result_path="$RESULTS_DIRECTORY/$result_name"

    echo
    echo "============================================================"
    echo "Test3 repetition $repetition/30"
    echo "============================================================"

    if [ -f "$result_path" ]; then
        echo "Result already exists: $result_path"
        echo "Skipping this repetition."
        repetition=$((repetition + 1))
        continue
    fi

    if ! validate_repetition "$source_repetition"; then
        echo "Incomplete or missing Daml repetition: $source_repetition"
        exit 1
    fi

    echo "Staging $repetition_name in the Daml source tree..."
    remove_staged_repetitions
    staged_repetition="$STAGING_DIRECTORY/$repetition_name"
    cp -R "$source_repetition" "$staged_repetition"

    echo "Building and starting Docker services..."
    stack_started=true
    docker compose up --build -d

    echo "Running and collecting $repetition_name..."
    python3.9 evaluation/evaluation5.2/fetch_rankings.py --repetition "$repetition"

    echo "Stopping Docker services..."
    docker compose down
    stack_started=false

    echo "Removing staged $repetition_name..."
    rm -rf -- "$staged_repetition"
    staged_repetition=""

    echo "Completed $repetition_name."
    repetition=$((repetition + 1))
done

trap - EXIT INT TERM
echo
echo "Requested Test3 repetitions are complete."
