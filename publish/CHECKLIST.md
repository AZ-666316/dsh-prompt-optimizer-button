# 上架清单（prompt-optimizer-button）

> 目标：GitHub 仓库 → dshmarket 商店（经 awesome-dsh-plugin PR 收录）
> 当前本地状态：插件目录已是 git 仓库，提交 `9cb0e73 feat: prompt optimizer button 0.4.0`，无 remote。

## 0. 商店规则（已核实 `contributing.md`，2026-11）

- 商店只收录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 清单里的仓库；上架 = 给它提 PR。
- 仓库根必须有 `package.json` 且声明 `dsh.bundle.patch`（已满足，`cordis.patch.yml` 在根）。
- 仓库必须含真实代码；**仓库创建至少满 1 天**（CI 自动检查）。
- 仓库加 topic：`dsh-plugin`。
- 一个 PR 只加一个文件：`data/plugins/<owner>__<repo>.yml`；一个 PR 最多 3 条。
- 描述必须与代码一致、不带营销词；分类挑最贴近的（本插件：`ui`）。
- CI 顺序：条目数 → `dsh.bundle` → 仓库年龄 → `awesome-lint` + 站点构建。
- 可选：`icon:` 用 GitHub 托管的方形位图（~96px+）；`tarball:` 用 GitHub Release 预构建包；npm 可选。

## 1. 建 GitHub 仓库（老大操作）

- 用户名：`OWNER`（待填）
- 仓库名：`dsh-prompt-optimizer-button`（建议就用这个，与包名一致）
- 可见性：public；**不要**勾选自动生成 README / .gitignore / license（本地已有）
- 建好后在仓库 Settings → Topics 加 `dsh-plugin`

## 2. 推本地仓库

前置：本机 git 配了代理 `127.0.0.1:7897`，需要先打开 Clash（或把代理改成本机可用端口）。凭据用 Git Credential Manager，首次推送会弹窗登录。

```powershell
cd C:\Users\10974\Documents\deepseek-harness\default-workspace\dsh-plugins\prompt-optimizer-button
git remote add origin https://github.com/OWNER/dsh-prompt-optimizer-button.git
git branch -M main
git push -u origin main
```

如不想用命令行，也可用 GitHub Desktop 添加本地仓库后 Publish。

## 3. （可选）发 npm

- 先 `npm login`（未登录），包名 `dsh-prompt-optimizer-button` 目前未被占用。
- `package.json` 里 `repository` 必须指回被收录的仓库（收录时 CI 会核对）。
- 不发 npm 也能上架：在市场里会回退到 GitHub Release tarball 或整仓源码。

## 4. 等满 24 小时（CI 硬门）

仓库创建时间起算满 1 天，提 PR 才能过 CI。

## 5. 给 awesome-dsh-plugin 提 PR

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`
2. 新建 `data/plugins/OWNER__dsh-prompt-optimizer-button.yml`（内容 = `publish/awesome-entry.yml`，把 `OWNER` 换成实际用户名）
3. 提交并开 PR，标题建议：`Add OWNER/dsh-prompt-optimizer-button`
4. PR 描述用 `publish/PR_BODY.md`
5. 等 CI 绿 + 维护者 review（会实际装插件看效果）

## 6. 收录后

- 市场与站点自动刷新（通常 1 天内）。
- 之后每次发版：GitHub Release（tag `v0.4.0`）或 npm 发布；市场按优先级取 npm → Release tarball → 源码。
