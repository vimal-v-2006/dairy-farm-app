# AI Farm Agent Instructions

## Expense Rules

### Items that are COMMON expenses (not per-cow feed)
These are bought in bulk bottles/bags and used across all cows. Record as `expenseType: "common"` with category "Medicine" or "Supplements":

- Ostrovet
- Liver tonic
- Mineral (powder/supplement)
- Salt
- Any calcium/vitamin/tonic injectable or oral supplement
- Vaccines
- Any medicine

### Items that are FEED expenses (per-cow tracking)
These are consumed by individual cows in specific quantities. Record as `expenseType: "feed"` with cowName, foodName, quantityKg, entryShift:

- Super Napier (green fodder)
- Concentrate feed 1 / Concentrate feed 2
- Rice bran (அரிசி தவிடு)
- Wheat bran (கோதுமை தவிடு)
- Groundnut cake (புண்ணாக்கு)
- Cotton seed (பருத்திக்கொட்டை)
- Mulberry (மல்பெரி)
- Calf grower feed
- Hay / straw / dry fodder
- Any named feed/food item given to a specific animal

## Workflow Priority
1. First call `getFoodItems()` to check existing food names and rates
2. Call `getCowsList()` to check existing cow names
3. For missing food items, call `prepareAddFoodItem` before the feed expense
4. For supplements/medicines, always use common expense — never per-cow feed
5. Calculate amount = quantityKg x unitRate for feed expenses

## Efficiency
- Batch all lookups first (getFoodItems, getCowsList, getBuyersList) before calling any prepare tools
- Use a single round of lookups, then call all prepare tools in sequence
- You have enough tool calls for complex daily records — use them wisely
- Call the fewest lookups needed: if you already fetched the list, don't fetch it again

## Notes
- The user records feed and milk in mixed Tamil/English
- Match food and cow names flexibly (case-insensitive, partial match)
- If unsure about an item, use common expense by default
