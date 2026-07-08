# cpa-key-policy

`cpa-key-policy` is a CLIProxyAPI dynamic library plugin for downstream API key policy control.

It lets each plugin-owned downstream key use a small model alias list, routes those aliases to real CPA provider models, and applies single-instance RPM limits. It is intentionally a non-exclusive frontend auth provider, so existing CLIProxyAPI `api-keys` can still coexist as an admin or compatibility path.

Do not put plugin-issued keys into CLIProxyAPI `api-keys`; that bypasses this plugin's policy.

**Author / repository:** [origin652/cpa-plugin-key-policy](https://github.com/origin652/cpa-plugin-key-policy) (MIT). Install via the [CLIProxyAPI Plugins Store](https://github.com/router-for-me/CLIProxyAPI-Plugins-Store) or build from source.

## Capabilities

- `FrontendAuthProvider`: authenticates plugin keys, blocks `/v1/models`, checks model alias permissions, and applies RPM.
- `ModelRouter`: routes an allowed alias to a built-in CPA provider and target model.
- `ResponseInterceptor`: rewrites top-level non-streaming JSON `model` fields back to the downstream alias.
- `ManagementAPI`: manages keys and policies through CPA's existing management authentication.

## Build

Linux builds require cgo and a matching C toolchain for the target architecture.

```bash
make test
make build-linux
```

Manual single-target build:

```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -buildvcs=false -tags cshared -buildmode=c-shared -o dist/cpa-key-policy_linux_amd64.so ./cmd/cpa-key-policy
```

On Windows, use WSL/Linux or a working cross-cgo toolchain to produce Linux `.so` files. The default `go test ./...` path uses a non-cgo stub so policy tests can run without a dynamic-library toolchain.

Copy the `.so` into CLIProxyAPI's configured `plugins.dir`, then enable it in config.

## Config

```yaml
plugins:
  enabled: true
  dir: "plugins"
  configs:
    cpa-key-policy:
      enabled: true
      priority: 10
      state_file: "cpa-key-policy-state.json"
      keys:
        - id: "team-a"
          name: "Team A"
          enabled: true
          key_hash: "sha256:..."
          key_preview: "cpa_abc...xyz"
          rpm: 60
          models:
            - alias: "fast"
              provider: "codex"
              target_model: "gpt-5-codex"
            - alias: "sonnet"
              provider: "claude"
              target_model: "claude-sonnet-4-5-20250929"
```

If `state_file` exists, it becomes the source of truth. If it does not exist, configured `keys` initialize runtime state; the first Management API write persists the state file.

## Management API

CLIProxyAPI plugin management routes are exact paths, not dynamic path templates. This plugin therefore uses collection routes with `id` in query or JSON body.

- `GET /v0/management/plugins/cpa-key-policy/keys`
- `POST /v0/management/plugins/cpa-key-policy/keys`
- `PATCH /v0/management/plugins/cpa-key-policy/keys`
- `DELETE /v0/management/plugins/cpa-key-policy/keys?id=team-a`
- `POST /v0/management/plugins/cpa-key-policy/keys/rotate`
- `POST /v0/management/plugins/cpa-key-policy/keys/reset-rpm`
- `GET /v0/management/plugins/cpa-key-policy/status`

Create a key:

```bash
curl -X POST "$CPA/v0/management/plugins/cpa-key-policy/keys" \
  -H "Authorization: Bearer $MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "team-a",
    "name": "Team A",
    "rpm": 60,
    "models": [
      {"alias":"fast","provider":"codex","target_model":"gpt-5-codex"}
    ]
  }'
```

The response includes `plain_key` once. Later list/get responses only expose `key_preview`.

Rotate a key:

```bash
curl -X POST "$CPA/v0/management/plugins/cpa-key-policy/keys/rotate?id=team-a" \
  -H "Authorization: Bearer $MANAGEMENT_KEY"
```

## Request Behavior

Known plugin key:

- allowed alias: request authenticates, routes to configured provider/model, and counts toward RPM.
- disallowed alias: frontend auth returns unauthenticated, which usually surfaces as an auth failure.
- `/v1/models` on CPA's main port: per-key `allow_models_endpoint` is binary (401 or full global list). CPA cannot filter the list per downstream key on that port.

Unknown key:

- plugin returns unauthenticated and lets CLIProxyAPI's native `api-keys` or other auth providers try the request.

Streaming responses are not model-rewritten in v1. Non-streaming JSON responses with a top-level `model` field are rewritten back to the requested alias.

## Web Management UI

A small React + Vite + TypeScript frontend lives in [`web/`](./web). It is a thin UI over this plugin's management routes (and CPA's model catalog endpoints) for the common operation the README's curl examples cover: **create a downstream key and pick multiple models from CPA's existing providers**, plus list / edit / rotate / reset-RPM / delete.

The UI is **hosted by CPA itself** as a plugin resource, alongside CPA's own `management.html` (which it does not modify). After building the plugin with `make build-linux`, load it in CPA and open:

```
http://<cpa-host>:<api-port>/v0/resource/plugins/cpa-key-policy/index.html
```

This resource is unauthenticated to load; on the login page you enter the **management key** (`remote-management.secret-key` or `$MANAGEMENT_PASSWORD`). The key is held in memory only and is never written to `localStorage`; closing or refreshing the tab returns you to the login page. All data calls go to the authenticated `/v0/management/plugins/cpa-key-policy/...` routes.

### Build

The plugin embeds the UI via `go:embed` from `internal/plugin/web/dist/index.html`. `make build-linux` (and `make web-build`) builds the frontend into a single inlined `index.html` and copies it into that path before compiling the `.so`.

```bash
make web-build      # npm install + vite build (single-file) + copy to embed path
make build-linux    # web-build then compile the .so for linux amd64/arm64
```

A placeholder `index.html` is committed so the Go build never fails when the frontend has not been built yet; `make web-build` overwrites it with the real UI.

### Run in development (standalone, not embedded)

```bash
cd web
npm install
VITE_CPA_BASE=http://127.0.0.1:8317 npm run dev   # dev server proxies /v0/management to CPA
```

Open the printed URL, enter CPA's base URL and the management key. This mode is for iterating on the UI without rebuilding the `.so`; the production path is the embedded resource above.

### How model selection works

CPA has no single "list providers + models" endpoint, so the UI composes its catalog from `/v0/management/openai-compatibility`, the per-channel `*-api-key` endpoints, `/v0/management/auth-files` + `auth-files/models`, and `/v0/management/model-definitions/:channel`. Each selected model becomes a `ModelRule` with `alias = target_model` (the client then calls CPA using the real model name). Sources that are unavailable on a given CPA instance are skipped, so a missing endpoint does not blank the picker.

### Tests

```bash
cd web
npm test           # vitest unit tests (catalog normalization, session, model-rule builder)
npm run build      # type-check + production build (single-file)
go test ./...      # plugin tests, including the resource-serving handler
```

