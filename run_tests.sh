#!/usr/bin/env bash
# Führt alle test_*.py-Dateien unter apps/ aus, jede in ihrem eigenen Ordner.
set -u
root="$(cd "$(dirname "$0")" && pwd)"
fail=0
found=0
while IFS= read -r -d '' test_file; do
    found=1
    dir="$(dirname "$test_file")"
    echo "== $test_file =="
    if ! (cd "$dir" && python3 "$(basename "$test_file")"); then
        fail=1
    fi
done < <(find "$root/apps" -name 'test_*.py' -print0)

if [ "$found" -eq 0 ]; then
    echo "Keine Tests gefunden."
fi
exit $fail
