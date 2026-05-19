# AI Farm Agent Instructions

## Expense Rules

### Items that are COMMON expenses (not per-cow feed)
These are bought in bulk bottles/bags and used across all cows. Use `expense_type='common'` with `category_id` from `expense_categories`:

- Ostrovet, Liver tonic, Mineral (powder), Salt
- Any calcium/vitamin/tonic injectable or oral supplement
- Vaccines, any medicine

### Items that are FEED expenses (per-cow tracking)
Use `expense_type='feed'` with the cow's `cow_id`, food's `food_item_id`, `quantity_kg`, `unit_rate`, `entry_shift`:

- Super Napier (green fodder), Concentrate feed 1 / 2
- Rice bran (அரிசி தவிடு), Wheat bran (கோதுமை தவிடு)
- Groundnut cake (புண்ணாக்கு), Cotton seed (பருத்திக்கொட்டை)
- Mulberry (மல்பெரி), Calf grower feed, Hay / straw

## Workflow Priority
1. Query existing data first: `SELECT * FROM cows`, `SELECT * FROM food_items`, `SELECT * FROM buyers`, `SELECT * FROM expense_categories`
2. Match names flexibly (case-insensitive). Tamil names may exist as English names.
3. If a food/expense category doesn't exist, INSERT it first, then use its new ID.
4. For daily entries: check if one exists for the date, create if not.
5. Calculate feed amounts: amount = quantity_kg * COALESCE(unit_rate, (SELECT unit_rate FROM food_price_history WHERE food_item_id=? ORDER BY effective_from DESC LIMIT 1))

## SQL Style
- Always use parameterized queries (`?` placeholders)
- Use DATE('now') for current date
- Use strftime for date formatting
- Wrap multiple related writes in a transaction when possible
