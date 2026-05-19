const { buildSchemaContext } = require('./schemaInspector');
const { executePlan, validateSql } = require('./dbExecutor');
const { db } = require('../db');

const pendingConfirmations = new Map();
const AI_UNAVAILABLE_REPLY = 'AI model is not available right now. Please check Ollama and the model.';

// ── UI hint detection ──────────────────────────────────────────────────────────
// Inspect SELECT result rows and return a ui hint so the frontend can render
// the best widget: table | metrics | bar_chart | line_chart | list | text
function detectUiHint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'text';
  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter((k) => rows.every((r) => r[k] !== null && r[k] !== undefined && !isNaN(Number(r[k]))));
  const dateKeys = keys.filter((k) => /date|day|month|week/i.test(k));

  // Single-row multiple numeric columns → metrics cards
  if (rows.length === 1 && numericKeys.length >= 2) return 'metrics';

  // Time-series data (date + 1-3 numeric cols) → line chart
  if (dateKeys.length === 1 && numericKeys.length >= 1 && numericKeys.length <= 3 && rows.length >= 3) return 'line_chart';

  // Name + single value (e.g. cow name + litres) → bar chart
  if (keys.length === 2 && numericKeys.length === 1 && rows.length >= 2 && rows.length <= 20) return 'bar_chart';

  // Multiple rows with multiple columns → table
  if (rows.length >= 2 || keys.length >= 3) return 'table';

  return 'list';
}

// Attach ui hints to execution results
function attachUiHints(plan, execution) {
  const results = execution.results || [];
  return results.map((result, index) => {
    const uiHint = result.type === 'SELECT' ? detectUiHint(result.rows) : 'text';
    return { ...result, uiHint, purpose: plan.actions?.[index]?.purpose || '' };
  });
}

function extractJson(text) {
  if (!text) throw new Error('AI returned an empty response.');
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return JSON.');
    return JSON.parse(match[0]);
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function currentYear() {
  return new Date().getFullYear();
}

function parseBusinessDate(message) {
  const text = String(message || '').toLowerCase();
  const today = new Date(todayIsoDate());
  if (/\btoday\b/.test(text)) return todayIsoDate();
  if (/\byesterday\b/.test(text)) {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };
  const monthNames = Object.keys(months).join('|');
  let match = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (match) {
    const year = Number(match[3] || currentYear());
    const month = months[match[1].toLowerCase()];
    const day = Number(match[2]);
    if (day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  match = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (match) {
    const year = Number(match[3] || currentYear());
    const month = months[match[2].toLowerCase()];
    const day = Number(match[1]);
    if (day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  return null;
}

function parseShift(message) {
  const text = String(message || '').toLowerCase();
  if (/\b(morning|am)\b/.test(text)) return 'Morning';
  if (/\b(evening|night|pm)\b/.test(text)) return 'Evening';
  return null;
}

function parseLitres(message) {
  const text = String(message || '').toLowerCase();
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:l|ltr|ltrs|litre|litres|liter|liters)\b/);
  if (!match) return null;
  const litres = Number(match[1]);
  return Number.isFinite(litres) && litres > 0 ? litres : null;
}

function findMentionedCow(message) {
  const normalized = String(message || '').toLowerCase();
  const cows = db.prepare("SELECT id, name FROM cows WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY LENGTH(name) DESC").all();
  return cows.find((cow) => new RegExp(`\\b${escapeRegex(String(cow.name).toLowerCase())}\\b`).test(normalized)) || null;
}

function shouldDefaultDateToToday(message) {
  const text = String(message || '').toLowerCase();
  return /\b(add|save|record|enter|insert|set|update|change|sold|sale|expense|milk|gave|produced)\b/.test(text);
}

function getEntryDateForWrite(message) {
  return parseBusinessDate(message) || (shouldDefaultDateToToday(message) ? todayIsoDate() : null);
}

function parseMoneyAmount(message) {
  const text = String(message || '').toLowerCase();
  const patterns = [
    /₹\s*(\d+(?:\.\d+)?)/,
    /\brs\.?\s*(\d+(?:\.\d+)?)/,
    /\b(\d+(?:\.\d+)?)\s*(?:rupees|rs)\b/,
    /\b(?:amount|expense|cost|paid|payment)\s*(?:is|of|for|=|:)?\s*(\d+(?:\.\d+)?)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = Number(match[1]);
      if (Number.isFinite(amount) && amount > 0) return amount;
    }
  }
  return null;
}

function parseRate(message) {
  const text = String(message || '').toLowerCase();
  const patterns = [
    /(?:rate|rate\s*per\s*(?:litre|liter|kg)|per\s*(?:litre|liter|kg)|at)\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)/,
    /(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)\s*\/\s*(?:l|ltr|litre|liter|kg)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rate = Number(match[1]);
      if (Number.isFinite(rate) && rate > 0) return rate;
    }
  }
  return null;
}

