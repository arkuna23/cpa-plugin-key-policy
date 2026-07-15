PLUGIN := cpa-key-policy
PKG := ./cmd/cpa-key-policy
DIST := dist
WEB := web
EMBED_INDEX := internal/plugin/web/dist/index.html
VERSION ?= $(shell sed -n 's/^[[:space:]]*Version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' internal/plugin/types.go)
LINUX_ARM64_LIB := $(DIST)/$(PLUGIN)_linux_arm64.so
LINUX_ARM64_ARCHIVE := $(DIST)/$(PLUGIN)_$(VERSION)_linux_arm64.zip

.PHONY: test web-build build-linux-amd64 build-linux-arm64 package-linux-arm64 build-linux clean

test:
	go test ./...

# Build the single-file web UI and place it where the Go embed expects it.
web-build:
	cd $(WEB) && npm install && VITE_HOSTED=1 npm run build
	cp $(WEB)/dist/index.html $(EMBED_INDEX)

build-linux-amd64: web-build
	mkdir -p $(DIST)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -buildvcs=false -tags cshared -buildmode=c-shared -o $(DIST)/$(PLUGIN)_linux_amd64.so $(PKG)

build-linux-arm64: web-build
	mkdir -p $(DIST)
	GOOS=linux GOARCH=arm64 CGO_ENABLED=1 go build -trimpath -buildvcs=false -tags cshared -buildmode=c-shared -ldflags "-s -w" -o $(LINUX_ARM64_LIB) $(PKG)

# Build an ARM64 package matching the CLIProxyAPI Plugins Store release format.
# The ZIP must contain exactly cpa-key-policy.so at its root.
package-linux-arm64: build-linux-arm64
	cp $(LINUX_ARM64_LIB) $(DIST)/$(PLUGIN).so
	PLUGIN_ID=$(PLUGIN) bash scripts/package-plugin.sh $(DIST) $(PLUGIN).so $(LINUX_ARM64_ARCHIVE)
	cp $(LINUX_ARM64_ARCHIVE).sha256 $(DIST)/checksums.txt

build-linux: build-linux-amd64 build-linux-arm64

clean:
	rm -rf $(DIST)
