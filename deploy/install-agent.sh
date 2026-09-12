#!/usr/bin/env bash
# pjx agent 一键安装脚本。
#
# 用法:
#   curl -fsSL https://example.com/install-agent.sh | bash -s -- \
#     --master wss://probe.example.com/api/agent/ws --token <token> --name node-1 --tags prod,hk
set -euo pipefail

MASTER=""
TOKEN=""
NAME="$(hostname)"
TAGS=""
VERSION="latest"
REPO="jacob-bytes/pjx"
PREFIX="/usr/local/bin"
SERVICE="/etc/systemd/system/pjx-agent.service"

usage() {
  cat <<'USAGE'
用法:
  install-agent.sh --master <ws地址> --token <令牌> [--name <名称>] [--tags <标签>] [--version <版本>]

示例:
  install-agent.sh --master wss://probe.example.com/api/agent/ws --token pjx_xxx --name hk-01 --tags prod,hk
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --master) MASTER="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

[ -n "$MASTER" ] || { echo "缺少 --master" >&2; exit 1; }
[ -n "$TOKEN" ] || { echo "缺少 --token" >&2; exit 1; }

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "不支持的架构: $ARCH" >&2; exit 1 ;;
esac

URL="https://github.com/${REPO}/releases/${VERSION}/download/pjx-agent-linux-${ARCH}"
echo "下载 ${URL}"
curl -fsSL "$URL" -o /tmp/pjx-agent
install -m 0755 /tmp/pjx-agent "${PREFIX}/pjx-agent"

cat > "$SERVICE" <<UNIT
[Unit]
Description=pjx agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${PREFIX}/pjx-agent -master ${MASTER} -token ${TOKEN} -name ${NAME} -tags ${TAGS}
Restart=on-failure
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now pjx-agent
echo "pjx-agent 已启动，查看日志: journalctl -u pjx-agent -f"
