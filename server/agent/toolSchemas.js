const { z } = require('zod');

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

const toolSchemas = {
  getFarmDashboardData: z.object({}),
  getTodaySummary: z.object({}),
  getDateSummary: z.object({ date: z.string().optional() }),
  getMonthlySummary: z.object({ month: z.string().optional() }),
  getMilkProductionSummary: dateRangeSchema,
  getCowPerformance: dateRangeSchema.extend({ cowName: z.string().optional() }),
  getExpenseSummary: dateRangeSchema.extend({ category: z.string().optional() }),
  getProfitLoss: dateRangeSchema,
  getBuyerSummary: dateRangeSchema.extend({ buyerName: z.string().optional() }),
  searchRecords: z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional() }),
  getRecentEntries: z.object({ limit: z.number().int().positive().max(30).optional() }),
  analyzeMonthlyProfit: z.object({ month: z.string().optional() }),
  detectMilkDrop: z.object({ days: z.number().int().positive().max(60).optional(), thresholdPercent: z.number().positive().max(100).optional() }),
  detectHighExpenses: dateRangeSchema.extend({ topN: z.number().int().positive().max(20).optional() }),
  compareCowPerformance: dateRangeSchema,
  generateDailyReport: z.object({ date: z.string().optional() }),
  generateMonthlyReport: z.object({ month: z.string().optional() }),
  getCalvesList: z.object({ status: z.string().optional() }),
  getCalfDetails: z.object({ calfName: z.string().min(1) }),
  getCalfExpenses: dateRangeSchema.extend({ calfName: z.string().optional() }),
  getFoodItems: z.object({}),
  getExpenseCategories: z.object({}),
  getInvestmentsList: z.object({ status: z.string().optional() }),
  getBuyersList: z.object({ active: z.boolean().optional() }),
  getCowHistory: z.object({ cowName: z.string().min(1) }),
  prepareAddExpense: z.object({
    date: z.string().optional(),
    category: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().optional(),
    paymentMode: z.string().optional()
  }),
  prepareAddMilkEntry: z.object({
    date: z.string().optional(),
    cowName: z.string().min(1),
    morningLitres: z.number().min(0).optional(),
    eveningLitres: z.number().min(0).optional(),
    totalLitres: z.number().min(0).optional(),
    shift: z.string().optional(),
    notes: z.string().optional()
  }),
  prepareAddMilkSale: z.object({
    date: z.string().optional(),
    buyerName: z.string().min(1),
    litres: z.number().positive(),
    ratePerLitre: z.number().positive().optional(),
    shift: z.string().optional(),
    notes: z.string().optional()
  }),
  prepareAddCow: z.object({
    name: z.string().min(1),
    breed: z.string().optional(),
    age: z.string().optional(),
    status: z.string().optional(),
    purchaseDate: z.string().optional(),
    statusDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    notes: z.string().optional()
  }),
  prepareAddCalf: z.object({
    name: z.string().min(1),
    breed: z.string().optional(),
    birthDate: z.string().optional(),
    sourceType: z.string().optional(),
    expectedLactationDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    paidAmount: z.number().min(0).optional(),
    status: z.string().optional(),
    notes: z.string().optional()
  }),
  prepareAddCalfExpense: z.object({
    date: z.string().optional(),
    calfName: z.string().min(1),
    category: z.string().min(1),
    amount: z.number().positive(),
    expenseType: z.string().optional(),
    description: z.string().optional(),
    paymentMode: z.string().optional()
  }),
  prepareAddBuyer: z.object({
    name: z.string().min(1),
    location: z.string().optional(),
    defaultRate: z.number().min(0).optional(),
    contact: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean().optional()
  }),
  prepareAddFoodItem: z.object({
    name: z.string().min(1),
    purchaseKg: z.number().min(0).optional(),
    purchaseAmount: z.number().min(0).optional(),
    unitType: z.string().optional(),
    notes: z.string().optional()
  }),
  prepareAddExpenseCategory: z.object({
    name: z.string().min(1)
  }),
  prepareAddInvestment: z.object({
    title: z.string().min(1),
    investmentDate: z.string().min(1),
    investmentAmount: z.number().positive(),
    sourceType: z.string().optional(),
    sourceId: z.number().int().positive().optional(),
    notes: z.string().optional()
  }),
  prepareUpdateCow: z.object({
    cowName: z.string().min(1),
    name: z.string().optional(),
    breed: z.string().optional(),
    age: z.string().optional(),
    status: z.string().optional(),
    purchaseDate: z.string().optional(),
    statusDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    notes: z.string().optional()
  }),
  prepareDeleteCow: z.object({
    cowName: z.string().min(1)
  }),
  prepareDeleteCalf: z.object({
    calfName: z.string().min(1)
  }),
  prepareCalfTransfer: z.object({
    calfName: z.string().min(1)
  }),
  prepareDeleteBuyer: z.object({
    buyerName: z.string().min(1)
  }),
  prepareDeleteDailyEntry: z.object({
    date: z.string().min(1)
  }),
  prepareUpdateCalf: z.object({
    calfName: z.string().min(1),
    name: z.string().optional(),
    breed: z.string().optional(),
    birthDate: z.string().optional(),
    sourceType: z.string().optional(),
    expectedLactationDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    paidAmount: z.number().min(0).optional(),
    status: z.string().optional(),
    notes: z.string().optional()
  })
};

