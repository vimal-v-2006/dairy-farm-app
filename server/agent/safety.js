const dayjs = require('dayjs');

const FALLBACK_MESSAGE = 'AI model is not ready yet. Please check Ollama download or model availability.';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function today() {
  return dayjs().format('YYYY-MM-DD');
}

function normalizeDate(value) {
  if (!value) return today();
  const parsed = dayjs(String(value));
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : today();
}

function monthRange(dateValue = today()) {
  const base = dayjs(normalizeDate(dateValue));
  return {
    startDate: base.startOf('month').format('YYYY-MM-DD'),
    endDate: base.endOf('month').format('YYYY-MM-DD')
  };
}

function formatMoney(value) {
  return `₹${toNumber(value).toFixed(2)}`;
}

function compactRows(rows = [], limit = 80) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit);
}

module.exports = {
  FALLBACK_MESSAGE,
  compactRows,
  formatMoney,
  monthRange,
  normalizeDate,
  toNumber,
  today
};