function parseQuantityKg(message) {
  const text = String(message || '').toLowerCase();
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilogram|kilograms)\b/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function findMentionedBuyer(message) {
  const normalized = String(message || '').toLowerCase();
  const buyers = db.prepare("SELECT id, name, default_rate FROM buyers WHERE name IS NOT NULL AND TRIM(name) != '' AND COALESCE(active, 1) = 1 ORDER BY LENGTH(name) DESC").all();
  return buyers.find((buyer) => new RegExp(`\\b${escapeRegex(String(buyer.name).toLowerCase())}\\b`).test(normalized)) || null;
}

function normalizeEntityName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function parseBuyerNameForCreate(message) {
  const raw = String(message || '').trim();
  const text = raw.toLowerCase();
  if (!/\b(add|create|save|new|insert)\b/.test(text) || !/\bbuyer\b/.test(text)) return null;
  if (/\b(sold|sell|sale|sales|litre|liter|litres|liters|milk)\b/.test(text)) return null;

  const patterns = [
    /\bbuyer\s+(?:named|name|called|as)\s+([a-z0-9][a-z0-9 ._-]{0,80})\b/i,
    /\b(?:add|create|save|new|insert)\s+(?:a\s+)?buyer\s+([a-z0-9][a-z0-9 ._-]{0,80})\b/i,
    /\b(?:add|create|save|new|insert)\s+([a-z0-9][a-z0-9 ._-]{0,80})\s+buyer\b/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const name = normalizeEntityName(match[1].replace(/\b(?:with|rate|contact|location|notes?)\b[\s\S]*$/i, ''));
      if (name && !/^buyer$/i.test(name)) return name;
    }
  }
  return null;
}

