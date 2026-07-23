#!/usr/bin/env python3
"""Thin HTTP client for amoCRM REST API v4.

Reads AMOCRM_SUBDOMAIN and AMOCRM_TOKEN from env. Signs every request with
Bearer auth. Designed to be called by an agent — JSON in, JSON out, exit code
0 on success, 1 on any error.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def build_url(url_arg: str, subdomain: str) -> str:
    if url_arg.startswith(("http://", "https://")):
        return url_arg
    if not url_arg.startswith("/"):
        url_arg = "/" + url_arg
    return f"https://{subdomain}.amocrm.ru{url_arg}"


MAX_ERROR_BODY = 4096


def _classify_error(status: int, body: str, headers) -> str:
    """Build a 1-2 line stderr message for an HTTP error, with a recovery hint and the server body."""
    if len(body) > MAX_ERROR_BODY:
        body = body[:MAX_ERROR_BODY] + f"... [truncated, {len(body)} bytes total]"
    if status == 401:
        return (
            "error: HTTP 401 — AMOCRM_TOKEN is invalid or expired. "
            "Generate a new long-lived token in amoCRM Settings → Integrations "
            "and update AMOCRM_TOKEN.\n"
            f"server response: {body}"
        )
    if status == 403:
        return (
            "error: HTTP 403 — token has no permission for this endpoint. "
            "Check the integration's scopes in amoCRM.\n"
            f"server response: {body}"
        )
    if status == 404:
        return f"error: HTTP 404 — resource not found.\nserver response: {body}"
    if status == 429:
        retry_after = headers.get("Retry-After") or "?"
        return (
            f"error: HTTP 429 — rate limit hit. Wait {retry_after} seconds before "
            "retrying. amoCRM allows ~7 RPS per integration.\n"
            f"server response: {body}"
        )
    if 500 <= status < 600:
        return (
            f"error: HTTP {status} — server-side failure on amoCRM. Retry later.\n"
            f"server response: {body}"
        )
    if status == 400:
        # Validation errors — surface the body verbatim, it has details
        return f"error: HTTP 400 — validation failed.\nserver response: {body}"
    return f"error: HTTP {status}\nserver response: {body}"


def main() -> int:
    parser = argparse.ArgumentParser(description="amoCRM HTTP client")
    parser.add_argument("--method", required=True, choices=["GET", "POST", "PATCH", "DELETE"])
    parser.add_argument("--url", required=True, help="Path like /api/v4/leads, or full https URL")
    parser.add_argument("--params", default=None, help="JSON object for query params")
    parser.add_argument("--body", default=None, help="JSON for request body")
    parser.add_argument("--headers", default=None, help="JSON object for extra headers")
    parser.add_argument("--dry-run", action="store_true", help="Print full URL and exit (for tests)")
    args = parser.parse_args()

    subdomain = os.environ.get("AMOCRM_SUBDOMAIN")
    token = os.environ.get("AMOCRM_TOKEN")
    if not subdomain:
        print("error: AMOCRM_SUBDOMAIN env var is not set", file=sys.stderr)
        return 1
    if not token:
        print("error: AMOCRM_TOKEN env var is not set", file=sys.stderr)
        return 1

    url = build_url(args.url, subdomain)

    if args.dry_run:
        print(url)
        return 0

    # Build query string with doseq=True so arrays/filter[..]= keys serialize right
    query = ""
    if args.params:
        try:
            params = json.loads(args.params)
        except json.JSONDecodeError as e:
            print(f"error: --params is not valid JSON: {e}", file=sys.stderr)
            return 1
        query = urllib.parse.urlencode(params, doseq=True)
    full_url = url + ("?" + query if query else "")

    headers: dict = {}
    body_bytes = None
    if args.body is not None:
        # Body is JSON text — send it through as-is, but verify it parses
        try:
            json.loads(args.body)
        except json.JSONDecodeError as e:
            print(f"error: --body is not valid JSON: {e}", file=sys.stderr)
            return 1
        body_bytes = args.body.encode("utf-8")
        headers["Content-Type"] = "application/json"
    if args.headers:
        try:
            extra = json.loads(args.headers)
        except json.JSONDecodeError as e:
            print(f"error: --headers is not valid JSON: {e}", file=sys.stderr)
            return 1
        headers.update(extra)
    # Authorization is non-overridable — always Bearer-from-env
    headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(full_url, data=body_bytes, headers=headers, method=args.method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if data:
                sys.stdout.write(data.decode("utf-8"))
                sys.stdout.write("\n")
            return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        msg = _classify_error(e.code, body, e.headers)
        print(msg, file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"error: network failure: {e.reason}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
