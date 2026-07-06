# 桌面端 Stitch 设计说明（全页面定稿）

> Stitch 项目：`CPA Desktop KeyList`（id `13301687407130835514`，PRIVATE）
> 设计系统：`Quiet Paper`（asset `ff51642488514a2e9560a821266a459b`）
> 分支：`feature/sidecar-v1-models`
> 本轮目标：用 Stitch 出桌面端全部页面定稿图，统一于移动端 Quiet Paper 视觉语言，采用桌面交互范式（顶部水平 nav、卡片网格、hover 操作组、无 swipe/FAB/底部 tabbar）。

## 屏幕清单（6 个桌面端 + 1 个 DESIGN.md）

| 页面 | 屏幕 id | 标题 | 本地文件（png/html） |
|---|---|---|---|
| 密钥列表 | `627634a7beb847c59c932d3aab67b091` | CPA 密钥管理 - 密钥列表 | `stitch_keylist_desktop.*` |
| 选择模型（独立页） | `30331753d12c4607a8b26274c7035b2b` | CPA 密钥管理 - 选择模型 | `stitch_pickmodel_desktop.*` |
| Key 用量详情 | `af345d94117d412781c487f400649884` | CPA 密钥管理 - Key 用量详情 | `stitch_usage_desktop.*` |
| 新建 Key | `d78f57799edb46c6b00ca0f29bcb3e2b` | CPA 密钥管理 - 新建 Key | `stitch_newkey_desktop.*` |
| 编辑 Key | `09271b432fa74506a3be01049e6ddeef` | CPA 密钥管理 - 编辑 Key | `stitch_editkey_desktop.*` |
| 登录 | `9bfeccc9838644d1aa839538bbd18b25` | CPA 密钥管理 - 登录 | `stitch_login_desktop.*` |
| 设计系统源 | `9933318848909106286` | DESIGN.md | `_stitch/DESIGN.md` |

> 注：列表里还有一个 `21cdae5b3848465fa738220fef0974ed` 同名"密钥列表"屏幕，是 Stitch 内部编辑历史副本，以 `627634a7beb847c59c932d3aab67b091` 为准。

## 查看方式
- 本地直接打开各 `stitch_*_desktop.html`（可交互，hover/状态可见）
- 或查看 `stitch_*_desktop.png`（Stitch 服务端截图）
- Stitch 在线：项目 `CPA Desktop KeyList`，6 个屏幕均可见

## 设计系统 token 映射（Stitch Quiet Paper → web/src/styles.css :root）

| Stitch token | 值 | styles.css 变量 |
|---|---|---|
| page-bg | #FAF9F5 | --bg |
| surface | #FFFFFF | --panel |
| surface-container | #F1EDEB | --panel-2 (#f0eee8 近似) |
| surface-container-low | #F7F3F1 | --muted-bg (#e9e6df 近似) |
| border | #E3E1DB | --border |
| border-strong | #D5D2CB | --border-strong |
| text-primary | #2D2A26 | --text |
| text-muted | #6D6760 | --muted |
| primary (greige) | #8B8680 | --accent |
| danger | #C65746 | --danger |
| success | #10B981 | --ok |
| warning | #E0AA14 | --warn |

> Stitch 的 surface-container 层级与 styles.css 的 `--panel-2`/`--muted-bg` 略有差异，实现时以 styles.css 现有变量为准，必要时微调。

## 排版
- UI 字体：Inter（Stitch 用；styles.css 用 system sans，实现时可保留 system sans 不引 Inter）
- 等宽：Courier Prime（与 styles.css 一致）
- nav-title 16px/600，nav-subtitle 12px/400
- card-title 15px/600，card-secondary-mono 12px/400
- section-label 11px/700/0.05em/uppercase

## 各页面要点

