#!/usr/bin/env bash
# 谜题审核：调用已部署 Vercel 上的管理员 API（与 README / 计划一致）。
# 用法（在项目根或任意目录执行，需安装 curl）：
#   export ORIGIN='https://你的生产根域名'   # 无尾斜杠
#   export ADMIN_SECRET='与 Vercel 环境变量 ADMIN_SECRET 一致'
#   ./scripts/admin-review.sh pending
#   ./scripts/admin-review.sh approve <uuid>
#   NOTE='字数简短为佳' ./scripts/admin-review.sh reject <uuid>
set -euo pipefail

ORIGIN="${ORIGIN:-}"
ORIGIN="${ORIGIN%/}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

usage() {
  cat <<'EOF'
用法:
  ORIGIN=<生产根URL> ADMIN_SECRET=<密钥> scripts/admin-review.sh <命令> [参数]

命令:
  pending          列出 status=pending 的投稿（JSON）
  all              列出全部状态
  approve <id>     通过审核（写 reviewer_note 可用环境变量 NOTE，默认 ok）
  reject <id>      驳回（reviewer_note 用环境变量 NOTE，默认 未通过）
  published        公开接口 GET /api/riddles-published（无需 ADMIN_SECRET，用于验收）

说明:
  ORIGIN、ADMIN_SECRET 勿写入仓库；ADMIN_SECRET 仅在 Vercel 项目中配置，与本脚本导出值一致即可。
EOF
  exit 1
}

require_env() {
  if [[ -z "$ORIGIN" ]]; then
    echo "错误: 请设置环境变量 ORIGIN（例如 https://xxx.vercel.app）" >&2
    usage
  fi
  if [[ -z "$ADMIN_SECRET" ]]; then
    echo "错误: 请设置环境变量 ADMIN_SECRET（与 Vercel 一致）" >&2
    usage
  fi
}

AUTH=( -H "Authorization: Bearer ${ADMIN_SECRET}" )

cmd="${1:-}"
case "$cmd" in
  pending)
    require_env
    curl -sS "${AUTH[@]}" "$ORIGIN/api/admin/submissions?status=pending"
    echo
    ;;
  all)
    require_env
    curl -sS "${AUTH[@]}" "$ORIGIN/api/admin/submissions?status=all"
    echo
    ;;
  approve)
    require_env
    [[ -n "${2:-}" ]] || usage
    note="${NOTE:-ok}"
    # shellcheck disable=SC2001
    esc=$(printf '%s' "$note" | sed 's/\\/\\\\/g;s/"/\\"/g')
    curl -sS -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
      -d "{\"status\":\"approved\",\"reviewer_note\":\"$esc\"}" \
      "$ORIGIN/api/admin/submissions/$2"
    echo
    ;;
  reject)
    require_env
    [[ -n "${2:-}" ]] || usage
    note="${NOTE:-未通过}"
    esc=$(printf '%s' "$note" | sed 's/\\/\\\\/g;s/"/\\"/g')
    curl -sS -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
      -d "{\"status\":\"rejected\",\"reviewer_note\":\"$esc\"}" \
      "$ORIGIN/api/admin/submissions/$2"
    echo
    ;;
  published)
    if [[ -z "$ORIGIN" ]]; then
      echo "错误: published 子命令仍需要 ORIGIN" >&2
      usage
    fi
    curl -sS "$ORIGIN/api/riddles-published"
    echo
    ;;
  -h | --help | help)
    usage
    ;;
  *)
    usage
    ;;
esac
