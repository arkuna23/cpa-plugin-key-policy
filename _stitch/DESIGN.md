# Quiet Paper - CPA Desktop Design System

## Intent
The CPA management panel's mobile UI already uses a "Quiet Paper" light theme: a warm paper background, white rounded cards, a restrained greige accent (NOT blue), and monospace text for key ids/previews. The desktop redesign keeps the same visual language but replaces mobile-only interaction patterns (swipe-to-revoke, FAB, bottom tabbar) with desktop-appropriate equivalents (top horizontal nav, multi-column card grid, hover/focus action buttons, keyboard-reachable).

## Color tokens (mirror web/src/styles.css :root)
- Page background (paper): #faf9f5
- Card / raised surface: #ffffff
- Secondary container bg: #f0eee8
- Tertiary / hover: #e9e6df
- Border: #e3e1db
- Border strong: #d5d2cb
- Border hover: #cecac4
- Primary text: #2d2a26
- Muted text: #6d6760
- Accent (greige): #8b8680
- Accent 2: #7f7a74
- Accent 3: #726d67
- Accent soft: rgba(139,134,128,0.12)
- Accent ring: rgba(139,134,128,0.18)
- On-accent (text on accent fill): #ffffff
- Row hover tint: rgba(139,134,128,0.06)
- Scrim: rgba(45,42,38,0.35)
- Danger: #c65746
- Danger soft: rgba(198,87,70,0.08)
- Danger border: rgba(198,87,70,0.35)
- Ok: #10b981
- Ok soft: rgba(16,185,129,0.08)
- Ok border: rgba(16,185,129,0.35)
- Warn: #e0aa14

## Typography
- UI font: system sans (Inter / -apple-system / Segoe UI).
- Monospace (key id, key preview, prices, rpm): "Courier Prime", ui-monospace, Consolas, monospace.
- Section labels: 11px, weight 700, letter-spacing 0.05em, uppercase, muted color.
- Card title (key name): 15px, weight 600.
- Card secondary (id/preview): 12px monospace, muted.
- Body: 14px.

## Radii
- Small: 6px
- Medium (cards): 10px
- Large: 14px
- Pill (chips, tags): 999px

## Layout
- Top horizontal nav bar: paper background, bottom border, left side app title + base url subtitle, right side nav items (Key List, New Key) and a Logout button. No bottom tabbar, no FAB.
- Page content max-width 1200px, centered, 24px side padding.
- Card grid: CSS grid, auto-fill minmax(320px, 1fr) so it is multi-column on wide screens and collapses to a single column below ~640px. Gap 16px.
- Each card is a white surface, 1px border, radius 10px, padding 16px.

## Card content (KeyList item)
- Header row: status dot (ok green when enabled, muted when disabled) + key name (or id if no name) on the left; chevron > on the right.
- Key preview: monospace, muted, truncated, 12px.
- Daily usage progress bar: thin track in muted-bg, fill in accent; when usage >= limit the fill and the amount text turn danger red. If no limit is set, show "$X.XX - unlimited" instead of a bar.
- Meta row: left shows "$daily / $limit" (or "$daily - unlimited"), right shows "{n} models".
- Model alias chips: up to 2 chips, then a "+N" chip. Chips are pill, muted-bg, 11px.
- Hover/focus action group: appears on hover/focus at the card footer, buttons: Detail / Edit / Reset RPM / Rotate / Delete. Delete is danger-colored. No swipe gesture.
- Disabled state: card opacity reduced, status dot muted.
- Over-limit state: progress fill + amount in danger red.

## Buttons
- Primary: accent fill, white text, radius 6px, 36px height (sm: 28px).
- Secondary: transparent, border, text color primary, hover border-hover + row-hover tint.
- Danger: danger fill, white text.
- Icon/sm buttons: 28px height, same styling rules.

## Interaction rules (desktop)
- All actions keyboard reachable; focus-visible ring uses accent-ring.
- No swipe gestures, no long-press, no FAB, no bottom tabbar.
- Hover states use row-hover tint or border-hover; never move cards.
- Tooltips allowed on icon buttons.

## Mapping page (global alias mapping + credential classification)

The mapping page is a standalone route `/mapping` with a two-tab layout at the top of the content area. Both tabs share the same page chrome (topnav + page title "映射管理" + tab strip). The tab strip is a horizontal segmented control: "别名映射" | "凭证归类". Active tab has accent underline; inactive tabs are muted.