### 1. 密钥列表（KeyList）
- 顶部水平 nav：左 `CPA 密钥管理` + base url，右 `密钥列表` / `新建密钥`(primary) / `退出登录`
- 页面工具栏：h1 `密钥列表` + `刷新` / `新建密钥`
- 卡片网格：`auto-fill minmax(320px,1fr)`，桌面 3 列，窄屏单列，max-width 1200px
- 卡片：状态圆点 + 名称 + chevron；key preview 等宽；每日用量进度条（超限转 #C65746）；meta 行；模型 chip
- **hover 操作组**：所有启用卡静态稿均显示底部 `详情/编辑/重置RPM/轮换/删除`，禁用卡隐藏（按用户要求：非禁用都用 hover 态展示）
- 状态样例：正常 / 超限（红）/ 无限制（`不限`，无进度条）/ 禁用（降透明度）/ hover 态

### 2. 选择模型（独立页，从表单"+ 添加模型"跳入）
- 顶部水平 nav（同上）
- 头部：`返回` + h1 `选择模型` + 右侧 `完成（已选 N）` primary
- 副标题：`已选 N 个模型 · 别名将自动等于模型名`
- 搜索框：`搜索模型 / provider / 档位`
- 分组卡片：按 provider + tier（codex · team / codex · free）分组；每组头部 `全选/清空`，下方模型用 chip-checkbox（选中=greige 填充+对勾，未选=muted pill）
- sticky footer：左 `已选 N`，右 `完成（已选 N）` + `取消`
- 对应现有 `web/src/components/ModelPicker.tsx` 的搜索+分组+全选/清空+多选结构，做成独立路由页

### 3. Key 用量详情（KeyUsage）
- 顶部水平 nav
- 头部：`返回` + key id（等宽）+ key name（muted）+ 右侧 `今日/本周` 分段切换 + `编辑`
- 汇总 hero 卡：3 个统计 tile（`今日花费` 大数字 accent / `调用次数` / `平均 RPM`），下方进度条 `$8.45 / $10.00` + `85%`
- 按别名用量表：别名 | 计费方式（按 token 绿/按次 greige tag）| Provider | USD（粗）| 调用次数 | Input tokens | Output tokens | Cache tokens | 命中率
- 残留行（已不在配置）muted + `已不在配置中` badge
- 对应现有 `web/src/pages/KeyUsage.tsx` 的桌面表格分支，新增 hero 统计区

### 4. 新建 Key（KeyNew）
- 顶部水平 nav（`新建密钥` 为当前/active）
- h1 `新建 Key` + 右侧 `取消`
- 表单卡（2 列网格）：Key ID* / 名称 / RPM / 状态(启用开关) / 每日上限 / 每周上限 / 允许 /v1/models 开关+hint / 允许的模型（chip + `+ 添加模型` 跳选择模型页）/ 模型单价表（别名|Provider|档位|计费方式开关|输入|输出|缓存读|推荐）
- footer：`创建 Key` primary + `取消`，下方 muted 内存说明
- 对应现有 `KeyForm.tsx` 桌面分支 + `KeyNew.tsx`

### 5. 编辑 Key（KeyEdit）
- 顶部水平 nav
- h1 `编辑 Key` + 右侧 `重置RPM` / `轮换` / `取消`，下方 key id（等宽 muted）+ name
- 表单卡同新建，但 Key ID 只读（mono + muted bg）；字段预填
- footer：左 `保存修改` primary + `取消`；**最右** `删除 Key` danger-outline（红字红边透明底）区分破坏性操作
- 对应现有 `KeyForm.tsx`（idReadOnly）+ `KeyEdit.tsx`

### 6. 登录（Login）
- 无顶部 nav（未登录）
- 全屏 paper 背景，居中
- 应用标识：`cpa-key-policy 管理面板` + `登录到 CLIProxyAPI`
- 登录卡（max-width 460px）：`CPA 地址 (Base URL)` 输入（默认 `http://127.0.0.1:8317`）/ `Management Key (CPA secret-key)` 密码输入 / `登录` primary 全宽 / 内存说明 + 嵌入回退说明
- 对应现有 `web/src/pages/Login.tsx`

## 交互约定（桌面，全页面通用）
- 所有操作键盘可达；focus-visible 用 accent-ring（greige 18%）
- 无 swipe / long-press / FAB / 底部 tabbar
- hover 用边框加深 + row-tint，不位移卡片
- 破坏性操作（删除）用 danger 色/边框，二次确认由前端 confirm 处理
- 模型选择从表单独立成路由页（`+ 添加模型` 跳转，`完成` 返回表单）

