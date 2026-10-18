# Seed2Discover — 最小 Demo 执行计划

> 赛道：Nebius · Healthcare / Life Sciences: Research Paper Discovery
> 目标：输入「研究问题 + 3–5 篇种子论文」，输出一份**可追溯**的新论文排序列表（元数据 + 来源链接 + 有证据的相关性解释），部署在 Nebius Serverless，推理用 Nebius Token Factory。

---

## 1. 一句话产品

**"给我你已经信任的 5 篇论文，我找出连着它们、且摘要能证明相关的下一批论文——每条理由都附原文引用并自动核验。"**

差异点（评委看点）：
1. **多种子共识**：优先推荐同时连着多篇种子的论文（不是单篇关键词搜索）。
2. **证据可核验**：LLM 必须从摘要里引一句原文，系统自动检查这句话是否真的在摘要里，标 ✓ 已核验 / ⚠ 未核验。
3. **透明打分**：每条结果显示「引用网络分 / 语义分」两条进度条，以及连着哪几篇种子。

---

## 2. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | 单页 `index.html` + 原生 JS + 内联 SVG 图 | 零构建，FastAPI 直接托管 |
| 后端 | Python 3.12 · FastAPI · httpx(async) | 异步并发调 OpenAlex / Token Factory |
| 论文数据 | **OpenAlex API**（免费） | 一个接口拿到元数据、摘要、参考文献、被引、相关论文 |
| LLM | **Token Factory** · `nvidia/Nemotron-3_5-Lightning`（OpenAI SDK 兼容） | 相关性解释 + 原文引用 + 不确定性 |
| Embedding | **Token Factory** embeddings（模型名用环境变量配置） | 研究问题 ↔ 候选摘要的语义相似度 |
| 可选 | Tavily | 第二阶段：补充网页上下文 |
| 部署 | Docker 镜像 → **Nebius Serverless Endpoint** | 应用（UI+API）与模型端点分离，满足赛题要求 |
| 缓存 | 本地 JSON 文件缓存（`.cache/`） | 现场共享 IP 有 OpenAlex 限额，演示必须稳 |

**降级策略（演示保命）**：没有 Token Factory key 时，语义分改用本地词项重叠，解释改用引用网络模板（"引用了你的 3 篇种子：…"）。有 key 时自动启用 Nemotron + embedding。

---

## 3. 架构与数据流

```
浏览器 (index.html)
   │  POST /api/discover {question, seeds[]}
   ▼
FastAPI 应用 (Nebius Serverless Endpoint 容器)
   ├─ 1. 解析种子   DOI / PMID / OpenAlex ID → OpenAlex Work
   ├─ 2. 扩展候选   每篇种子的 references + 被引(cites:) + related_works
   ├─ 3. 计数打分   候选连着几篇种子 → graph_score
   ├─ 4. 补元数据   批量取 top-N 的标题/作者/摘要
   ├─ 5. 语义打分   Token Factory embeddings（或本地降级）→ semantic_score
   ├─ 6. 融合排序   final = 0.6·graph + 0.4·semantic，去掉种子和重复
   └─ 7. 解释核验   Nemotron 对 top-K 输出 {理由, 原文引用, 不确定性}
                    → 检查引用是否为摘要子串 → verified ✓/⚠
   ▼
JSON → 前端渲染：排序卡片 + 种子-候选关系图
```

模型端点：`https://api.tokenfactory.nebius.com/v1/`（Token Factory 托管，与应用分离部署）。

---

## 4. 目录结构

```
app/
  backend/
    main.py        # FastAPI 入口：/api/discover、/api/health、静态页面
    openalex.py    # OpenAlex 客户端（带文件缓存）
    pipeline.py    # 种子解析 → 候选扩展 → 打分 → 排序
    llm.py         # Token Factory：embedding + 解释生成 + 引用核验
    text.py        # 摘要还原、本地降级相似度
  frontend/
    index.html     # 单页 UI
  requirements.txt
  Dockerfile
  .env.example
docs/
  EXECUTION_PLAN.md
```

---

## 5. 执行步骤（按小时排）

| # | 时间 | 任务 | 完成标准 |
|---|---|---|---|
| 0 | 0:00–0:30 | 领取 Token Factory / Tavily key；申请 OpenAlex 免费 key；确认 Nebius 项目和容器仓库权限 | `.env` 填好，`curl /v1/models` 返回 200 |
| 1 | 0:30–1:30 | **后端骨架**：种子解析 + 候选扩展 + 引用网络计数 | 用 notebook 的 5 篇示例种子，接口返回按连接数排序的候选 |
| 2 | 1:30–2:30 | **语义打分**：Token Factory embedding + 本地降级 | 每条候选有 `semantic_score`，没有 key 也能跑 |
| 3 | 2:30–3:30 | **LLM 解释 + 原文核验** | top-10 每条有理由、原文引用、不确定性，以及 ✓/⚠ |
| 4 | 3:30–4:30 | **前端**：表单 + 排序卡片 + 打分条 + 关系图 | 浏览器里一键跑完示例 |
| 5 | 4:30–5:30 | **部署**：Docker 构建 → 推送 Nebius 容器仓库 → 创建 Serverless Endpoint | 公网 URL 可访问，跑通示例 |
| 6 | 5:30–6:00 | **预热缓存 + 演示彩排** | 示例查询命中缓存，10 秒内出结果 |
| 7 | 有余力再做 | Tavily 补充网页上下文、聚类、导出 CSV/BibTeX、用户 👍/👎 反馈重排 | — |

**功能冻结线**：第 4 步结束后不再加功能，只修 bug + 部署 + 彩排。

---

## 6. 演示脚本（90 秒）

1. **痛点**（15 秒）："研究者手里有 5 篇好论文，关键词搜出来几千条，没法判断该读哪篇。"
2. **输入**（10 秒）：粘贴研究问题和 5 个 DOI（黑色素瘤单细胞免疫示例），点 Discover。
3. **结果**（40 秒）：
   - 第 1 名同时连着 4/5 篇种子，展示两条打分条；
   - 展开理由：Nemotron 给出的原文引用带 ✓ 已核验高亮；
   - 指出一条 ⚠：「模型的话不能直接信，我们自动核验」。
4. **关系图**（15 秒）：种子与候选的连接图，看出哪些论文是"桥"。
5. **架构**（10 秒）：OpenAlex → Token Factory（Nemotron + embedding）→ Nebius Serverless。

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| OpenAlex 无 key 时按 IP 共享每日额度，现场很多队伍共用一个 IP | 申请免费 key（`OPENALEX_API_KEY`）+ 文件缓存 + 演示前预热 |
| Token Factory embedding 模型名不确定 | `EMBED_MODEL` 环境变量配置；调用失败自动降级为本地相似度 |
| Nemotron 输出带思考过程或 JSON 不规范 | 剥离 `<think>`，宽松解析 JSON，失败时退回模板解释 |
| 新论文被引很少 | 语义分兜底，并利用 `related_works` 信号 |
| 部署卡住 | 第 5 步预留 1 小时；本地 Docker 先跑通再推送 |

---

## 8. 本地运行

```bash
cd app
uv venv --python 3.12 && source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env   # 填入 TOKEN_FACTORY_API_KEY 等
uvicorn backend.main:app --reload --port 8000
# 打开 http://localhost:8000
```
