#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./apps/client/package.json').version")
echo "当前版本: $CURRENT_VERSION"

echo ""
echo "请选择发布类型:"
echo "1) 正式版 (正式发布)"
echo "2) Beta 版 (预发布)"
echo "3) Alpha 版 (预发布)"
echo "4) RC 版 (预发布)"
echo "5) 自定义版本"
echo ""
read -p "请输入选项 [1-5]: " choice

# Parse version parts
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]:-0}"

# Extract pre-release info if exists
IFS='-' read -ra PRE_INFO <<< "${VERSION_PARTS[2]:-0}"
BASE_PATCH="${PRE_INFO[0]}"
PRE_TAG="${PRE_INFO[1]:-}"
PRE_NUM="${PRE_INFO[2]:-}"

case "$choice" in
  1)
    # 正式版: 升级 patch 或 minor
    read -p "选择升级级别 [patch/minor/major]: " level
    case "$level" in
      patch) PATCH=$((BASE_PATCH + 1)); NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
      minor) MINOR=$((MINOR + 1)); PATCH=0; NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
      major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0; NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
      *) echo "无效选择"; exit 1 ;;
    esac
    PRE_RELEASE=""
    ;;
  2)
    # Beta 版: major.minor.patch-beta.1
    echo "当前版本: $CURRENT_VERSION"
    read -p "输入 beta 编号 [默认 1]: " beta_num
    beta_num="${beta_num:-1}"
    PRE_RELEASE="beta.$beta_num"
    NEW_VERSION="$MAJOR.$MINOR.$PATCH-$PRE_RELEASE"
    ;;
  3)
    # Alpha 版: major.minor.patch-alpha.1
    echo "当前版本: $CURRENT_VERSION"
    read -p "输入 alpha 编号 [默认 1]: " alpha_num
    alpha_num="${alpha_num:-1}"
    PRE_RELEASE="alpha.$alpha_num"
    NEW_VERSION="$MAJOR.$MINOR.$PATCH-$PRE_RELEASE"
    ;;
  4)
    # RC 版: major.minor.patch-rc.1
    echo "当前版本: $CURRENT_VERSION"
    read -p "输入 rc 编号 [默认 1]: " rc_num
    rc_num="${rc_num:-1}"
    PRE_RELEASE="rc.$rc_num"
    NEW_VERSION="$MAJOR.$MINOR.$PATCH-$PRE_RELEASE"
    ;;
  5)
    echo "当前版本: $CURRENT_VERSION"
    read -p "输入新版本 (semver 格式，如 1.2.3-beta.1): " NEW_VERSION
    # 简单的 semver 校验
    if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
      echo "错误: 版本号不符合 semver 规范"
      exit 1
    fi
    ;;
  *)
    echo "无效选择"
    exit 1
    ;;
esac

echo ""
echo "新版本: $NEW_VERSION"
read -p "确认发布? [y/N]: " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "已取消"
  exit 0
fi

# 读取 package.json
PACKAGE_JSON="apps/client/package.json"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
console.log('已更新 $PACKAGE_JSON 版本为 $NEW_VERSION');
"

# 创建 tag
TAG_NAME="v$NEW_VERSION"
echo ""
echo "创建 tag: $TAG_NAME"
git tag "$TAG_NAME"

echo ""
echo "=== 完成 ==="
echo "版本: $NEW_VERSION"
echo "Tag: $TAG_NAME"
echo ""

# 询问是否推送
read -p "是否推送到远端? [y/N]: " push_confirm
if [[ "$push_confirm" == "y" || "$push_confirm" == "Y" ]]; then
  echo "推送 tag 到远端..."
  git push origin "$TAG_NAME"
  echo "推送完成! GitHub Actions 将自动触发构建和发布."
else
  echo "已取消推送。手动推送命令:"
  echo "  git push origin $TAG_NAME"
fi