## 实现阶段注意事项（Stitch 与现有代码的差异点）

### Toggle 开关（启用此 key / 计费方式 / 允许 /v1/models）
**Stitch 的 toggle 视觉与现有代码不一致，实现时必须用现有 `.switch` 组件，不要照搬 Stitch 渲染的开关。**
现有 `.switch`（见 `styles.css`）是精心对齐面板的：
- 结构：`<label class="switch"><input type="checkbox"/><span class="track"><span class="thumb"/></span><span>标签</span></label>`
- 尺寸：track 44×24、thumb 18×18、translateX(20px)
- 颜色：未选 `--border-strong`，选中 `--accent`（greige），thumb `--on-accent`
- focus：`:focus-visible + .track` 用 `--accent-ring`（3px 外环）
- 动画：`var(--t-fast)` 过渡

Stitch 设计稿里的开关是它自己生成的近似样式，track/thumb 比例和动画都不一样，且计费方式那张图把它画成普通 checkbox，缺少"按 token / 按次"的语义标签。接入后端时：
- 直接复用现有 `.switch` 样式类，不要引入 Stitch 的开关 CSS
- 计费方式列保留现有"开关 + 文字标签（按 token / 按次）"的写法（见 `KeyForm.tsx` `renderPriceEditor` 的 table 分支）
- 注意 Stitch 截图里的开关仅供视觉参考，以现有 `.switch` 实物为准

### Hover 操作组（KeyList 卡片）
**Stitch 用 `absolute inset-0` 覆盖式 overlay 显示操作组，会盖住卡片信息且卡片矮时 5 个按钮显示不全。实现时改为底部操作行 hover 浮现（不覆盖卡片内容）。**
- 卡片结构：信息区（头部/preview/进度条/meta/chips）+ 底部 `.kc-actions` 操作行
- 默认 `.kc-actions` 高度 0 / opacity 0 / overflow hidden；`:hover` / `:focus-within` 时展开到自然高度、opacity 1
- 操作行内联 5 个 sm 按钮：详情 / 编辑 / 重置RPM / 轮换 / 删除(danger)
- 禁用卡不展开操作行（或展开但禁用按钮）
- 不用 absolute overlay，不遮挡信息，不会显示不全

### 其他差异（已在前面列出，此处汇总）
- UI 字体：Stitch 用 Inter，现有用 system sans → 保留 system sans，不引 Inter
- 文案：Stitch 写"删除密钥"/"不限额度"，现有 i18n 是"删除"/"不限" → 按现有 i18n key 走
- KeyList 分页器：Stitch 加了底部 `< 1 >`，现有无分页 → 实现时忽略，除非后续要加分页
- surface-container 层级与 `--panel-2`/`--muted-bg` 略有差异 → 以 styles.css 现有变量为准

## 与现有代码的对接差异（实现阶段参考）
- 现 `KeyList.tsx` 桌面走 `<table>`，移动走 `.card-stack`；新设计让桌面也用卡片网格 → 移除桌面 `<table>`，扩展 `.card-stack` 为响应式 grid，去掉 `@media (min-width:641px)` 里对 `.card-stack` 的隐藏，新增桌面 hover 操作组
- `App.tsx` 顶部 `.header` 改为水平 nav（标题+base url 左，导航+操作右）；移除桌面工具栏 `.actions.mobile-hidden`
- `ModelPicker` 从内联组件改为独立路由页（`/keys/new/models` / `/keys/:id/edit/models`），通过 `+ 添加模型` 跳入，`完成` 带选中结果返回表单
- `KeyUsage.tsx` 桌面表格保留，新增 hero 统计卡（3 tile + 进度条）
- `Login.tsx` 已是居中卡，视觉对齐即可
- 移动端 FAB / 底部 tabbar 保留用于 <640px

## 待确认 / 后续
- 全部 6 张定稿已出。请打开各 `stitch_*_desktop.html` 或 png review。
- 满意后进入编码实现阶段（独立目标，需重构路由 + KeyList/KeyForm/ModelPicker/KeyUsage + styles.css 响应式调整）。
- 如某页要改，告诉我具体调整点，用 `stitch_edit_screens` 迭代对应屏幕。
