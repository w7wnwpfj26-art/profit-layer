# 🚨 密钥泄露紧急处理方案

## ⚠️ 发现的问题

### 1. `.env` 文件已提交到 Git 历史
- **Commit**: `91e4476a14d9dd6815cd8d97465dd964f9782387`
- **日期**: 2026-02-14 17:23:16
- **内容**: 包含真实的 GLM API Key

### 2. 泄露的密钥
```
GLM_API_KEY=<已脱敏，若曾泄露请立即在平台撤销并重新生成>
```

### 3. 影响范围
- ✅ 已在本地 `.env` 文件中移除
- ❌ 仍存在于 Git 历史中 (commit 91e4476)
- ❌ 可能已推送到远程仓库（若使用自建 Git，请检查并清理历史）

---

## 🔧 立即执行的清理步骤

### 步骤 1: 撤销 GLM API Key (最高优先级)

**立即前往 GLM 平台撤销密钥:**
1. 访问: https://open.bigmodel.cn/usercenter/apikeys
2. 找到已泄露的密钥并删除
3. 点击「删除」或「重新生成」
4. 生成新的 API Key

⏰ **时间要求**: 立即执行 (< 5 分钟)

---

### 步骤 2: 从 Git 历史中移除 `.env` 文件

#### 方案 A: 使用 BFG Repo-Cleaner (推荐,最快)

```bash
# 1. 下载 BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 2. 备份仓库
cd /Users/wangqi/Documents/ai
cp -r dapp dapp-backup

# 3. 清理 .env 文件
cd dapp
java -jar ../bfg-1.14.0.jar --delete-files .env

# 4. 清理 reflog 和 GC
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. 强制推送到远程 (⚠️ 需要团队通知)
git push origin --force --all
git push origin --force --tags
```

#### 方案 B: 使用 git filter-repo (更安全)

```bash
# 1. 安装 git-filter-repo
pip3 install git-filter-repo

# 2. 备份仓库
cd /Users/wangqi/Documents/ai
cp -r dapp dapp-backup

# 3. 清理 .env 文件
cd dapp
git filter-repo --path .env --invert-paths --force

# 4. 重新添加远程仓库
git remote add origin https://github.com/your-org/profit-layer.git

# 5. 强制推送
git push origin --force --all
git push origin --force --tags
```

#### 方案 C: 手动重写历史 (最底层控制)

```bash
cd /Users/wangqi/Documents/ai/dapp

# 1. 备份
git tag backup-before-clean

# 2. 使用 filter-branch
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# 3. 清理引用
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 4. 强制推送
git push origin --force --all
git push origin --force --tags
```

---

### 步骤 3: 验证清理结果

```bash
# 检查 .env 是否还在历史中
git log --all --full-history --source -- .env

# 搜索密钥是否还存在
git log -S "aba326a662484fc7a767dfec2cd55250" --all --oneline

# 检查所有分支
git log --all --oneline | grep -E "(配置|GLM|API)"

# 预期结果: 应该没有任何输出
```

---

### 步骤 4: 更新 `.gitignore` (已完成 ✅)

`.gitignore` 已包含:
```
.env
*.log
.env.local
.env.*.local
```

---

### 步骤 5: 团队通知 (如果是协作项目)

如果有其他开发者,需要通知他们:

```bash
⚠️ 紧急通知: Git 历史已重写

原因: 移除意外提交的 .env 文件

操作步骤:
1. 备份你的本地更改
2. 删除本地仓库
3. 重新 clone:
   git clone https://github.com/your-org/profit-layer.git

注意: 不要尝试 pull 或 merge,历史已不兼容
```

---

## 🔒 未来预防措施

### 1. 使用 git-secrets

```bash
# 安装
brew install git-secrets  # macOS
# 或
apt-get install git-secrets  # Linux

# 配置
cd /Users/wangqi/Documents/ai/dapp
git secrets --install
git secrets --register-aws

# 添加自定义规则
git secrets --add 'GLM_API_KEY=.*'
git secrets --add 'DEEPSEEK_API_KEY=.*'
git secrets --add 'EVM_PRIVATE_KEY=0x[a-fA-F0-9]{64}'
git secrets --add '[a-zA-Z0-9_-]{32,}\\.[a-zA-Z0-9_-]{8,}'
```

