# 家庭自驾行程规划（Travel）

## 绝对不能丢家人已经加的东西

用户一家（主人和老婆）在 Claude artifact 里共用一份行程，数据存在 artifact 的 `db`
（集合 `trips/<行程 id>` 和 `trips/<行程 id>/versions/<版本 id>`，见 `src/familyShare.ts`）。
每次改网页、重新发布时：

- **重新发布页面不会动 db 里的数据**；发布时省略 `capabilities` 会保留原有声明。如果要写 `capabilities`，必须写全，至少 `{sample: {}, db: {}, user: {}}`。去掉 `db` 等于让全家看不到共享行程。
- **不要用 ArtifactData 删除或覆盖 `trips` 里的文档**，除非用户明确要求。要改共享数据，先读、带 `if_version`，只做增补。
- 模板 / 迁移（`templateKI.ts` 的 `upgradeComparison` 等）只作用于本机 localStorage，**不能**写成“重置行程”的逻辑。新加的模板内容只能补充，不能删掉或替换已有的天、住宿、餐厅、清单、记账。
- 共享和本机合并走 `src/merge.ts`：只加不删。本机数据被共享改动前会备份到 localStorage（`travel-planner.family-backup`），设置页有「从本机备份找回」。
- 改了 `familyShare.ts` / `merge.ts` 后，跑一遍 `src/merge.test.ts`，并用两个模拟设备做一次端到端检查：各自先加东西，再共享，双方的东西都要还在；删除不会被加回来。

## 开发

- `npx vitest run`、`npx tsc`、`npm run build`；artifact 用 `node scripts/build-artifact.mjs <输出目录>` 生成，附带 `route-cache.json`。
- 分支：`claude/fervent-ramanujan-6yuq5h`。界面文字用中文。
