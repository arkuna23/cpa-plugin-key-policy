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

## UI copy language
- All UI copy in Chinese (zh-CN) to match the existing i18n. Use these exact labels:
  - App title area: "CPA Key Management"
  - Nav: "Key List" = mi-yao-lie-biao, "New Key" = xin-jian-mi-yao, "Logout" = tui-chu-deng-lu
  - Toolbar buttons: "New Key" (primary), "Refresh" = shua-xin
  - Card actions: "Detail" = xiang-qing, "Edit" = bian-ji, "Reset RPM" = chong-zhi-RPM, "Rotate" = lun-huan, "Delete" = shan-chu
  - Status: "Enabled" = yi-qi-yong, "Disabled" = yi-jin-yong
  - Usage: "Today" = jin-ri, "This Week" = ben-zhou, "Unlimited" = bu-xian, "Models" = mo-xing
  - When rendering Chinese text in the design, use the actual Chinese characters: 密钥列表, 新建密钥, 退出登录, 刷新, 详情, 编辑, 重置RPM, 轮换, 删除, 已启用, 已禁用, 今日, 本周, 不限, 模型.
