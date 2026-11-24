# 心屿 · 个人知识岛屿

Astro + GitHub Pages 的个人站点：博客 / 知识库 / 工具箱。

- 线上地址：https://pspht25.github.io/
- 部署：push 到 `main` 后由 GitHub Actions 自动构建发布（`.github/workflows/deploy.yml`）

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
```

## 如何写文章

在 `src/content/blog/` 新建 Markdown 文件：

```yaml
---
title: 标题
description: 摘要（可选）
pubDate: 2026-11-24
tags: [标签]
---
```

保存并 push 即自动发布。

## 如何加工具

1. 新建 `src/pages/tools/<name>.astro`（可参考 `calculator.astro`）
2. 在 `src/data/tools.ts` 注册表里加一条卡片信息
3. push 即发布

## 如何写知识库

在 `src/content/kb/` 新建 Markdown 文件，frontmatter 支持 `category`（分组）和 `order`（组内排序）。

## giscus 评论（待启用）

1. 仓库 Settings → Features → 勾选 Discussions
2. 安装 https://github.com/apps/giscus
3. 到 https://giscus.app 生成 `repoId` / `categoryId`
4. 填入 `src/consts.ts` 的 `GISCUS` 配置并把 `enabled` 改为 `true`