function buildBuyerPlanFromMessage(message) {
  const name = parseBuyerNameForCreate(message);
  if (!name) return null;
  const existing = db.prepare('SELECT id, name, active FROM buyers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1').get(name);
  if (existing) {
    if (Number(existing.active) === 0) {
      return {
        reply: `Buyer ${existing.name} already exists but is inactive. I reactivated it.`,
        actions: [
          {
            sql: `UPDATE buyers SET active = 1 WHERE id = ${Number(existing.id)}`,
            purpose: `Reactivate existing buyer ${existing.name}.`,
            requiresConfirmation: false
          }
        ],
        readOnly: false,
        expectsConfirmation: false,
        deterministicRepair: true
      };
    }
    return {
      reply: `Buyer ${existing.name} already exists.`,
      actions: [],
      readOnly: true,
      expectsConfirmation: false,
      deterministicRepair: true
    };
  }

  const rate = parseRate(message) || 0;
  return {
    reply: `Added buyer ${name}${rate ? ` with default rate ₹${rate}/L` : ''}.`,
    actions: [
      {
        sql: `INSERT INTO buyers (name, location, default_rate, contact, notes, active) VALUES (${sqlQuote(name)}, NULL, ${Number(rate)}, NULL, 'Added by AI assistant', 1)`,
        purpose: `Create buyer ${name} so milk sales can be linked to this buyer.`,
        requiresConfirmation: false
      }
    ],
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}

function findMentionedFood(message) {
  const normalized = String(message || '').toLowerCase();
  const foods = db.prepare("SELECT id, name, rate_per_kg, unit_type FROM food_items WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY LENGTH(name) DESC").all();
  return foods.find((food) => new RegExp(`\\b${escapeRegex(String(food.name).toLowerCase())}\\b`).test(normalized)) || null;
}

function findExpenseCategory(message) {
  const text = String(message || '').toLowerCase();
  const categories = db.prepare("SELECT id, name FROM expense_categories WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY LENGTH(name) DESC").all();
  const direct = categories.find((category) => new RegExp(`\b${escapeRegex(String(category.name).toLowerCase())}\b`).test(text));
  if (direct) return direct;
  const synonymMap = [
    { regex: /\b(medicine|medical|doctor|vet|veterinary|health|treatment)\b/, name: 'Medical expense' },
    { regex: /\b(feed|food|fodder|concentrate|silage|grass)\b/, name: 'Feed 1' },
    { regex: /\b(labour|labor|worker|salary|wage)\b/, name: 'Labour' },
    { regex: /\b(transport|diesel|petrol|vehicle|lorry|auto)\b/, name: 'Transport' },
    { regex: /\b(electricity|current|power|bill)\b/, name: 'Electricity' },
    { regex: /\b(repair|maintenance|service)\b/, name: 'Maintenance' },
    { regex: /\b(cow\s*purchase|purchase\s*cow|bought\s*cow)\b/, name: 'Cow purchase' }
  ];
  const mapped = synonymMap.find((item) => item.regex.test(text));
  return mapped ? categories.find((category) => category.name.toLowerCase() === mapped.name.toLowerCase()) || null : null;
}

function latestFoodSnapshot(food, entryDate) {
  if (!food) return null;
  const history = db.prepare(`SELECT id, food_item_id, purchase_quantity, purchase_amount, unit_rate, unit_type, effective_from
    FROM food_price_history
    WHERE food_item_id = ? AND date(effective_from) <= date(?)
    ORDER BY datetime(effective_from) DESC, id DESC
    LIMIT 1`).get(food.id, entryDate);
  if (history) {
    return {
      food_price_history_id: history.id,
      food_name_snapshot: food.name,
      unit_type_snapshot: history.unit_type || food.unit_type || 'kg',
      unit_rate: Number(history.unit_rate || food.rate_per_kg || 0),
      rate_effective_from: history.effective_from || null
    };
  }
  return {
    food_price_history_id: null,
    food_name_snapshot: food.name,
    unit_type_snapshot: food.unit_type || 'kg',
    unit_rate: Number(food.rate_per_kg || 0),
    rate_effective_from: null
  };
}

function ensureDailyEntryAction(entryDate, notes = 'Created by AI assistant') {
  return {
    sql: `INSERT OR IGNORE INTO daily_entries (entry_date, total_milk_litres, remaining_milk_litres, total_income, total_expenses, profit, notes) VALUES (${sqlQuote(entryDate)}, 0, 0, 0, 0, 0, ${sqlQuote(notes)})`,
    purpose: 'Ensure the daily entry row exists before saving daily-entry tab data.',
    requiresConfirmation: false
  };
}

function buildCowWiseMilkPlanFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(milk|milked|gave|give|given|litre|liter|litres|liters|production|produced|yield)\b/.test(text)) return null;

  const cow = findMentionedCow(message);
  const litres = parseLitres(message);
  const entryDate = getEntryDateForWrite(message);
  const shift = parseShift(message);
  if (!cow || !litres || !entryDate || !shift) return null;

  const morningLitres = shift === 'Morning' ? litres : 0;
  const eveningLitres = shift === 'Evening' ? litres : 0;
  const dailyEntry = db.prepare('SELECT id FROM daily_entries WHERE entry_date = ?').get(entryDate);
  const existing = dailyEntry
    ? db.prepare('SELECT id FROM cow_milk_entries WHERE daily_entry_id = ? AND cow_id = ? AND LOWER(COALESCE(entry_shift, ?)) = LOWER(?) LIMIT 1')
      .get(dailyEntry.id, cow.id, shift, shift)
    : null;

  const actions = [
    {
      sql: `INSERT OR IGNORE INTO daily_entries (entry_date, total_milk_litres, remaining_milk_litres, total_income, total_expenses, profit, notes) VALUES (${sqlQuote(entryDate)}, 0, 0, 0, 0, 0, 'Created by AI assistant')`,
      purpose: 'Ensure the daily parent row exists before saving cow-wise milk production.',
      requiresConfirmation: false
    }
  ];

  if (existing?.id) {
    actions.push({
      sql: `UPDATE cow_milk_entries SET morning_litres = ${morningLitres}, evening_litres = ${eveningLitres}, total_litres = ${litres}, entry_shift = ${sqlQuote(shift)}, status = 'Milked', notes = 'Updated by AI assistant' WHERE id = ${Number(existing.id)}`,
      purpose: `Update the existing ${shift.toLowerCase()} cow-wise milk row for ${cow.name} on ${entryDate}.`,
      requiresConfirmation: false
    });
  } else {
    actions.push({
      sql: `INSERT INTO cow_milk_entries (daily_entry_id, cow_id, morning_litres, evening_litres, total_litres, entry_shift, status, notes) SELECT id, ${Number(cow.id)}, ${morningLitres}, ${eveningLitres}, ${litres}, ${sqlQuote(shift)}, 'Milked', 'Added by AI assistant' FROM daily_entries WHERE entry_date = ${sqlQuote(entryDate)}`,
      purpose: `Insert cow-wise milk production for ${cow.name} on ${entryDate}.`,
      requiresConfirmation: false
    });
  }

  return {
    reply: `${existing?.id ? 'Updated' : 'Added'} ${litres} litres for ${cow.name} on ${entryDate} ${shift.toLowerCase()} shift.`,
    actions,
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}