### 2. Pre-commit Hook

创建 `.git/hooks/pre-commit`:
```bash
#!/bin/sh
# 检查是否意外添加 .env 文件

if git diff --cached --name-only | grep -q "^\.env$"; then
    echo "❌ 错误: 不允许提交 .env 文件!"
    echo "请检查你的修改,确保 .env 在 .gitignore 中"
    exit 1
fi

# 检查是否包含 API Key 模式
if git diff --cached | grep -E "(API_KEY|PRIVATE_KEY|SECRET).*=.*[a-zA-Z0-9]{20,}"; then
    echo "⚠️  警告: 检测到可能的 API Key 或密钥!"
    echo "请确认这不是真实的密钥"
    read -p "确认提交? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
        exit 1
    fi
fi
```

```bash
chmod +x .git/hooks/pre-commit
```

### 3. GitHub Secret Scanning (如果迁移到 GitHub)

GitHub 会自动扫描公开仓库中的密钥并发送警告。

### 4. 环境变量管理最佳实践

```bash
# 使用 direnv (自动加载 .env)
brew install direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc

# 或使用 dotenv-vault (加密 .env)
npm install -g dotenv-vault
dotenv-vault new
dotenv-vault push
```

---

## 📋 清理前检查清单

- [ ] **备份仓库** (`cp -r dapp dapp-backup`)
- [ ] **撤销 GLM API Key** (访问 https://open.bigmodel.cn)
- [ ] **通知团队成员** (如果是协作项目)
- [ ] **确认没有未提交的重要修改** (`git status`)
- [ ] **选择清理方案** (BFG / filter-repo / filter-branch)

---

## 🚀 开源前额外清理

### 1. 检查其他敏感信息

```bash
# 搜索可能的敏感信息
cd /Users/wangqi/Documents/ai/dapp
grep -r "password.*=" --include="*.env*" .
grep -r "token.*=" --include="*.env*" .
grep -r "secret.*=" --include="*.env*" .
grep -r "0x[a-fA-F0-9]{64}" --include="*.env*" .
```

### 2. 更新 README

移除或替换内网 Git URL:
```bash
# 当前
git clone https://github.com/your-org/profit-layer.git

# 改为
git clone https://github.com/your-username/profit-layer.git
```

### 3. 创建新的干净仓库 (可选,最安全)

如果担心历史清理不彻底,可以创建全新仓库:

```bash
# 1. 在 GitHub 创建新仓库
# 2. 复制当前代码 (不包括 .git)
cd /Users/wangqi/Documents/ai
mkdir profit-layer-clean
cd profit-layer-clean
cp -r ../dapp/* .
cp -r ../dapp/.gitignore .
rm -rf .git

# 3. 初始化新仓库
git init
git add .
git commit -m "Initial commit - clean history"

# 4. 推送到 GitHub
git remote add origin https://github.com/your-username/profit-layer.git
git branch -M main
git push -u origin main
```

---

## ⏰ 时间线

| 步骤 | 时间 | 优先级 |
|------|------|--------|
| 撤销 GLM API Key | 立即 | 🔴 最高 |
| 清理 Git 历史 | 30 分钟 | 🟠 高 |
| 验证清理结果 | 10 分钟 | 🟠 高 |
| 设置防护措施 | 1 小时 | 🟡 中 |
| 开源发布 | 之后 | 🟢 低 |

---

## 📞 联系方式

**GLM API 平台**: https://open.bigmodel.cn/usercenter/apikeys  
**Git 清理文档**: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

---

**生成时间**: 2026-02-20 14:45 CST  
**严重程度**: 🔴 高 (API Key 已泄露到 Git 历史)  
**建议操作**: 立即撤销 GLM API Key,然后清理 Git 历史
