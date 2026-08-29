#!/bin/sh
set -eu

check_status() {
  name="$1"
  url="$2"
  expected="$3"
  headers="$(curl -I --http1.1 --silent --show-error "$url" | tr -d '\r')"
  status="$(printf '%s\n' "$headers" | awk '/^HTTP\// { print $2; exit }')"
  if [ "$status" != "$expected" ]; then
    printf '%s: expected HTTP %s, got %s\n' "$name" "$expected" "${status:-unknown}" >&2
    exit 1
  fi
  printf '%s: ok\n' "$name"
}

check_redirect() {
  name="$1"
  url="$2"
  expected_status="$3"
  expected_location="$4"
  headers="$(curl -I --http1.1 --silent --show-error "$url" | tr -d '\r')"
  status="$(printf '%s\n' "$headers" | awk '/^HTTP\// { print $2; exit }')"
  location="$(printf '%s\n' "$headers" | awk 'tolower($0) ~ /^location:/ { sub(/^[^:]*:[[:space:]]*/, ""); print; exit }')"
  if [ "$status" != "$expected_status" ]; then
    printf '%s: expected HTTP %s, got %s\n' "$name" "$expected_status" "${status:-unknown}" >&2
    exit 1
  fi
  if [ "$location" != "$expected_location" ]; then
    printf '%s: expected Location %s, got %s\n' "$name" "$expected_location" "${location:-missing}" >&2
    exit 1
  fi
  printf '%s: ok\n' "$name"
}

check_status "Cloudflare Pages default domain" "https://splat-align-workbench.pages.dev" "200"
check_status "Primary product domain" "https://merge.monroes.space" "200"
check_redirect "Main-site discovery redirect" "https://monroes.space/merge" "302" "https://merge.monroes.space"