function extractBuyerNameFromSaleMessage(message) {
  const raw = String(message || '').trim();
  const patterns = [
    /\b(?:to|for|in|from)\s+([a-z0-9][a-z0-9 ._-]{0,60})\s+(?:in\s+)?(?:morning|evening|night|am|pm)\b/i,
    /\b(?:to|for|in|from)\s+([a-z0-9][a-z0-9 ._-]{0,60})(?:\s+at\s+\d|\s+rate\b|\s+on\b|\s*$)/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const name = normalizeEntityName(match[1].replace(/\b(?:today|yesterday|morning|evening|night|am|pm|milk|sold|sale|sales)\b/ig, ''));
      if (name) return name;
    }
  }
  return null;
}

function latestBuyerSaleRate(buyerId) {
  const row = db.prepare(`SELECT rate_per_litre FROM milk_sales
    WHERE buyer_id = ? AND COALESCE(rate_per_litre, 0) > 0
    ORDER BY id DESC LIMIT 1`).get(buyerId);
  return Number(row?.rate_per_litre || 0);
}

function buildMilkSalePlanFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(sold|sell|sale|sales|buyer|customer|milk\s*sale)\b/.test(text)) return null;
  const buyer = findMentionedBuyer(message);
  const litres = parseLitres(message);
  const entryDate = getEntryDateForWrite(message);
  const shift = parseShift(message) || 'Morning';
  const mentionedBuyerName = extractBuyerNameFromSaleMessage(message);

  if (!buyer) {
    return {
      reply: mentionedBuyerName
        ? `I couldn't find buyer ${mentionedBuyerName}. Add it first like: add buyer named ${mentionedBuyerName}`
        : 'I need the buyer name to save this milk sale.',
      actions: [],
      readOnly: true,
      expectsConfirmation: false,
      deterministicRepair: true
    };
  }
  if (!litres || !entryDate) {
    return {
      reply: 'I found the buyer, but I need the sale date and litres to save the milk sale.',
      actions: [],
      readOnly: true,
      expectsConfirmation: false,
      deterministicRepair: true
    };
  }

  const rate = parseRate(message) || Number(buyer.default_rate || 0) || latestBuyerSaleRate(buyer.id);
  if (!rate) {
    return {
      reply: `I found buyer ${buyer.name}, but no default milk rate is saved. Please include the rate, for example: ${litres} liter sold to ${buyer.name} at 45 on ${entryDate}.`,
      actions: [],
      readOnly: true,
      expectsConfirmation: false,
      deterministicRepair: true
    };
  }

  const income = Number((litres * rate).toFixed(2));
  return {
    reply: `Added milk sale: ${litres} litres to ${buyer.name} on ${entryDate} ${shift.toLowerCase()} shift at ₹${rate}/L. Income ₹${income}.`,
    actions: [
      ensureDailyEntryAction(entryDate),
      {
        sql: `INSERT INTO milk_sales (daily_entry_id, buyer_id, litres, rate_per_litre, income, payment_status, entry_shift, notes) SELECT id, ${Number(buyer.id)}, ${litres}, ${rate}, ${income}, 'Paid', ${sqlQuote(shift)}, 'Added by AI assistant' FROM daily_entries WHERE entry_date = ${sqlQuote(entryDate)}`,
        purpose: `Insert milk sale row for ${buyer.name} so it appears in Milk sold details.`,
        requiresConfirmation: false
      }
    ],
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}

function buildFoodExpensePlanFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(feed|food|fodder|concentrate|silage|kg|kgs)\b/.test(text)) return null;
  if (!/\b(expense|cost|paid|bought|buy|add|save|record|used|gave|given)\b/.test(text)) return null;
  const food = findMentionedFood(message);
  const cow = findMentionedCow(message);
  const entryDate = getEntryDateForWrite(message);
  const shift = parseShift(message) || null;
  const quantityKg = parseQuantityKg(message) || 0;
  const typedRate = parseRate(message);
  const amountFromMessage = parseMoneyAmount(message);
  if (!food || !entryDate || (!quantityKg && !amountFromMessage)) return null;
  const snapshot = latestFoodSnapshot(food, entryDate);
  const unitRate = typedRate || Number(snapshot?.unit_rate || 0);
  const amount = quantityKg && unitRate ? Number((quantityKg * unitRate).toFixed(2)) : amountFromMessage;
  if (!amount) return null;
  const category = findExpenseCategory(message) || db.prepare("SELECT id, name FROM expense_categories WHERE LOWER(name) LIKE 'feed%' ORDER BY id LIMIT 1").get();
  return {
    reply: `Added food expense on ${entryDate}: ${food.name}${cow ? ` for ${cow.name}` : ''}${quantityKg ? `, ${quantityKg} kg` : ''}, amount ₹${amount}.`,
    actions: [
      ensureDailyEntryAction(entryDate),
      {
        sql: `INSERT INTO expenses (daily_entry_id, category_id, expense_type, cow_id, food_item_id, food_price_history_id, food_name_snapshot, unit_type_snapshot, rate_effective_from, quantity_kg, unit_rate, amount, entry_shift, description, payment_mode, bill_path) SELECT id, ${category?.id ? Number(category.id) : 'NULL'}, 'feed', ${cow?.id ? Number(cow.id) : 'NULL'}, ${Number(food.id)}, ${snapshot?.food_price_history_id ? Number(snapshot.food_price_history_id) : 'NULL'}, ${sqlQuote(snapshot?.food_name_snapshot || food.name)}, ${sqlQuote(snapshot?.unit_type_snapshot || food.unit_type || 'kg')}, ${snapshot?.rate_effective_from ? sqlQuote(snapshot.rate_effective_from) : 'NULL'}, ${Number(quantityKg || 0)}, ${Number(unitRate || 0)}, ${Number(amount)}, ${shift ? sqlQuote(shift) : 'NULL'}, ${sqlQuote('Added by AI assistant')}, 'Cash', NULL FROM daily_entries WHERE entry_date = ${sqlQuote(entryDate)}`,
        purpose: 'Insert food/feed expense row so it appears in Daily expenses and reports.',
        requiresConfirmation: false
      }
    ],
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}

function buildCommonExpensePlanFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(expense|cost|paid|payment|bill|spent|medicine|medical|transport|repair|labour|labor|electricity|maintenance)\b/.test(text)) return null;
  if (/\b(feed|food|fodder|concentrate|silage|kg|kgs)\b/.test(text)) return null;
  const entryDate = getEntryDateForWrite(message);
  const amount = parseMoneyAmount(message);
  if (!entryDate || !amount) return null;
  const category = findExpenseCategory(message) || db.prepare("SELECT id, name FROM expense_categories WHERE LOWER(name) = 'other expense' LIMIT 1").get();
  const cow = findMentionedCow(message);
  const shift = parseShift(message) || null;
  const description = category?.name ? `${category.name} added by AI assistant` : 'Added by AI assistant';
  return {
    reply: `Added ${category?.name || 'expense'} on ${entryDate}${cow ? ` for ${cow.name}` : ''}: ₹${amount}.`,
    actions: [
      ensureDailyEntryAction(entryDate),
      {
        sql: `INSERT INTO expenses (daily_entry_id, category_id, expense_type, cow_id, food_item_id, food_price_history_id, food_name_snapshot, unit_type_snapshot, rate_effective_from, quantity_kg, unit_rate, amount, entry_shift, description, payment_mode, bill_path) SELECT id, ${category?.id ? Number(category.id) : 'NULL'}, 'common', ${cow?.id ? Number(cow.id) : 'NULL'}, NULL, NULL, NULL, NULL, NULL, 0, 0, ${Number(amount)}, ${shift ? sqlQuote(shift) : 'NULL'}, ${sqlQuote(description)}, 'Cash', NULL FROM daily_entries WHERE entry_date = ${sqlQuote(entryDate)}`,
        purpose: 'Insert common expense row so it appears in Daily expenses and reports.',
        requiresConfirmation: false
      }
    ],
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}

function buildDirectMilkPlanFromMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(total\s*milk|milk\s*produced|direct\s*entry|produced)\b/.test(text)) return null;
  if (findMentionedCow(message)) return null;
  if (/\b(sold|sale|buyer|expense|cost|paid)\b/.test(text)) return null;
  const litres = parseLitres(message);
  const entryDate = getEntryDateForWrite(message);
  if (!litres || !entryDate) return null;
  return {
    reply: `Set direct milk production for ${entryDate} to ${litres} litres.`,
    actions: [
      ensureDailyEntryAction(entryDate),
      {
        sql: `UPDATE daily_entries SET total_milk_litres = ${litres}, remaining_milk_litres = ${litres} - COALESCE((SELECT SUM(litres) FROM milk_sales WHERE daily_entry_id = daily_entries.id), 0), updated_at = CURRENT_TIMESTAMP WHERE entry_date = ${sqlQuote(entryDate)}`,
        purpose: 'Update direct total milk production for the daily entry.',
        requiresConfirmation: false
      }
    ],
    readOnly: false,
    expectsConfirmation: false,
    deterministicRepair: true
  };
}

function buildDailyEntryPlanFromMessage(message) {
  return buildBuyerPlanFromMessage(message)
    || buildCowWiseMilkPlanFromMessage(message)
    || buildMilkSalePlanFromMessage(message)
    || buildFoodExpensePlanFromMessage(message)
    || buildCommonExpensePlanFromMessage(message)
    || buildDirectMilkPlanFromMessage(message);
}

function isConfirmationMessage(message) {
  return /^(yes|y|confirm|confirmed|ok|okay|do it|execute|delete it|proceed)$/i.test(String(message || '').trim());
}

function needsConfirmation(plan) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  return actions.some((action) => {
    const sql = action.sql || action;
    try {
      const validated = validateSql(sql);
      if (validated.type === 'DELETE') return true;
      if (validated.type === 'UPDATE' && /\b(users|password_hash)\b/i.test(validated.sql)) return true;
      return Boolean(action.requiresConfirmation);
    } catch {
      return false;
    }
  });
}

