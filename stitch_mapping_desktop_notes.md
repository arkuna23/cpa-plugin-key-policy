# Stitch Desktop Mapping Design — Implementation Notes

## Stitch project
- Project: `CPA Desktop Mapping` (id `17908456439698784334`, PRIVATE)
- Design system: `Quiet Paper` (asset `89c60539e4ea4f6f835a72748669ed5f`)

## Screens (4 total)
1. **AliasList** (`853fd2a2f93541809e80a303cd8ab8bd`) — 映射管理 page, 别名映射 tab active
   - 6 example alias cards in 3-column grid
   - Each card: alias name (mono) + dispatch badge (轮询/优先) + target rows (provider·model + group chip) + pricing line + reference count + 编辑/删除 hover actions
   - Delete disabled when referenced (badge shows "被 N 个密钥引用")
2. **AliasEdit** (`7e7f71ac466f449a872335dcd4f1d0f3`) — 编辑别名 form
   - Alias name input + dispatch radio (轮询/优先 with descriptions) + target list with × remove + 添加目标 button + billing mode toggle (tokens/per_call) + price inputs + 保存/取消
3. **Classify** (`c65e2f5417bb436898d50f034cdadcc5`) — 映射管理 page, 凭证归类 tab active
   - Built-in rules (read-only): plan_type→组名, tier→组名
   - 4 custom rule cards: rule name + 字段:正则→组名 subtitle + match count badge + enable toggle + 编辑/删除 + expand/collapse
   - First card expanded: paginated file name list (50/page, 上一页 1/5 下一页)
4. **RuleEdit** (`f0a45244692746deab726ec21da92f61`) — 编辑规则 form
   - Rule name input + 匹配字段 dropdown (filename/provider/plan_type/tier/自定义...) + 正则表达式 input with live compile validation (green ✓ + "正则编译通过") + 目标组名 input + 启用 toggle + 保存/取消

## Token mapping (verified against styles.css :root)
All screens use Quiet Paper tokens matching existing CSS variables:
- page-bg #faf9f5, surface #ffffff, border #e3e1db, accent #8b8680
- text-primary #2d2a26, text-muted #6d6760
- danger #c65746, ok #10b981
- Typography: Inter (UI) + Courier Prime (monospace)

## Implementation guidance

### CSS additions needed (styles.css)
- `.map-page` — page container for /mapping route
- `.map-tabs` — horizontal segmented tab strip (别名映射 | 凭证归类), active tab accent underline
- `.map-toolbar` — toolbar row with primary button right-aligned
- `.alias-grid` — reuse `.card-stack` grid (auto-fill minmax(320px, 1fr))
- `.alias-card` — alias mapping card (reuse `.keycard` base)
- `.alias-dispatch-badge` — pill badge for 轮询/优先
- `.alias-targets` — target list rows (provider·model + group chip)
- `.alias-pricing` — monospace pricing summary line
- `.alias-refs` — reference count muted text
- `.rule-list` — vertical stacked list (NOT grid, max-width 800px)
- `.rule-card` — classification rule card
- `.rule-builtin` — built-in rules section (read-only)
- `.rule-match-badge` — match count pill (accent-soft bg)
- `.rule-detail` — expandable detail panel with paginated file list
- `.rule-pager` — pagination controls (上一页 N/M 下一页)
- `.form-page` / `.fp-head` / `.fp-foot` — reuse existing form page styles
- `.field-dropdown` — dropdown select for 匹配字段
- `.regex-valid` / `.regex-invalid` — live regex validation states (green ✓ / red border)

### Toggle switches
- MUST use existing `.switch` CSS component (44×24 track, 18×18 thumb, translateX(20px), accent-ring focus)
- NOT Stitch's rendered toggles (Stitch uses different markup)

### Interaction rules (from DESIGN.md)
- All actions keyboard reachable; focus-visible ring uses accent-ring
- No swipe/FAB/bottom tabbar on desktop
- Hover states use row-hover tint or border-hover; never move cards
- Tooltips on disabled delete button showing "被 N 个密钥引用"

### ModelPicker reuse
- Alias edit "添加目标" button → navigate to existing standalone ModelPicker page
- Returns selected provider+model+group via router state
- Form restores targets from router state on return

### i18n keys needed (zh-CN)
- mapping.title (映射管理)
- mapping.aliasTab (别名映射), mapping.classifyTab (凭证归类)
- mapping.newAlias (新建别名), mapping.newRule (新建规则)
- mapping.alias.name (别名名称), mapping.alias.dispatch (调度模式)
- mapping.alias.roundRobin (轮询), mapping.alias.priority (优先)
- mapping.alias.roundRobinDesc, mapping.alias.priorityDesc
- mapping.alias.targets (目标列表), mapping.alias.addTarget (添加目标)
- mapping.alias.billing (计费模式), mapping.alias.tokens, mapping.alias.perCall
- mapping.alias.input (输入), mapping.alias.output (输出), mapping.alias.cache (缓存)
- mapping.alias.perCallUnit (按次), mapping.alias.perMillion (per 1M)
- mapping.alias.refs (被 {n} 个密钥引用), mapping.alias.unreferenced (未被引用)
- mapping.alias.moreTargets (+{n} 更多目标)
- mapping.rule.name (规则名称), mapping.rule.field (匹配字段)
- mapping.rule.field.filename, mapping.rule.field.provider, mapping.rule.field.plan_type, mapping.rule.field.tier, mapping.rule.field.custom
- mapping.rule.regex (正则表达式), mapping.rule.regexValid (正则编译通过), mapping.rule.regexInvalid (正则编译失败)
- mapping.rule.group (目标组名), mapping.rule.enabled (启用)
- mapping.rule.builtin (内置规则), mapping.rule.builtinReadOnly (只读)
- mapping.rule.custom (自定义规则)
- mapping.rule.matchCount (匹配 {n} 个凭证)
- mapping.rule.prevPage (上一页), mapping.rule.nextPage (下一页)
- mapping.rule.pageInfo ({cur} / {total})
- mapping.edit (编辑), mapping.delete (删除), mapping.save (保存), mapping.cancel (取消)
- mapping.back (返回)
- mapping.deleteBlocked (被 {n} 个密钥引用，请先移除引用)
