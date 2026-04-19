# arm64
export CGO_ENABLED=1
export GOARCH=arm64
export CC=aarch64-linux-gnu-gcc
go build -tags "fts5" -buildvcs=false

# amd64
export CGO_ENABLED=1
export GOARCH=amd64
export CC=gcc
go build -tags "fts5" -buildvcs=false