function getActionTable(action) {
  const sql = String(action?.sql || action || '').trim();
  const insertMatch = sql.match(/^INSERT\s+(?:OR\s+(?:IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO\s+([`"\[]?\w+[`"\]]?)/i);
  if (insertMatch) return insertMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  const updateMatch = sql.match(/^UPDATE\s+([`"\[]?\w+[`"\]]?)/i);
  if (updateMatch) return updateMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  const deleteMatch = sql.match(/^DELETE\s+FROM\s+([`"\[]?\w+[`"\]]?)/i);
  if (deleteMatch) return deleteMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  return null;
}

function planHasWrite(plan) {
  return (Array.isArray(plan?.actions) ? plan.actions : []).some((action) => /^(INSERT|UPDATE|DELETE)\b/i.test(String(action.sql || action || '').trim()));
}

function planWritesTable(plan, tableName) {
  return (Array.isArray(plan?.actions) ? plan.actions : []).some((action) => getActionTable(action) === tableName);
}

function insertColumnsForTable(action, tableName) {
  if (getActionTable(action) !== tableName) return [];
  const sql = String(action?.sql || action || '').trim();
  const match = sql.match(/^INSERT\s+(?:OR\s+(?:IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO\s+[`"\[]?\w+[`"\]]?\s*\(([^)]+)\)/i);
  if (!match) return [];
  return match[1].split(',').map((column) => column.trim().replace(/[`"\[\]]/g, '').toLowerCase());
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function messageMentionsKnownCow(message) {
  try {
    const normalized = String(message || '').toLowerCase();
    return db.prepare("SELECT name FROM cows WHERE name IS NOT NULL AND TRIM(name) != ''").all()
      .some((cow) => new RegExp(`\\b${escapeRegex(String(cow.name).toLowerCase())}\\b`).test(normalized));
  } catch {
    return false;
  }
}

function validateBusinessPlanForVisibility(userMessage, plan) {
  if (!planHasWrite(plan)) return null;
  const message = String(userMessage || '').toLowerCase();
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const wantsBuyerCreate = Boolean(parseBuyerNameForCreate(userMessage));
  const wantsSale = !wantsBuyerCreate && /\b(sales?|sell|sold|customer|aavin|payment for milk)\b/.test(message);
  const wantsCowWiseMilk = (/(cow\s*wise|cow-wise|\bcow\b|\bcows\b|\bmilked\b)/.test(message) || messageMentionsKnownCow(userMessage))
    && /\b(milk|litre|liter|litres|liters|production|produced|yield)\b/.test(message)
    && !/\bdirect\b/.test(message);

  if (wantsSale && !planWritesTable(plan, 'milk_sales')) {
    return 'I should save milk sales in the milk sales rows, not only in the daily total. Please include the buyer/date/litres/rate, and I will add it correctly.';
  }

  if (wantsCowWiseMilk && !planWritesTable(plan, 'cow_milk_entries')) {
    return 'I should save cow-wise production in cow milk entry rows so it appears in the cow-wise section. Please include the cow name, date, shift, and litres.';
  }

  const milkSaleInserts = actions.filter((action) => getActionTable(action) === 'milk_sales' && /^INSERT\b/i.test(String(action.sql || action || '').trim()));
  if (milkSaleInserts.some((action) => !insertColumnsForTable(action, 'milk_sales').includes('buyer_id'))) {
    return 'Milk sales need a buyer so they appear correctly in the Sales section. Please mention the buyer name, or ask me to list buyers first.';
  }

  const cowMilkInserts = actions.filter((action) => getActionTable(action) === 'cow_milk_entries' && /^INSERT\b/i.test(String(action.sql || action || '').trim()));
  if (cowMilkInserts.some((action) => !insertColumnsForTable(action, 'cow_milk_entries').includes('cow_id'))) {
    return 'Cow-wise milk entries need a cow name/id so they appear correctly. Please mention which cow produced the milk.';
  }

  return null;
}

function buildSystemPrompt(schemaContext) {
  return `You are the backend AI database assistant for Milk Business Pro, a dairy farm financial app.
You receive the SQLite schema and a natural language user request. Return ONLY valid JSON. No markdown. No explanation outside JSON.

DATABASE SCHEMA:
${schemaContext}

CURRENT DATE: ${todayIsoDate()}

ANSWERING COMPLEX QUESTIONS:
- For any analytical/reporting question (totals, averages, comparisons, rankings, trends, profit/loss, best/worst cow, monthly summary, date ranges), always generate a SELECT query — do not say "I cannot answer".
- Use SQLite aggregate functions: SUM(), AVG(), COUNT(), MAX(), MIN(), GROUP BY, ORDER BY, LIMIT.
- For monthly/weekly trends: use strftime('%Y-%m', entry_date) for grouping.
- For cow rankings: JOIN cow_milk_entries with cows, GROUP BY cow_id, ORDER BY SUM(total_litres) DESC.
- For profit analysis: SELECT entry_date, total_income, total_expenses, profit FROM daily_entries.
- For buyer analysis: JOIN milk_sales with buyers, GROUP BY buyer_id.
- Always SELECT human-readable column aliases (e.g. SUM(total_litres) AS total_litres).
- Never return empty actions for a data question — always attempt a SELECT.

SECURITY AND EXECUTION RULES:
- The frontend never touches the database. You are inside the backend.
- Allowed SQL only: SELECT, INSERT, UPDATE, DELETE.
- Never generate DROP, ALTER, CREATE, PRAGMA, VACUUM, ATTACH, DETACH, schema changes, or multiple statements in one SQL string.
- UPDATE and DELETE must always include a precise WHERE clause.
- DELETE is dangerous: first SELECT matching rows and set requiresConfirmation true unless the user is already confirming a pending delete.
- Normal safe INSERTs may execute without confirmation.
- Simple precise UPDATEs may execute without confirmation, but if ambiguous, SELECT first and ask a clarifying question.
- Prefer existing categories/rows. Use SELECT first if you need IDs such as category_id, daily_entry_id, cow_id, buyer_id, food_item_id.
- For expenses: ensure a daily_entries row exists for the target date before inserting expenses.
- For cow-wise milk production: ensure a daily_entries row exists, then write cow_milk_entries.
- For milk sales: ensure a daily_entries row exists, then write milk_sales with an existing buyer_id, litres, rate_per_litre, income, payment_status, and entry_shift.
- For milk sales: income = litres * rate_per_litre.
- For cow milk entries: total_litres should be the entered total, or morning_litres + evening_litres.
- Keep SQL concise and use SQLite date functions when helpful.
- Never expose secrets, database paths, JWTs, or password hashes.
- User-facing reply text must be plain text only: no markdown, no **bold**, no headings, no code fences.

Return JSON with this exact shape:
{
  "reply": "short human answer or confirmation question",
  "actions": [
    { "sql": "SELECT ...", "purpose": "why this query is needed", "requiresConfirmation": false }
  ],
  "readOnly": false,
  "expectsConfirmation": false
}

If the user is asking only for explanation or you cannot safely decide the SQL, return actions: [] and a helpful reply.`;
}

async function callOllama(messages) {
  const { baseUrl, model } = getOllamaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, format: 'json' }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeResults(plan, execution) {
  const results = execution.results || [];
  return results.map((result, index) => ({
    index,
    purpose: plan.actions?.[index]?.purpose || '',
    type: result.type,
    rowCount: result.rowCount,
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid,
    rows: result.rows
  }));
}

async function makeReplyFromResults(userMessage, plan, execution) {
  const schemaContext = buildSchemaContext();
  const resultSummary = summarizeResults(plan, execution);
  const system = `You convert database execution results into a concise friendly answer for the dairy farm app user. Return ONLY JSON: {"reply":"..."}. Do not mention SQL unless needed. Use rupee symbol for money when relevant. Write plain text only: no markdown, no **bold**, no headings, no code fences.`;
  const content = await callOllama([
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ userMessage, schemaContext, planReply: plan.reply, results: resultSummary }).slice(0, 20000) }
  ]);
  return extractJson(content).reply || plan.reply || 'Done.';
}

async function planForMessage(message) {
  const schemaContext = buildSchemaContext();
  const content = await callOllama([
    { role: 'system', content: buildSystemPrompt(schemaContext) },
    { role: 'user', content: message }
  ]);
  const plan = extractJson(content);
  if (!Array.isArray(plan.actions)) plan.actions = [];
  return plan;
}

async function handleChat({ message, userId = 'default' }) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return { success: true, reply: 'Please type a question or database request.', actions: [], data: {} };

  try {
    const pending = pendingConfirmations.get(userId);
    if (pending && isConfirmationMessage(trimmed)) {
      pendingConfirmations.delete(userId);
      const execution = executePlan(pending.plan, { confirmed: true });
      const enrichedResults = attachUiHints(pending.plan, execution);
      const reply = await makeReplyFromResults(pending.originalMessage, pending.plan, execution);
      return { success: true, reply, actions: pending.plan.actions || [], data: { results: enrichedResults, uiHints: enrichedResults.map((r) => r.uiHint) } };
    }

    let plan = buildDailyEntryPlanFromMessage(trimmed) || await planForMessage(trimmed);
    if (!plan.actions.length) {
      return { success: true, reply: plan.reply || 'I need a clearer database request.', actions: [], data: {} };
    }

    const visibilityProblem = validateBusinessPlanForVisibility(trimmed, plan);
    if (visibilityProblem) {
      const repairedPlan = buildDailyEntryPlanFromMessage(trimmed);
      if (repairedPlan) {
        console.warn('[AI DB Plan Repaired]', visibilityProblem, { originalActions: plan.actions, repairedActions: repairedPlan.actions });
        plan = repairedPlan;
      } else {
        console.warn('[AI DB Plan Blocked]', visibilityProblem, plan.actions);
        return { success: true, reply: visibilityProblem, actions: [], data: { blockedPlan: true } };
      }
    }

    // Validate before saving/executing so unsafe plans fail closed.
    plan.actions.forEach((action) => validateSql(action.sql || action, { readOnly: Boolean(plan.readOnly) }));

    if (needsConfirmation(plan) || plan.expectsConfirmation) {
      const confirmationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingConfirmations.set(userId, { confirmationId, originalMessage: trimmed, plan, createdAt: Date.now() });
      return {
        success: true,
        reply: plan.reply || 'This action needs confirmation. Reply yes to execute it.',
        actions: plan.actions,
        data: { confirmationRequired: true, confirmationId }
      };
    }

    const execution = executePlan(plan);
    const enrichedResults = attachUiHints(plan, execution);
    const reply = plan.deterministicRepair ? plan.reply : await makeReplyFromResults(trimmed, plan, execution);
    return { success: true, reply, actions: plan.actions, data: { results: enrichedResults, uiHints: enrichedResults.map((r) => r.uiHint) } };
  } catch (err) {
    const messageText = String(err.message || err);
    if (/fetch|Ollama|abort|ECONNREFUSED|ENOTFOUND|terminated|HTTP 404|HTTP 500/i.test(messageText)) {
      return { success: true, reply: AI_UNAVAILABLE_REPLY, actions: [], data: { error: 'ollama_unavailable' } };
    }
    console.error('[AI DB Agent Error]', err);
    return { success: false, reply: 'I could not safely complete that database request.', actions: [], data: { error: messageText } };
  }
}

module.exports = { handleChat, AI_UNAVAILABLE_REPLY, buildDailyEntryPlanFromMessage, buildCowWiseMilkPlanFromMessage };