### Tab 1: 别名映射 (Alias Mapping)

- Content is a card grid (same auto-fill minmax(320px, 1fr) as KeyList) of alias mapping cards.
- A primary "新建别名" button sits in a toolbar row above the grid (right-aligned).
- Each alias card:
  - Header row: alias name (monospace, 15px, weight 600) on the left; a small dispatch-mode badge on the right ("轮询" or "优先", pill, muted-bg, 11px).
  - Target list: each target is a row showing `provider · model` (monospace, 13px) + optional group chip ("free"/"team"/"custom", pill, muted-bg, 10px). Up to 3 rows shown, then "+N 更多目标" collapsed text.
  - Pricing summary: one line, monospace 12px muted: "输入 $X.XX / 输出 $Y.YY / 缓存 $Z.ZZ per 1M" or "按次 $W.WW/次" when per_call.
  - Reference count: "被 N 个密钥引用" (muted, 12px). If 0, show "未被引用".
  - Hover action group at card footer: 编辑 / 删除. Delete is danger-colored and DISABLED when referenced by keys (show tooltip "被 N 个密钥引用").
- Alias edit form (inline expand or modal): alias name input, dispatch mode radio (轮询/优先), target list with "+ 添加目标" button (jumps to ModelPicker standalone page), per-target removable chip, pricing section (billing mode toggle tokens/per_call + price inputs), save/cancel.

### Tab 2: 凭证归类 (Credential Classification)

- Content is a vertical list of rule cards (NOT a grid — full-width rows, stacked, max-width 800px centered).
- A primary "新建规则" button sits in a toolbar row above the list.
- Built-in rules section (top, read-only): a card labeled "内置规则（只读）" containing two rows:
  - "plan_type → 组名" (field=plan_type, pattern=*, group=<detected>)
  - "tier → 组名" (field=tier, pattern=*, group=<detected>)
  These rows have no edit/delete buttons, just an info icon explaining they always run after custom rules.
- Custom rules section (below, editable): ordered list, each rule card:
  - Left: drag handle / up-down arrows for reordering.
  - Main content: rule name (15px, weight 600) + subtitle line `字段: 正则 → 组名` (monospace, 13px, muted).
  - Right: match count badge ("匹配 N 个凭证", pill, accent-soft bg, accent text, 12px) + enable/disable toggle (.switch) + edit button + delete button.
  - Expandable detail: clicking the card or a chevron expands a panel showing the matched credential file names in a paginated list (50 per page, page navigation at bottom). Each file name row: monospace 13px, muted, with provider chip.
- Rule edit form: rule name input, field dropdown (filename/provider/plan_type/tier/自定义...) + custom field input when "自定义" selected, regex pattern input (monospace, with live compile validation — red border + error message if invalid), target group name input, enable toggle, save/cancel.

### UI copy (Chinese)
- Page title: 映射管理
- Tabs: 别名映射, 凭证归类
- Alias tab: 新建别名, 编辑, 删除, 轮询, 优先, 被N个密钥引用, 未被引用, 添加目标, 输入, 输出, 缓存, 按次
- Classify tab: 新建规则, 内置规则, 匹配N个凭证, 编辑, 删除, 字段, 正则, 组名, 启用, 禁用, 上一页, 下一页, 自定义
- Nav item: 映射

## UI copy language
- All UI copy in Chinese (zh-CN) to match the existing i18n. Use these exact labels:
  - App title area: "CPA Key Management"
  - Nav: "Key List" = mi-yao-lie-biao, "New Key" = xin-jian-mi-yao, "Logout" = tui-chu-deng-lu
  - Toolbar buttons: "New Key" (primary), "Refresh" = shua-xin
  - Card actions: "Detail" = xiang-qing, "Edit" = bian-ji, "Reset RPM" = chong-zhi-RPM, "Rotate" = lun-huan, "Delete" = shan-chu
  - Status: "Enabled" = yi-qi-yong, "Disabled" = yi-jin-yong
  - Usage: "Today" = jin-ri, "This Week" = ben-zhou, "Unlimited" = bu-xian, "Models" = mo-xing
  - When rendering Chinese text in the design, use the actual Chinese characters: 密钥列表, 新建密钥, 退出登录, 刷新, 详情, 编辑, 重置RPM, 轮换, 删除, 已启用, 已禁用, 今日, 本周, 不限, 模型.
