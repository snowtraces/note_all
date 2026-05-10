#!/bin/bash

# ARM64 一键部署脚本
# 后端: root@192.168.31.16:/mnt/data/note_all
# 前端: root@192.168.31.16:/mnt/data/frontend/dist

set -e

# 配置
SERVER_USER="root"
SERVER_HOST="192.168.31.16"
BACKEND_PATH="/mnt/data/note_all"
FRONTEND_PATH="/mnt/data/frontend/dist"
BINARY_NAME="note_all_backend"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== 1. 后端 ARM64 构建 ===${NC}"

cd backend

export CGO_ENABLED=1
export GOARCH=arm64
export CC=aarch64-linux-gnu-gcc
export CXX=aarch64-linux-gnu-g++

echo "正在编译..."
go build -ldflags="-s -w" -tags "fts5" -buildvcs=false -o ${BINARY_NAME}

SIZE=$(ls -lh ${BINARY_NAME} | awk '{print $5}')
echo -e "${GREEN}后端构建完成: ${BINARY_NAME} (${SIZE})${NC}"

cd ..

echo -e "${YELLOW}=== 2. 前端构建 ===${NC}"

cd frontend

echo "正在构建前端..."
npm i
npm run build

DIST_SIZE=$(du -sh dist | awk '{print $1}')
echo -e "${GREEN}前端构建完成: dist (${DIST_SIZE})${NC}"

cd ..

echo -e "${YELLOW}=== 3. 停止后端服务 ===${NC}"

ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /mnt/data/note_all

if [ -f stop.sh ]; then
    chmod +x stop.sh
    ./stop.sh
    echo "已停止服务"
fi
EOF

echo -e "${GREEN}服务已停止${NC}"

echo -e "${YELLOW}=== 4. 上传后端 ===${NC}"

scp backend/${BINARY_NAME} ${SERVER_USER}@${SERVER_HOST}:${BACKEND_PATH}/${BINARY_NAME}
echo -e "${GREEN}后端上传完成${NC}"

echo -e "${YELLOW}=== 4b. 上传 jieba 词典 ===${NC}"

ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${BACKEND_PATH}/libs/jieba"
scp backend/libs/jieba/* ${SERVER_USER}@${SERVER_HOST}:${BACKEND_PATH}/libs/jieba/
echo -e "${GREEN}jieba 词典上传完成${NC}"

echo -e "${YELLOW}=== 5. 上传前端 ===${NC}"

ssh ${SERVER_USER}@${SERVER_HOST} "rm -rf ${FRONTEND_PATH}/*"
scp -r frontend/dist/* ${SERVER_USER}@${SERVER_HOST}:${FRONTEND_PATH}/
echo -e "${GREEN}前端上传完成${NC}"

echo -e "${YELLOW}=== 6. 启动后端服务 ===${NC}"

ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /mnt/data/note_all

if [ -f run.sh ]; then
    chmod +x run.sh
    ./run.sh
    echo "已启动服务"
fi

sleep 3
if pgrep -f "note_all_backend" > /dev/null; then
    echo "服务运行正常"
    ps aux | grep note_all_backend | grep -v grep
else
    echo "警告: 服务未运行"
fi
EOF

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo -e "后端: ${BACKEND_PATH}/${BINARY_NAME}"
echo -e "前端: ${FRONTEND_PATH}"