const toolDefinitions = [
  { name: 'getFarmDashboardData', description: 'Fetch current dashboard data, monthly summary, buyer split, cow summary, and recent trend.', parameters: {} },
  { name: 'getTodaySummary', description: 'Fetch today farm summary from saved daily entry data.', parameters: {} },
  { name: 'getDateSummary', description: 'Fetch farm summary, milk rows, sales, and expenses for one date.', parameters: { date: 'YYYY-MM-DD, optional' } },
  { name: 'getMonthlySummary', description: 'Fetch month summary with income, expenses, profit, milk, buyer-wise, expense-wise, and cow-wise data.', parameters: { month: 'YYYY-MM or YYYY-MM-DD, optional' } },
  { name: 'getMilkProductionSummary', description: 'Fetch milk production totals and daily trend for a date range.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' } },
  { name: 'getCowPerformance', description: 'Fetch cow-wise milk performance for a date range, optionally filtered by cow name.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', cowName: 'optional' } },
  { name: 'getExpenseSummary', description: 'Fetch expense totals and breakdown for a date range, optionally by category.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', category: 'optional' } },
  { name: 'getProfitLoss', description: 'Fetch income, expense, profit/loss, and daily profit trend for a date range.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' } },
  { name: 'getBuyerSummary', description: 'Fetch buyer-wise milk sales and income for a date range.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', buyerName: 'optional' } },
  { name: 'searchRecords', description: 'Search cow names, buyer names, expense descriptions, calf names, and investment titles.', parameters: { query: 'text', limit: 'optional number' } },
  { name: 'getRecentEntries', description: 'Fetch recent saved daily entries with details.', parameters: { limit: 'optional number' } },
  { name: 'analyzeMonthlyProfit', description: 'Fetch data needed to explain why a month profit is low or high.', parameters: { month: 'YYYY-MM or YYYY-MM-DD, optional' } },
  { name: 'detectMilkDrop', description: 'Detect cows whose recent milk production dropped compared with the previous period.', parameters: { days: 'optional number', thresholdPercent: 'optional number' } },
  { name: 'detectHighExpenses', description: 'Find biggest expenses and expense categories for a date range.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', topN: 'optional number' } },
  { name: 'compareCowPerformance', description: 'Compare cows by milk production in a date range.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' } },
  { name: 'generateDailyReport', description: 'Fetch all data needed to write a daily farm report.', parameters: { date: 'YYYY-MM-DD, optional' } },
  { name: 'generateMonthlyReport', description: 'Fetch all data needed to write a monthly farm report.', parameters: { month: 'YYYY-MM or YYYY-MM-DD, optional' } },
  { name: 'getCalvesList', description: 'Fetch list of all calves, optionally filtered by status.', parameters: { status: 'optional calf status like Growing or Transferred' } },
  { name: 'getCalfDetails', description: 'Fetch a single calf record with its expenses by name.', parameters: { calfName: 'existing calf name' } },
  { name: 'getCalfExpenses', description: 'Fetch calf expenses for a date range, optionally filtered by calf name.', parameters: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', calfName: 'optional' } },
  { name: 'getFoodItems', description: 'Fetch all food/feed items with their price history.', parameters: {} },
  { name: 'getExpenseCategories', description: 'Fetch all expense categories.', parameters: {} },
  { name: 'getInvestmentsList', description: 'Fetch all investments with recovery progress, optionally filtered by status.', parameters: { status: 'optional status like active or finished' } },
  { name: 'getBuyersList', description: 'Fetch all buyers, optionally filtered by active status.', parameters: { active: 'optional boolean' } },
  { name: 'getCowHistory', description: 'Fetch update/change history for a cow by name.', parameters: { cowName: 'existing cow name' } },
  { name: 'prepareAddExpense', description: 'Prepare a pending expense addition. Does not write until user confirms.', parameters: { date: 'YYYY-MM-DD', category: 'category name', amount: 'number', description: 'optional', paymentMode: 'optional' } },
  { name: 'prepareAddMilkEntry', description: 'Prepare a pending cow milk entry addition or update. Does not write until user confirms.', parameters: { date: 'YYYY-MM-DD', cowName: 'existing cow name', morningLitres: 'number', eveningLitres: 'number', totalLitres: 'number', shift: 'Morning or Evening optional', notes: 'optional' } },
  { name: 'prepareAddMilkSale', description: 'Prepare a pending milk sale addition. Does not write until user confirms.', parameters: { date: 'YYYY-MM-DD', buyerName: 'existing or new buyer name', litres: 'number', ratePerLitre: 'optional number', shift: 'Morning or Evening optional', notes: 'optional' } },
  { name: 'prepareAddCow', description: 'Prepare a pending cow creation. Does not write until user confirms.', parameters: { name: 'cow name', breed: 'optional', age: 'optional', status: 'optional', purchaseDate: 'optional', statusDate: 'optional', purchasePrice: 'optional number', notes: 'optional' } },
  { name: 'prepareAddCalf', description: 'Prepare a pending calf creation. Does not write until user confirms.', parameters: { name: 'calf name', breed: 'optional', birthDate: 'optional', sourceType: 'raised or purchased', expectedLactationDate: 'optional', purchasePrice: 'optional number', paidAmount: 'optional number', status: 'optional', notes: 'optional' } },
  { name: 'prepareAddCalfExpense', description: 'Prepare a pending calf expense addition. Does not write until user confirms.', parameters: { date: 'YYYY-MM-DD', calfName: 'existing calf name', category: 'category name', amount: 'number', expenseType: 'optional', description: 'optional', paymentMode: 'optional' } },
  { name: 'prepareAddBuyer', description: 'Prepare a pending buyer creation. Does not write until user confirms.', parameters: { name: 'buyer name', location: 'optional', defaultRate: 'optional number', contact: 'optional', notes: 'optional', active: 'optional boolean' } },
  { name: 'prepareAddFoodItem', description: 'Prepare a pending food/feed item creation. Does not write until user confirms.', parameters: { name: 'food name', purchaseKg: 'optional number', purchaseAmount: 'optional number', unitType: 'kg or other unit', notes: 'optional' } },
  { name: 'prepareAddExpenseCategory', description: 'Prepare a pending expense category creation. Does not write until user confirms.', parameters: { name: 'category name' } },
  { name: 'prepareAddInvestment', description: 'Prepare a pending investment addition. Does not write until user confirms.', parameters: { title: 'investment title', investmentDate: 'YYYY-MM-DD', investmentAmount: 'number', sourceType: 'optional manual/cow/calf', sourceId: 'optional number', notes: 'optional' } },
  { name: 'prepareUpdateCow', description: 'Prepare a pending cow update. Does not write until user confirms.', parameters: { cowName: 'existing cow name', name: 'optional new name', breed: 'optional', age: 'optional', status: 'optional', purchaseDate: 'optional', statusDate: 'optional', purchasePrice: 'optional number', notes: 'optional' } },
  { name: 'prepareDeleteCow', description: 'Prepare to delete a cow. Checks if cow is used in entries first. Does not delete until user confirms.', parameters: { cowName: 'existing cow name to delete' } },
  { name: 'prepareDeleteCalf', description: 'Prepare to delete a calf. Checks if calf was transferred first. Does not delete until user confirms.', parameters: { calfName: 'existing calf name to delete' } },
  { name: 'prepareCalfTransfer', description: 'Prepare to transfer a calf to a cow record. Does not transfer until user confirms.', parameters: { calfName: 'existing calf name to transfer' } },
  { name: 'prepareDeleteBuyer', description: 'Prepare to delete a buyer. Checks if buyer is used in milk sales first. Does not delete until user confirms.', parameters: { buyerName: 'existing buyer name to delete' } },
  { name: 'prepareDeleteDailyEntry', description: 'Prepare to delete a daily entry by date. Does not delete until user confirms.', parameters: { date: 'YYYY-MM-DD date of entry to delete' } },
  { name: 'prepareUpdateCalf', description: 'Prepare a pending calf update. Does not write until user confirms.', parameters: { calfName: 'existing calf name', name: 'optional new name', breed: 'optional', birthDate: 'optional', sourceType: 'optional', expectedLactationDate: 'optional', purchasePrice: 'optional number', paidAmount: 'optional number', status: 'optional', notes: 'optional' } }
];

function validateToolArguments(toolName, args) {
  const schema = toolSchemas[toolName];
  if (!schema) throw new Error(`Unknown tool: ${toolName}`);
  return schema.parse(args || {});
}

module.exports = {
  toolDefinitions,
  toolSchemas,
  validateToolArguments
};
