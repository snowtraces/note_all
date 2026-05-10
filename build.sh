#!/bin/bash

# Note All 后端构建脚本
# 注意: gojieba (cppjieba) 含 C++ 代码，需要 C++ 编译器

# === ARM64 交叉编译 (Linux ARM64 目标) ===
export CGO_ENABLED=1
export GOARCH=arm64
export CC=aarch64-linux-gnu-gcc
export CXX=aarch64-linux-gnu-g++
go build -ldflags="-s -w" -tags "fts5" -buildvcs=false -o note_all_backend_arm64

# === AMD64 编译 (Linux/Windows 本机) ===
export CGO_ENABLED=1
export GOARCH=amd64
export CC=gcc
export CXX=g++
go build -ldflags="-s -w" -tags "fts5" -buildvcs=false -o note_all_backend_amd64