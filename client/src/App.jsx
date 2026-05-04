import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Baby, CalendarDays, CheckCircle2, CircleDollarSign, Droplets, LayoutDashboard, LogOut, Menu, Milk, NotebookPen, Pencil, Plus, Printer, Settings2, Sparkles, SunMoon, Trash2, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { api, storage } from './api/client';
import { useAuth } from './context/AuthContext';
import { currency, exportStyledPdf, exportBusinessRegisterExcel, exportDetailedDailyPdf, litres, today, exportSingleCowPdf, exportAllCowsPdf } from './lib/utils';

const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['daily', 'Daily Entry', NotebookPen],
  ['calves', 'Calves', Baby],
  ['cows', 'Cows', Milk],
  ['buyers', 'Buyers', Users],
  ['settings', 'Expense categories', Settings2],
  ['reports', 'Reports', TrendingUp],
  ['investments', 'Capital / Assets', Wallet]
];

const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];
const paymentStatusOptions = ['Paid', 'Pending', 'Partial'];
const paymentModeOptions = ['Cash', 'GPay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Other Online', 'Other', 'Nothing'];
const shiftOptions = ['Morning', 'Evening'];
const remainingMilkOptions = ['Home Use', 'Spoiled', 'Carried Forward', 'Mixed / Other'];
const cowStatusOptions = ['Lactating', 'Dry', 'Calf', 'Sold', 'Deceased'];
const calfStatusOptions = ['Growing', 'Ready for lactation', 'Transferred'];
const calfSourceOptions = ['Raised', 'Purchased young'];
const reportSections = [
  { id: 'report-filters', label: 'Report filters', icon: TrendingUp },
  { id: 'summary-reports', label: 'Summary reports', icon: CalendarDays },
  { id: 'export-reports', label: 'Export reports', icon: NotebookPen },
  { id: 'raw-reports', label: 'Saved daily data', icon: CalendarDays },
  { id: 'daily-business-register', label: 'Business register', icon: NotebookPen }
];

function AuthScreen() {
  const { hasUser, login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.username, form.password, !hasUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_26%)] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <motion.form initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="glass w-full max-w-md rounded-[2rem] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.15)]">
          <div className="mb-8">
            <div className="inline-flex rounded-3xl bg-emerald-500/15 p-4 text-emerald-500"><Milk size={28} /></div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">Milk Business Manager</h1>
            <p className="mt-2 text-sm opacity-70">{hasUser ? 'Secure login required every time you open the app' : 'Create your first and only account to start using the app'}</p>
          </div>
          <div className="space-y-4">
            <FieldInput placeholder="Login ID" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
            <FieldInput type="password" placeholder="Password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            <button disabled={busy} className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-500/25 disabled:opacity-60">{busy ? 'Please wait...' : hasUser ? 'Login' : 'Create Account'}</button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}

function App() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [dark, setDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [state, setState] = useState({ dashboard: null, cows: [], calves: [], investments: [], buyers: [], categories: [], foods: [], dailyEntries: [], dailyData: [] });
  const [message, setMessage] = useState('');
  const [cowEditingId, setCowEditingId] = useState(null);
  const [cowForm, setCowForm] = useState({ name: '', breed: '', age: '', status: 'Lactating', status_date: today(), notes: '' });
  const [calfEditingId, setCalfEditingId] = useState(null);
  const [calfForm, setCalfForm] = useState({ name: '', breed: '', birth_date: today(), source_type: 'Raised', expected_lactation_date: '', purchase_price: '', paid_amount: '', status: 'Growing', notes: '' });
  const [calfExpenseForm, setCalfExpenseForm] = useState({ calf_id: '', expense_date: today(), expense_type: 'common', category_id: '', food_item_id: '', food_price_history_id: null, food_name_snapshot: '', unit_type_snapshot: '', rate_effective_from: null, quantity_kg: '', unit_rate: '', amount: '', entry_shift: 'Morning', description: '', payment_mode: 'Cash' });
  const [buyerEditingId, setBuyerEditingId] = useState(null);
  const [buyerForm, setBuyerForm] = useState({ name: '', location: '', default_rate: '', contact: '', notes: '', active: true });
  const [categoryName, setCategoryName] = useState('');
  const [foodEditingId, setFoodEditingId] = useState(null);
  const [expandedFoodHistoryId, setExpandedFoodHistoryId] = useState(null);
  const [foodForm, setFoodForm] = useState({ name: '', purchase_kg: '', purchase_amount: '', unit_type: 'kg', notes: '' });
  const [investmentEditingId, setInvestmentEditingId] = useState(null);
  const [investmentForm, setInvestmentForm] = useState(createEmptyInvestmentForm());
  const [reportRange, setReportRange] = useState({ start: '', end: '' });
  const [reportPreset, setReportPreset] = useState('all');
  const [reportMeta, setReportMeta] = useState({ label: 'All data', start: '', end: '' });
  const [reports, setReports] = useState(null);
  const [dailyForm, setDailyForm] = useState(createEmptyDailyForm());
  const [dailyLoading, setDailyLoading] = useState(false);
  const [loadedEntryId, setLoadedEntryId] = useState(null);
  const [registerFullscreen, setRegisterFullscreen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedCowRecordId, setSelectedCowRecordId] = useState(null);
  const [selectedCalfRecordId, setSelectedCalfRecordId] = useState(null);
  const [cowHistory, setCowHistory] = useState([]);
  const [cowHistoryLoading, setCowHistoryLoading] = useState(false);

  async function loadCowHistory(cowId) {
    if (!cowId) {
      setCowHistory([]);
      return;
    }
    setCowHistoryLoading(true);
    try {
      const data = await api(`/api/cows/${cowId}/history`);
      setCowHistory(data.history || []);
    } catch {
      setCowHistory([]);
    } finally {
      setCowHistoryLoading(false);
    }
  }

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => { if (user) refresh(today(), true); }, [user]);
  useEffect(() => { setMobileNavOpen(false); }, [tab]);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 260);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function refresh(targetDate = dailyForm.entry_date || today(), silentLoad = true) {
    const data = await api('/api/bootstrap');
    let dailyDataEntries = [];
    try {
      const dailyData = await api('/api/daily-entries');
      dailyDataEntries = dailyData.entries || [];
    } catch {
      dailyDataEntries = [];
    }
    const calvesData = await api('/api/calves').catch(() => ({ calves: [] }));
    setState({ dashboard: data.dashboard, cows: data.cows || [], calves: calvesData.calves || [], investments: data.investments || [], buyers: data.buyers, categories: data.categories, foods: data.foods || [], dailyEntries: data.dailyEntries, dailyData: dailyDataEntries });
    await loadDailyEntry(targetDate, { cows: data.cows || [], buyers: data.buyers, categories: data.categories, foods: data.foods || [], silent: silentLoad });
  }

  function notify(text) {
    setMessage(text);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setMessage(''), 2500);
  }

  const dashboard = state.dashboard;
  const trend = dashboard?.charts?.trend || [];
  const latestTrendProfit = Number(trend[trend.length - 1]?.profit || 0);
  const topBuyer = dashboard?.charts?.buyerSplit?.[0] || null;
  const currentSavedItem = state.dailyData.find((item) => item.entry.entry_date === dailyForm.entry_date) || null;
  const activeCows = useMemo(() => state.cows.filter((cow) => !cow.status || cow.status === 'Lactating' || cow.status === 'Active'), [state.cows]);
  const feedEligibleCows = useMemo(() => state.cows.filter((cow) => cow.status !== 'Sold' && cow.status !== 'Deceased'), [state.cows]);
  const dailyCowTotal = useMemo(() => dailyForm.cowEntries.reduce((sum, item) => sum + Number(item.total_litres || 0), 0), [dailyForm.cowEntries]);
  const cowRecordSummaries = useMemo(() => buildCowRecordSummaries(state.cows, state.dailyData), [state.cows, state.dailyData]);
  const calfSummaries = useMemo(() => buildCalfSummaries(state.calves), [state.calves]);
  const selectedCalfRecord = useMemo(() => {
    if (!calfSummaries.length) return null;
    return calfSummaries.find((calf) => String(calf.id) === String(selectedCalfRecordId)) || calfSummaries[0];
  }, [calfSummaries, selectedCalfRecordId]);
  const selectedCowRecord = useMemo(() => {
    if (!cowRecordSummaries.length) return null;
    return cowRecordSummaries.find((cow) => String(cow.id) === String(selectedCowRecordId)) || cowRecordSummaries[0];
  }, [cowRecordSummaries, selectedCowRecordId]);
  const investmentSummaries = useMemo(() => buildInvestmentSummaries(state.investments, state.cows, calfSummaries), [state.investments, state.cows, calfSummaries]);
  const activeInvestments = useMemo(() => investmentSummaries.filter((item) => item.status !== 'finished'), [investmentSummaries]);
  const finishedInvestments = useMemo(() => investmentSummaries.filter((item) => item.status === 'finished'), [investmentSummaries]);
  const exportMeta = getExportMeta(reportPreset, reportMeta);
  const filteredDailyData = useMemo(() => filterDailyDataByRange(state.dailyData, reportMeta.start, reportMeta.end), [state.dailyData, reportMeta.start, reportMeta.end]);
  const reportRegisterRows = useMemo(() => buildRegisterRows(filteredDailyData), [filteredDailyData]);
  const reportRegisterTable = useMemo(() => buildPlainRegisterTable(filteredDailyData), [filteredDailyData]);
  const reportInsights = useMemo(() => buildReportInsights(reports), [reports]);

  const smartInsights = useMemo(() => {
    const pendingSales = state.dailyData.flatMap((item) => item.milkSales || []).filter((sale) => sale.payment_status && sale.payment_status !== 'Paid');
    const pendingAmount = pendingSales.reduce((sum, sale) => sum + Number(sale.income || 0), 0);
    const bestDay = trend.reduce((best, day) => (!best || Number(day.profit || 0) > Number(best.profit || 0) ? day : best), null);
    const weakDay = trend.reduce((worst, day) => (!worst || Number(day.profit || 0) < Number(worst.profit || 0) ? day : worst), null);
    return {
      pendingSalesCount: pendingSales.length,
      pendingAmount,
      bestDay,
      weakDay,
      topBuyerName: topBuyer?.name || 'No buyer yet',
      topBuyerMilk: topBuyer?.value || 0
    };
  }, [state.dailyData, topBuyer, trend]);

  const dailyMetrics = useMemo(() => {
    const produced = dailyForm.entry_mode === 'cows' ? dailyCowTotal : Number(dailyForm.total_milk_litres || 0);
    const sold = dailyForm.milkSales.reduce((sum, item) => sum + Number(item.litres || 0), 0);
    const income = dailyForm.milkSales.reduce((sum, item) => sum + Number(item.litres || 0) * Number(item.rate_per_litre || 0), 0);
    const expenses = dailyForm.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      produced,
      sold,
      remaining: produced - sold,
      income,
      expenses,
      profit: income - expenses
    };
  }, [dailyForm, dailyCowTotal]);

  const dailyHealth = useMemo(() => {
    const pendingAmount = dailyForm.milkSales
      .filter((item) => item.payment_status && item.payment_status !== 'Paid')
      .reduce((sum, item) => sum + Number(item.litres || 0) * Number(item.rate_per_litre || 0), 0);
    return {
      saleRows: dailyForm.milkSales.length,
      expenseRows: dailyForm.expenses.length,
      pendingAmount,
      oversold: dailyMetrics.remaining < 0,
      salesCoverage: dailyMetrics.produced > 0 ? Math.min((dailyMetrics.sold / dailyMetrics.produced) * 100, 100) : 0
    };
  }, [dailyForm, dailyMetrics]);

  useEffect(() => {
    if (!cowRecordSummaries.length) {
      setSelectedCowRecordId(null);
      return;
    }
    if (!cowRecordSummaries.some((cow) => String(cow.id) === String(selectedCowRecordId))) {
      setSelectedCowRecordId(cowRecordSummaries[0].id);
      loadCowHistory(cowRecordSummaries[0].id);
    }
  }, [cowRecordSummaries, selectedCowRecordId]);

  useEffect(() => {
    if (selectedCowRecordId) loadCowHistory(selectedCowRecordId);
  }, [selectedCowRecordId]);

  useEffect(() => {
    if (!calfSummaries.length) return;
    setCalfExpenseForm((prev) => {
      if (prev.calf_id && calfSummaries.some((calf) => String(calf.id) === String(prev.calf_id))) return prev;
      return { ...prev, calf_id: calfSummaries[0]?.id || '' };
    });
  }, [calfSummaries]);

  useEffect(() => {
    if (!calfSummaries.length) {
      setSelectedCalfRecordId(null);
      return;
    }
    if (!calfSummaries.some((calf) => String(calf.id) === String(selectedCalfRecordId))) {
      setSelectedCalfRecordId(calfSummaries[0].id);
    }
  }, [calfSummaries, selectedCalfRecordId]);

  useEffect(() => {
    if (calfExpenseForm.expense_type !== 'feed' || !calfExpenseForm.food_item_id) return;
    const foodSnapshot = resolveFoodSnapshot(state.foods, calfExpenseForm.food_item_id, calfExpenseForm.expense_date);
    if (!foodSnapshot) return;
    setCalfExpenseForm((prev) => {
      if (prev.expense_type !== 'feed' || String(prev.food_item_id) !== String(calfExpenseForm.food_item_id)) return prev;
      const quantity = Number(prev.quantity_kg || 0);
      const amount = quantity && Number(foodSnapshot.unit_rate || 0)
        ? Number((quantity * Number(foodSnapshot.unit_rate || 0)).toFixed(2))
        : '';
      return {
        ...prev,
        ...foodSnapshot,
        amount
      };
    });
  }, [calfExpenseForm.expense_date, calfExpenseForm.expense_type, calfExpenseForm.food_item_id, state.foods]);

  async function loadDailyEntry(entryDate, options = {}) {
    const cows = options.cows || state.cows;
    const buyers = options.buyers || state.buyers;
    const categories = options.categories || state.categories;
    const foods = options.foods || state.foods;
    const silent = options.silent || false;
    setDailyLoading(true);
    try {
      const data = await api(`/api/daily-entries/${entryDate}`);
      if (!data.entry) {
        setLoadedEntryId(null);
        setDailyForm(hydrateDailyForm({ ...createEmptyDailyForm(), entry_date: entryDate }, cows, buyers, categories, foods));
        if (!silent) notify('No saved entry for that date — ready for new data');
        return;
      }

      const parsedNotes = parseStoredNotes(data.entry.notes);
      setLoadedEntryId(data.entry.id);
      setDailyForm(hydrateDailyForm({
        entry_date: data.entry.entry_date,
        entry_mode: data.cowEntries?.length ? 'cows' : 'direct',
        total_milk_litres: data.entry.total_milk_litres || '',
        notes: parsedNotes.generalNotes,
        remaining_milk_usage: parsedNotes.remainingUsage || 'Home Use',
        remaining_milk_notes: parsedNotes.remainingNotes,
        cowEntries: (data.cowEntries || []).map((entry) => ({
          cow_id: entry.cow_id || '',
          total_litres: entry.total_litres || '',
          entry_shift: entry.entry_shift || (Number(entry.evening_litres || 0) > 0 ? 'Evening' : 'Morning'),
          status: entry.status || 'Recorded',
          notes: entry.notes || ''
        })),
        milkSales: data.milkSales.map((sale) => ({
          buyer_id: sale.buyer_id || '',
          litres: sale.litres || '',
          rate_per_litre: sale.rate_per_litre || '',
          payment_status: sale.payment_status || 'Paid',
          payment_mode: sale.payment_mode || 'Cash',
          notes: sale.notes || ''
        })),
        expenses: mergeExpenseRows(data.expenses.map((expense) => ({
          expense_type: expense.expense_type || 'common',
          category_id: expense.category_id || '',
          cow_id: expense.cow_id || '',
          food_item_id: expense.food_item_id || '',
          food_price_history_id: expense.food_price_history_id || null,
          food_name_snapshot: expense.food_name || '',
          unit_type_snapshot: expense.unit_type || '',
          rate_effective_from: expense.rate_effective_from || null,
          quantity_kg: expense.quantity_kg ?? '',
          unit_rate: expense.unit_rate ?? '',
          amount: expense.amount ?? '',
          entry_shift: expense.entry_shift || 'Morning',
          description: expense.description || '',
          payment_mode: expense.payment_mode || 'Cash'
        })))
      }, cows, buyers, categories, foods));
      if (!silent) notify('Saved entry loaded');
    } finally {
      setDailyLoading(false);
    }
  }

  async function deleteDailyEntry(entryId) {
    const item = state.dailyData.find((entry) => entry.entry.id === entryId);
    if (!item) return;
    const shouldDelete = window.confirm(`Delete data for ${item.entry.entry_date}? This cannot be undone.`);
    if (!shouldDelete) return;
    await api(`/api/daily-entries/${entryId}`, { method: 'DELETE' });
    if (loadedEntryId === entryId) {
      setLoadedEntryId(null);
      setDailyForm(hydrateDailyForm({ ...createEmptyDailyForm(), entry_date: today() }, state.cows, state.buyers, state.categories, state.foods));
    }
    notify('Daily entry deleted');
    await refresh(today(), true);
  }

  async function saveDaily() {
    try {
      const blockedFeedExpenses = dailyForm.expenses.filter((row) => {
        if ((row.expense_type || 'common') !== 'feed' || !row.cow_id) return false;
        const cow = state.cows.find((c) => String(c.id) === String(row.cow_id));
        return cow && (cow.status === 'Sold' || cow.status === 'Deceased');
      });
      if (blockedFeedExpenses.length > 0) {
        const cowNames = blockedFeedExpenses.map((row) => {
          const cow = state.cows.find((c) => String(c.id) === String(row.cow_id));
          return cow ? `"${cow.name} (${cow.status})"` : row.cow_id;
        });
        notify(`Cannot add food expense for ${cowNames.join(', ')} — cow is ${blockedFeedExpenses[0].cow_id ? state.cows.find((c) => String(c.id) === String(blockedFeedExpenses[0].cow_id))?.status?.toLowerCase() : 'unavailable'}`);
        return;
      }
      const payload = {
        ...dailyForm,
        total_milk_litres: Number(dailyForm.entry_mode === 'cows' ? dailyCowTotal : (dailyForm.total_milk_litres || 0)),
        cowEntries: dailyForm.entry_mode === 'cows'
          ? dailyForm.cowEntries.filter((row) => row.cow_id && row.total_litres).map((row) => ({
              ...row,
              total_litres: Number(row.total_litres || 0)
            }))
          : [],
        milkSales: dailyForm.milkSales.filter((row) => row.buyer_id && row.litres).map((row) => ({ ...row, litres: Number(row.litres || 0), rate_per_litre: Number(row.rate_per_litre || 0) })),
        expenses: mergeExpenseRows(dailyForm.expenses
          .filter((row) => {
            if ((row.expense_type || 'common') === 'feed') {
              return row.cow_id && row.food_item_id && Number(row.quantity_kg || 0) > 0 && row.amount !== '' && row.amount !== null && row.amount !== undefined;
            }
            return row.category_id && row.amount !== '' && row.amount !== null && row.amount !== undefined;
          })
          .map((row) => ({
            ...row,
            quantity_kg: Number(row.quantity_kg || 0),
            unit_rate: Number(row.unit_rate || 0),
            amount: Number(row.amount || 0)
          }))),
        remaining_milk_usage: [dailyForm.remaining_milk_usage, dailyForm.remaining_milk_notes].filter(Boolean).join(' - ')
      };
      await api('/api/daily-entries', { method: 'POST', body: JSON.stringify(payload) });
      await refresh(dailyForm.entry_date, true);
      notify('Daily entry saved');
    } catch (error) {
      notify(error.message || 'Could not save daily entry');
    }
  }

  async function saveBuyer() {
    try {
      const payload = { ...buyerForm, default_rate: Number(buyerForm.default_rate || 0) };
      if (buyerEditingId) {
        await api(`/api/buyers/${buyerEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Buyer updated');
      } else {
        await api('/api/buyers', { method: 'POST', body: JSON.stringify(payload) });
        notify('Buyer added');
      }
      resetBuyerForm();
      await refresh();
    } catch (error) {
      notify(error.message || 'Could not save buyer');
    }
  }

  async function deleteBuyer(buyer) {
    const shouldDelete = window.confirm(`Delete buyer "${buyer.name}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/buyers/${buyer.id}`, { method: 'DELETE' });
      if (buyerEditingId === buyer.id) resetBuyerForm();
      notify('Buyer deleted');
      await refresh();
    } catch (error) {
      notify(error.message || 'Could not delete buyer');
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm('Delete account and all data? This cannot be undone.');
    if (!confirmed) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      storage.clear();
      logout();
      window.location.reload();
    } catch (error) {
      notify(error.message || 'Could not delete account');
    }
  }

  async function saveCategory() {
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name: categoryName }) });
      setCategoryName('');
      notify('Category added');
      await refresh();
    } catch (error) {
      notify(error.message || 'Could not add category');
    }
  }

  async function saveFood() {
    try {
      await api(foodEditingId ? `/api/foods/${foodEditingId}` : '/api/foods', {
        method: foodEditingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...foodForm,
          purchase_kg: Number(foodForm.purchase_kg || 0),
          purchase_amount: Number(foodForm.purchase_amount || 0)
        })
      });
      setFoodEditingId(null);
      setFoodForm({ name: '', purchase_kg: '', purchase_amount: '', unit_type: 'kg', notes: '' });
      notify(foodEditingId ? 'Feed item updated' : 'Feed item added');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || `Could not ${foodEditingId ? 'update' : 'add'} feed item`);
    }
  }

  function editFood(food) {
    setFoodEditingId(food.id);
    setFoodForm({
      name: food.name || '',
      purchase_kg: food.purchase_kg || '',
      purchase_amount: food.purchase_amount || '',
      unit_type: food.unit_type || 'kg',
      notes: food.notes || ''
    });
  }

  function resetFoodForm() {
    setFoodEditingId(null);
    setFoodForm({ name: '', purchase_kg: '', purchase_amount: '', unit_type: 'kg', notes: '' });
  }

  async function deleteCategory(category) {
    const shouldDelete = window.confirm(`Delete expense category "${category.name}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/categories/${category.id}`, { method: 'DELETE' });
      notify('Expense category deleted');
      await refresh();
    } catch (error) {
      notify(error.message || 'Could not delete expense category');
    }
  }

  async function deleteFood(food) {
    const shouldDelete = window.confirm(`Delete food item "${food.name}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/foods/${food.id}`, { method: 'DELETE' });
      if (foodEditingId === food.id) resetFoodForm();
      notify('Food item deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete food item');
    }
  }

  async function deleteFoodHistoryEntry(food, historyEntry) {
    const shouldDelete = window.confirm(`Delete history entry for "${food.name}" from ${new Date(historyEntry.effective_from).toLocaleString()}?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/food-history/${historyEntry.id}`, { method: 'DELETE' });
      notify('Food history entry deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete food history entry');
    }
  }

  async function saveCow() {
    try {
      if (cowEditingId) {
        await api(`/api/cows/${cowEditingId}`, { method: 'PUT', body: JSON.stringify(cowForm) });
        notify('Cow updated');
      } else {
        await api('/api/cows', { method: 'POST', body: JSON.stringify(cowForm) });
        notify('Cow added');
      }
      resetCowForm();
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not save cow');
    }
  }

  async function saveCalf() {
    try {
      const payload = {
        ...calfForm,
        purchase_price: Number(calfForm.purchase_price || 0),
        paid_amount: Number(calfForm.paid_amount || 0)
      };
      if (calfEditingId) {
        await api(`/api/calves/${calfEditingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        notify('Calf updated');
      } else {
        await api('/api/calves', { method: 'POST', body: JSON.stringify(payload) });
        notify('Calf added');
      }
      resetCalfForm();
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not save calf');
    }
  }

  async function saveCalfExpense() {
    try {
      if (!calfExpenseForm.calf_id) {
        notify('Please select a calf first');
        return;
      }

      if (calfExpenseForm.expense_type === 'feed') {
        if (!calfExpenseForm.food_item_id || !Number(calfExpenseForm.quantity_kg || 0) || calfExpenseForm.amount === '' || calfExpenseForm.amount === null || calfExpenseForm.amount === undefined) {
          notify('Please choose food and enter quantity for this calf expense');
          return;
        }
      } else if (!calfExpenseForm.category_id || calfExpenseForm.amount === '' || calfExpenseForm.amount === null || calfExpenseForm.amount === undefined) {
        notify('Please choose a common category and enter amount');
        return;
      }

      const payload = {
        ...calfExpenseForm,
        quantity_kg: Number(calfExpenseForm.quantity_kg || 0),
        unit_rate: Number(calfExpenseForm.unit_rate || 0),
        amount: Number(calfExpenseForm.amount || 0)
      };
      await api(`/api/calves/${calfExpenseForm.calf_id}/expenses`, { method: 'POST', body: JSON.stringify(payload) });
      resetCalfExpenseForm();
      notify('Calf expense added');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not save calf expense');
    }
  }

  async function transferCalf(calf) {
    const confirmed = window.confirm(`Transfer calf "${calf.name}" into Cows when it starts lactating?`);
    if (!confirmed) return;
    try {
      await api(`/api/calves/${calf.id}/transfer`, { method: 'POST' });
      notify('Calf transferred to cows');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not transfer calf');
    }
  }

  async function deleteCalfExpense(expenseId) {
    try {
      await api(`/api/calf-expenses/${expenseId}`, { method: 'DELETE' });
      notify('Calf expense deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete calf expense');
    }
  }

  function exportCalfRecordPdf(calf) {
    exportStyledPdf({
      fileName: `${calf.name}-calf-rearing-record`,
      title: `${calf.name} calf rearing record`,
      subtitle: `Separate calf section record • ${calf.status} • ${calf.sourceLabel}`,
      summaryRows: [
        { metric: 'Calf name', value: calf.name },
        { metric: 'Breed', value: calf.breed || '—' },
        { metric: 'Birth / start date', value: calf.birth_date || '—' },
        { metric: 'Expected lactation date', value: calf.expected_lactation_date || '—' },
        { metric: 'Base price', value: currency(calf.purchase_price || 0) },
        { metric: 'Paid before transfer', value: currency(calf.paid_amount || 0) },
        { metric: 'Previous rearing expense', value: currency(calf.totalExpense || 0) },
        { metric: 'Food budget', value: currency(calf.foodExpense || 0) },
        { metric: 'Other expense', value: currency(calf.otherExpense || 0) },
        { metric: 'Transferred', value: calf.transferred_to_cow_id ? `Yes • ${calf.transferred_at || ''}` : 'No' }
      ],
      expenseRows: calf.expenses.map((expense) => ({
        date: expense.expense_date,
        type: expense.expense_type === 'feed' ? 'Food' : 'Common',
        expense: expense.food_name || expense.category_name || '—',
        quantity_kg: expense.quantity_kg ? `${Number(expense.quantity_kg).toFixed(2)} ${expense.unit_type === 'liter' ? 'L' : 'kg'}` : '—',
        shifts: expense.expense_type === 'feed' ? (expense.entry_shift || 'Morning') : '—',
        amount: currency(expense.amount || 0),
        description: expense.description || '—',
        payment_mode: expense.expense_type === 'feed' ? '—' : (expense.payment_mode || 'Cash')
      }))
    });
  }

  function exportAllCalfRecordsPdf() {
    exportStyledPdf({
      fileName: 'all-calf-rearing-records',
      title: 'Calf rearing records',
      subtitle: 'Complete separate calf rearing section export',
      summaryRows: [
        { metric: 'Total calves', value: calfSummaries.length },
        { metric: 'Transferred calves', value: calfSummaries.filter((calf) => calf.transferred_to_cow_id).length },
        { metric: 'Growing calves', value: calfSummaries.filter((calf) => !calf.transferred_to_cow_id).length },
        { metric: 'Total calf rearing expense', value: currency(calfSummaries.reduce((sum, calf) => sum + Number(calf.totalExpense || 0), 0)) }
      ],
      dailyRows: calfSummaries.map((calf) => ({
        calf_name: calf.name,
        breed: calf.breed || '—',
        status: calf.status,
        source: calf.sourceLabel,
        birth_start_date: calf.birth_date || '—',
        expected_lactation_date: calf.expected_lactation_date || '—',
        base_price: currency(calf.purchase_price || 0),
        paid_before_transfer: currency(calf.paid_amount || 0),
        previous_rearing_expense: currency(calf.totalExpense || 0),
        food_budget: currency(calf.foodExpense || 0),
        other_expense: currency(calf.otherExpense || 0),
        transferred: calf.transferred_to_cow_id ? `Yes • ${calf.transferred_at || ''}` : 'No'
      })),
      expenseRows: calfSummaries.flatMap((calf) => calf.expenses.map((expense) => ({
        calf_name: calf.name,
        date: expense.expense_date,
        type: expense.expense_type === 'feed' ? 'Food' : 'Common',
        expense: expense.food_name || expense.category_name || '—',
        quantity_kg: expense.quantity_kg ? `${Number(expense.quantity_kg).toFixed(2)} ${expense.unit_type === 'liter' ? 'L' : 'kg'}` : '—',
        shifts: expense.expense_type === 'feed' ? (expense.entry_shift || 'Morning') : '—',
        amount: currency(expense.amount || 0),
        description: expense.description || '—',
        payment_mode: expense.expense_type === 'feed' ? '—' : (expense.payment_mode || 'Cash')
      })))
    });
  }

  async function deleteCow(cow) {
    const shouldDelete = window.confirm(`Delete cow "${cow.name}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/cows/${cow.id}`, { method: 'DELETE' });
      if (cowEditingId === cow.id) resetCowForm();
      notify('Cow deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete cow');
    }
  }

  async function deleteCalf(calf) {
    const shouldDelete = window.confirm(`Delete calf "${calf.name}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/calves/${calf.id}`, { method: 'DELETE' });
      if (calfEditingId === calf.id) resetCalfForm();
      notify('Calf deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete calf');
    }
  }

  async function saveInvestment() {
    try {
      const payload = {
        ...investmentForm,
        investment_amount: Number(investmentForm.investment_amount || 0)
      };
      if (!payload.title || !payload.investment_date || !payload.investment_amount) {
        notify('Please add title, date, and amount for the investment');
        return;
      }

      await api(investmentEditingId ? `/api/investments/${investmentEditingId}` : '/api/investments', {
        method: investmentEditingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      notify(investmentEditingId ? 'Investment updated' : 'Investment added');
      resetInvestmentForm();
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not save investment');
    }
  }

  function editInvestment(investment) {
    setInvestmentEditingId(investment.id);
    setInvestmentForm({
      source_type: investment.source_type || 'manual',
      source_id: investment.source_id || '',
      title: investment.title || '',
      investment_date: investment.investment_date || today(),
      investment_amount: investment.investment_amount || '',
      notes: investment.notes || ''
    });
    setTab('investments');
  }

  function resetInvestmentForm() {
    setInvestmentEditingId(null);
    setInvestmentForm(createEmptyInvestmentForm());
  }

  async function deleteInvestment(investment) {
    const shouldDelete = window.confirm(`Delete investment "${investment.title}"?`);
    if (!shouldDelete) return;
    try {
      await api(`/api/investments/${investment.id}`, { method: 'DELETE' });
      if (investmentEditingId === investment.id) resetInvestmentForm();
      notify('Investment deleted');
      await refresh(dailyForm.entry_date, true);
    } catch (error) {
      notify(error.message || 'Could not delete investment');
    }
  }

  function applyInvestmentSource(sourceType, sourceId) {
    if (sourceType === 'cow') {
      const cow = state.cows.find((item) => String(item.id) === String(sourceId));
      if (!cow) return;
      setInvestmentForm((prev) => ({
        ...prev,
        source_type: 'cow',
        source_id: cow.id,
        title: cow.name || '',
        investment_date: cow.purchase_date || cow.status_date || today(),
        investment_amount: cow.purchase_price || prev.investment_amount || '',
        notes: cow.notes || ''
      }));
      return;
    }

    if (sourceType === 'calf') {
      const calf = calfSummaries.find((item) => String(item.id) === String(sourceId));
      if (!calf) return;
      setInvestmentForm((prev) => ({
        ...prev,
        source_type: 'calf',
        source_id: calf.id,
        title: calf.name || '',
        investment_date: calf.birth_date || today(),
        investment_amount: calf.purchase_price || calf.paid_amount || prev.investment_amount || '',
        notes: calf.notes || ''
      }));
      return;
    }

    setInvestmentForm((prev) => ({ ...createEmptyInvestmentForm(), notes: prev.notes || '' }));
  }

  async function runReport(preset = 'custom') {
    const now = new Date();
    let start = reportRange.start;
    let end = reportRange.end;
    let label = 'Custom range';

    if (preset === 'today') {
      start = end = today();
      label = 'Today';
    } else if (preset === 'month') {
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      start = `${ym}-01`;
      end = today();
      label = 'This month';
    } else if (preset === 'previousMonth') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const startMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
      const endMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
      start = startMonth;
      end = `${endMonth.getFullYear()}-${String(endMonth.getMonth() + 1).padStart(2, '0')}-${String(endMonth.getDate()).padStart(2, '0')}`;
      label = 'Previous month';
    } else if (preset === 'all') {
      start = '';
      end = '';
      label = 'All data';
    }

    setReportPreset(preset);
    setReportRange({ start, end });
    setReportMeta({ label, start, end });
    const query = new URLSearchParams();
    if (start) query.set('start', start);
    if (end) query.set('end', end);
    const data = await api(`/api/reports${query.toString() ? `?${query.toString()}` : ''}`);
    setReports(data);
  }

  function updateMilkSale(index, patch) {
    setDailyForm((prev) => {
      const next = [...prev.milkSales];
      const merged = { ...next[index], ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'buyer_id')) {
        const buyer = state.buyers.find((item) => String(item.id) === String(patch.buyer_id));
        if (buyer && !next[index].rate_per_litre) merged.rate_per_litre = buyer.default_rate || '';
      }
      next[index] = merged;
      return { ...prev, milkSales: next };
    });
  }

  function updateExpense(index, patch) {
    setDailyForm((prev) => {
      const next = [...prev.expenses];
      let updated = { ...next[index], ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, 'expense_type')) {
        if (patch.expense_type === 'feed') {
          const defaultFood = state.foods.find((food) => String(food.id) === String(updated.food_item_id)) || state.foods[0];
          const foodSnapshot = resolveFoodSnapshot(state.foods, updated.food_item_id || defaultFood?.id, prev.entry_date);
          updated = {
            ...updated,
            expense_type: 'feed',
            category_id: '',
            food_item_id: updated.food_item_id || defaultFood?.id || '',
            cow_id: updated.cow_id || feedEligibleCows[0]?.id || state.cows[0]?.id || '',
            food_price_history_id: foodSnapshot?.food_price_history_id || null,
            food_name_snapshot: foodSnapshot?.food_name_snapshot || defaultFood?.name || '',
            unit_type_snapshot: foodSnapshot?.unit_type_snapshot || defaultFood?.unit_type || 'kg',
            rate_effective_from: foodSnapshot?.rate_effective_from || null,
            quantity_kg: updated.quantity_kg || '',
            unit_rate: Number(foodSnapshot?.unit_rate || 0),
            entry_shift: updated.entry_shift || 'Morning',
            amount: updated.quantity_kg !== '' && updated.quantity_kg !== null && updated.quantity_kg !== undefined
              ? Number((Number(updated.quantity_kg || 0) * Number(foodSnapshot?.unit_rate || 0)).toFixed(2))
              : ''
          };
        } else {
          updated = {
            ...updated,
            expense_type: 'common',
            category_id: updated.category_id || state.categories[0]?.id || '',
            cow_id: '',
            food_item_id: '',
            food_price_history_id: null,
            food_name_snapshot: '',
            unit_type_snapshot: '',
            rate_effective_from: null,
            entry_shift: '',
            quantity_kg: '',
            unit_rate: ''
          };
        }
      }

      if ((updated.expense_type || 'common') === 'feed') {
        if (Object.prototype.hasOwnProperty.call(patch, 'food_item_id')) {
          const foodSnapshot = resolveFoodSnapshot(state.foods, patch.food_item_id, prev.entry_date);
          updated.food_price_history_id = foodSnapshot?.food_price_history_id || null;
          updated.food_name_snapshot = foodSnapshot?.food_name_snapshot || '';
          updated.unit_type_snapshot = foodSnapshot?.unit_type_snapshot || 'kg';
          updated.rate_effective_from = foodSnapshot?.rate_effective_from || null;
          updated.unit_rate = Number(foodSnapshot?.unit_rate || 0);
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'food_item_id') || Object.prototype.hasOwnProperty.call(patch, 'quantity_kg') || Object.prototype.hasOwnProperty.call(patch, 'unit_rate')) {
          const qty = Number(updated.quantity_kg || 0);
          const rate = Number(updated.unit_rate || 0);
          updated.amount = updated.quantity_kg !== '' && updated.quantity_kg !== null && updated.quantity_kg !== undefined
            ? Number((qty * rate).toFixed(2))
            : '';
        }
      }

      next[index] = updated;
      return { ...prev, expenses: next };
    });
  }

  function updateCowEntry(index, patch) {
    setDailyForm((prev) => {
      const next = [...prev.cowEntries];
      next[index] = { ...next[index], ...patch };
      return { ...prev, cowEntries: next };
    });
  }

  function editCow(cow) {
    setCowEditingId(cow.id);
    setCowForm({
      name: cow.name || '',
      breed: cow.breed || '',
      age: cow.age || '',
      status: !cow.status || cow.status === 'Active' ? 'Lactating' : cow.status,
      status_date: cow.status_date || '',
      notes: cow.notes || ''
    });
  }

  function resetCowForm() {
    setCowEditingId(null);
    setCowForm({ name: '', breed: '', age: '', status: 'Lactating', status_date: today(), notes: '' });
  }

  async function downloadCowPdf(cow) {
    await exportSingleCowPdf(cow);
    notify('Cow record PDF downloaded');
  }

  async function downloadAllCowsPdf(cows) {
    await exportAllCowsPdf(cows);
    notify('All cow records PDF downloaded');
  }

  function editCalf(calf) {
    setCalfEditingId(calf.id);
    setCalfForm({
      name: calf.name || '',
      breed: calf.breed || '',
      birth_date: calf.birth_date || today(),
      source_type: calf.source_type === 'purchased' ? 'Purchased young' : 'Raised',
      expected_lactation_date: calf.expected_lactation_date || '',
      purchase_price: calf.purchase_price || '',
      paid_amount: calf.paid_amount || '',
      status: calf.status || 'Growing',
      notes: calf.notes || ''
    });
  }

  function resetCalfForm() {
    setCalfEditingId(null);
    setCalfForm({ name: '', breed: '', birth_date: today(), source_type: 'Raised', expected_lactation_date: '', purchase_price: '', paid_amount: '', status: 'Growing', notes: '' });
  }

  function resetCalfExpenseForm() {
    setCalfExpenseForm({ calf_id: state.calves[0]?.calf?.id || state.calves[0]?.id || '', expense_date: today(), expense_type: 'common', category_id: state.categories[0]?.id || '', food_item_id: '', food_price_history_id: null, food_name_snapshot: '', unit_type_snapshot: '', rate_effective_from: null, quantity_kg: '', unit_rate: '', amount: '', entry_shift: 'Morning', description: '', payment_mode: 'Cash' });
  }

  function editBuyer(buyer) {
    setBuyerEditingId(buyer.id);
    setBuyerForm({
      name: buyer.name || '',
      location: buyer.location || '',
      default_rate: buyer.default_rate || '',
      contact: buyer.contact || '',
      notes: buyer.notes || '',
      active: Boolean(buyer.active)
    });
  }

  function resetBuyerForm() {
    setBuyerEditingId(null);
    setBuyerForm({ name: '', location: '', default_rate: '', contact: '', notes: '', active: true });
  }

  async function refreshReportsView(preset = reportPreset || 'all') {
    await refresh(dailyForm.entry_date || today(), true);
    await runReport(preset === 'custom' ? 'custom' : preset || 'all');
  }

  function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changeTab(nextTab) {
    setTab(nextTab);
    setMobileNavOpen(false);
    if (nextTab !== 'reports') {
      setRegisterFullscreen(false);
      return;
    }
    refreshReportsView();
  }

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen overflow-x-hidden p-4 md:p-6">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="floating-orb left-[6%] top-16 h-36 w-36 bg-emerald-400/20" />
        <div className="floating-orb right-[8%] top-32 h-48 w-48 bg-sky-400/20" style={{ animationDelay: '1.2s' }} />
        <div className="floating-orb bottom-16 left-1/3 h-44 w-44 bg-violet-400/12" style={{ animationDelay: '2.1s' }} />
      </div>

      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              className="glass fixed inset-y-4 left-4 z-50 w-[min(84vw,320px)] rounded-[2rem] p-5 lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <div className="display-font text-xl font-black tracking-tight">Milk Business Pro</div>
                  <div className="text-xs opacity-60">Quick sections & reports</div>
                </div>
                <button onClick={() => setMobileNavOpen(false)} className="rounded-2xl border border-white/20 px-3 py-2">
                  <X size={18} />
                </button>
              </div>
              <NavigationLinks tab={tab} onSelect={changeTab} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="mx-auto flex max-w-7xl gap-4 lg:gap-6">
        <aside className="glass hidden w-72 shrink-0 rounded-[2rem] p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-3xl bg-gradient-to-br from-emerald-400/25 to-sky-400/25 p-4 text-emerald-500 shadow-[0_18px_40px_rgba(16,185,129,0.18)]"><Milk size={26} /></div>
            <div>
              <h1 className="display-font text-xl font-black tracking-tight">Milk Business Pro</h1>
              <p className="text-xs opacity-60">Cleaner daily sales + expense control</p>
            </div>
          </div>
          <NavigationLinks tab={tab} onSelect={changeTab} />
          <div className="mt-8 rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/15 to-sky-500/15 p-4 text-sm opacity-80 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
            Use <b>Daily Entry</b> for milk, sales, and expenses. Reports now handle the full archive cleanly.
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <header className="glass relative overflow-hidden rounded-[2rem] p-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_30%)]" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button onClick={() => setMobileNavOpen(true)} className="mt-1 rounded-2xl border border-white/20 px-3 py-2 lg:hidden">
                  <Menu size={18} />
                </button>
                <div>
                  <p className="text-sm opacity-60">Welcome back, {user.username}</p>
                  <h2 className="display-font text-3xl font-black tracking-tight md:text-4xl">Milk business dashboard</h2>
                  <p className="mt-1 max-w-2xl text-sm opacity-70">Track production, sales, expenses, pending payments, and profit with a cleaner business-first layout.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDark((v) => !v)} className="rounded-2xl border border-white/20 px-4 py-2.5"><SunMoon size={18} /></button>
                <button onClick={deleteAccount} className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-red-600 dark:bg-red-500/10"><Trash2 size={18} /></button>
                <button onClick={logout} className="rounded-2xl bg-red-500 px-4 py-2.5 text-white"><LogOut size={18} /></button>
              </div>
            </div>
          </header>

          {tab === 'dashboard' && dashboard && (
            <section className="space-y-4">
               <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_.85fr]">
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="premium-hero relative overflow-hidden rounded-[2rem] p-6 text-slate-950 md:grid md:grid-cols-[1.1fr_.9fr] md:items-center md:gap-4"
                  >
                    <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/30 blur-3xl" />
                    <div className="pointer-events-none absolute bottom-0 right-0 h-24 w-24 rounded-full bg-sky-400/25 blur-2xl" />
                    <div className="relative z-10">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-950/10 bg-white/55 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
                        <Sparkles size={14} /> Premium snapshot
                      </div>
                      <h3 className="display-font mt-4 text-3xl font-black tracking-tight md:text-4xl">Keep today profitable without hunting through clutter.</h3>
                      <p className="mt-3 max-w-xl text-sm text-slate-700/85">The dashboard now surfaces urgent business signals first: pending money, your best profit day, and where the milk is actually going.</p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button onClick={() => changeTab('daily')} className="rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white shadow-lg shadow-slate-950/20">Open Daily Entry</button>
                        <button onClick={() => changeTab('reports')} className="rounded-2xl border border-slate-950/10 bg-white/70 px-5 py-3 font-bold text-slate-900">Open Reports</button>
                      </div>
                    </div>
                    <div className="relative mt-6 flex justify-center md:mt-0 md:justify-center">
                      <div className="relative z-10">
                        <CowMascot />
                      </div>
                    </div>
                  </motion.div>
                  <FarmSceneArt />
                </div>

                <div className="grid h-fit content-start gap-4 self-start sm:grid-cols-2">
                  <ActionCard icon={Wallet} title="Pending collections" value={currency(smartInsights.pendingAmount)} hint={`${smartInsights.pendingSalesCount} sale rows need follow-up`} tone="amber" />
                  <ActionCard icon={TrendingUp} title="Best profit day" value={smartInsights.bestDay ? currency(smartInsights.bestDay.profit) : '—'} hint={smartInsights.bestDay ? smartInsights.bestDay.date : 'Not enough saved days yet'} tone="emerald" />
                  <ActionCard icon={Activity} title="Weakest day" value={smartInsights.weakDay ? currency(smartInsights.weakDay.profit) : '—'} hint={smartInsights.weakDay ? `${smartInsights.weakDay.date} needs review` : 'Nothing to flag yet'} tone="rose" />
                  <ActionCard icon={Users} title="Top buyer" value={smartInsights.topBuyerName} hint={`${litres(smartInsights.topBuyerMilk)} sold`} tone="sky" />
                  <div className="sm:col-span-2">
                    <FactCard
                      title="Quick dairy facts"
                       facts={[
                         { label: 'Today milk', value: litres(dashboard.today.totalMilkLitres), tone: 'sky' },
                         { label: 'Today remaining', value: litres(dashboard.today.remainingMilkLitres), tone: 'emerald' },
                         { label: 'Month profit', value: currency(dashboard.monthly.profit), tone: dashboard.monthly.profit >= 0 ? 'emerald' : 'rose' }
                       ]}
                      footer="Business overview"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Droplets} label="Today's milk" value={litres(dashboard.today.totalMilkLitres)} tone="blue" sub={`Remaining ${litres(dashboard.today.remainingMilkLitres)}`} />
                <StatCard icon={CircleDollarSign} label="Today's income" value={currency(dashboard.today.totalIncome)} tone="green" />
                <StatCard icon={CircleDollarSign} label="Today's expenses" value={currency(dashboard.today.totalExpenses)} tone="orange" />
                <StatCard icon={TrendingUp} label="Today's profit/loss" value={currency(dashboard.today.profit)} tone={dashboard.today.profit >= 0 ? 'green' : 'red'} sub={`Updated ${dashboard.lastUpdated || '—'}`} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
                <Card><SectionTitle title="Income vs expense trend" icon={CalendarDays} /><ChartWrap><AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="income" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.9" /><stop offset="100%" stopColor="#16a34a" stopOpacity="0.12" /></linearGradient><linearGradient id="expense" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d97706" stopOpacity="0.85" /><stop offset="100%" stopColor="#d97706" stopOpacity="0.12" /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" stroke="#94a3b8" opacity={0.28} /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(255,255,255,0.96)', color: '#0f172a' }} /><Area type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={3} fill="url(#income)" /><Area type="monotone" dataKey="expenses" stroke="#d97706" strokeWidth={3} fill="url(#expense)" /></AreaChart></ChartWrap></Card>
                <Card><SectionTitle title="Monthly margin" icon={TrendingUp} /><div className="relative mx-auto flex h-72 max-w-[280px] items-center justify-center"><div className="absolute h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" /><div className="absolute inset-0"><ResponsiveContainer><RadialBarChart innerRadius="72%" outerRadius="96%" barSize={16} data={[{ value: Math.min(Math.abs(dashboard.monthly.profitMargin), 100), fill: dashboard.monthly.profit >= 0 ? '#22c55e' : '#ef4444' }]} startAngle={90} endAngle={-270}><PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar cornerRadius={24} background={{ fill: 'rgba(148,163,184,0.14)' }} dataKey="value" /></RadialBarChart></ResponsiveContainer></div><div className="relative z-10 rounded-[2rem] border border-slate-200/80 bg-white/88 px-5 py-4 text-center shadow-[0_12px_30px_rgba(15,23,42,0.10)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/82"><div className="display-font text-[2.45rem] font-black leading-none tracking-tight text-slate-900 dark:text-white">{dashboard.monthly.profitMargin}%</div><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Profit margin</p></div></div></Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <PanelChart title="Milk sold by buyer" data={dashboard.charts.buyerSplit} type="pie" />
                <PanelChart title="Daily profit" data={trend} type="line" dataKey="profit" color={latestTrendProfit >= 0 ? '#22c55e' : '#ef4444'} />
                <PanelChart title="Remaining milk trend" data={trend} type="bar" dataKey="remaining" color="#3b82f6" xKey="date" />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <InfoBox title="Monthly finance" lines={[`Income: ${currency(dashboard.monthly.income)}`, `Expenses: ${currency(dashboard.monthly.expenses)}`, `Profit: ${currency(dashboard.monthly.profit)}`]} />
                <InfoBox title="Milk summary" lines={[`Produced this month: ${litres(dashboard.monthly.milk)}`, `Remaining today: ${litres(dashboard.today.remainingMilkLitres)}`, `Margin: ${dashboard.monthly.profitMargin}%`]} />
                <InfoBox title="Top buyer" lines={topBuyer ? [`${topBuyer.name || 'Unknown buyer'}`, `Milk sold: ${litres(topBuyer.value)}`, 'Good buyer to prioritize'] : ['No buyer sales yet']} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <InfoBox title="Cow performance" lines={dashboard?.cows?.best ? [`Best yielder: ${dashboard.cows.best.name}`, `Total milk: ${litres(dashboard.cows.best.totalMilk)}`, `Status: ${dashboard.cows.best.status || 'Lactating'}`] : ['No cow production data yet']} />
                <InfoBox title="Cow attention" lines={dashboard?.cows?.low ? [`Lowest yielder: ${dashboard.cows.low.name}`, `Total milk: ${litres(dashboard.cows.low.totalMilk)}`, `Nil-yield days: ${dashboard.cows.low.nilDays || 0}`] : ['No low-yield data yet']} />
              </div>
            </section>
          )}

          {tab === 'daily' && (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                <Card>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <SectionTitle title="Daily entry" icon={NotebookPen} />
                    <div className="inline-flex rounded-2xl border border-white/20 bg-white/55 p-1 dark:bg-slate-900/40">
                      {[
                        ['direct', 'Direct entry'],
                        ['cows', 'Cow-wise entry']
                      ].map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => setDailyForm((prev) => ({
                            ...prev,
                            entry_mode: mode,
                            total_milk_litres: mode === 'cows' ? String(dailyCowTotal || '') : prev.total_milk_litres,
                            cowEntries: mode === 'cows' && !prev.cowEntries.length ? [createCowEntryRow(activeCows)] : prev.cowEntries
                          }))}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${dailyForm.entry_mode === mode ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-700 dark:text-slate-200'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Input label="Entry date" type="date" value={dailyForm.entry_date} onChange={(value) => { setLoadedEntryId(null); setDailyForm((prev) => ({ ...prev, entry_date: value })); loadDailyEntry(value); }} />
                    <Input label="Total milk produced" type="number" value={dailyForm.entry_mode === 'cows' ? dailyCowTotal : dailyForm.total_milk_litres} onChange={(value) => setDailyForm({ ...dailyForm, total_milk_litres: value })} disabled={dailyForm.entry_mode === 'cows'} />
                    <Input label="Remaining milk" value={dailyMetrics.remaining} disabled />
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <SelectInput label="Remaining milk purpose" value={dailyForm.remaining_milk_usage} onChange={(value) => setDailyForm({ ...dailyForm, remaining_milk_usage: value })} options={remainingMilkOptions} />
                    <Input label="Short note" placeholder="home use / spoilage / carry forward details" value={dailyForm.remaining_milk_notes} onChange={(value) => setDailyForm({ ...dailyForm, remaining_milk_notes: value })} />
                  </div>
                  <TextArea label="General notes" placeholder="Any useful note for the day" value={dailyForm.notes} onChange={(value) => setDailyForm({ ...dailyForm, notes: value })} />
                  <div className="mt-4 rounded-2xl border border-white/15 bg-white/40 px-4 py-3 text-sm font-medium dark:bg-slate-900/35">
                    {dailyLoading ? 'Loading saved data for this date…' : loadedEntryId ? `Editing saved entry for ${dailyForm.entry_date}` : `Creating a fresh entry for ${dailyForm.entry_date}`}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-sm font-medium dark:bg-slate-800/60">
                      <div className="font-semibold">Sales rows</div>
                      <div className="display-font mt-1 text-2xl font-black">{dailyHealth.saleRows}</div>
                    </div>
                    <div className="rounded-2xl border border-white/30 bg-white/60 px-4 py-3 text-sm font-medium dark:bg-slate-800/60">
                      <div className="font-semibold">{dailyForm.entry_mode === 'cows' ? 'Cow rows' : 'Expense rows'}</div>
                      <div className="display-font mt-1 text-2xl font-black">{dailyForm.entry_mode === 'cows' ? dailyForm.cowEntries.length : dailyHealth.expenseRows}</div>
                    </div>
                    <div className={`rounded-2xl border-2 px-4 py-3 text-sm ${dailyHealth.oversold ? 'border-rose-500 bg-rose-100 dark:bg-rose-900/40 text-rose-900 dark:text-rose-100' : 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100'}`}>
                      <div className="font-bold">Health check</div>
                      <div className="mt-1 text-base font-bold">{dailyHealth.oversold ? 'Milk sold is above production' : 'Numbers look balanced'}</div>
                    </div>
                  </div>
                </Card>

                <motion.div layout whileHover={{ y: -4 }} className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
                  <SectionTitle title="Live summary" icon={CheckCircle2} dark />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniStat label="Produced" value={litres(dailyMetrics.produced)} />
                    <MiniStat label="Sold" value={litres(dailyMetrics.sold)} />
                    <MiniStat label="Remaining" value={litres(dailyMetrics.remaining)} />
                    <MiniStat label="Income" value={currency(dailyMetrics.income)} />
                    <MiniStat label="Expenses" value={currency(dailyMetrics.expenses)} />
                  </div>
                  <div className="mt-4 rounded-3xl border border-white/10 bg-white/12 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-300">Estimated profit</span>
                      <span className={`text-3xl font-black ${dailyMetrics.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currency(dailyMetrics.profit)}</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${dailyHealth.oversold || dailyMetrics.profit < 0 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(12, Math.min(dailyHealth.salesCoverage || 0, 100))}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300/90">
                      <span>{dailyHealth.salesCoverage.toFixed(0)}% of produced milk is assigned to sales</span>
                      <span>{dailyHealth.pendingAmount > 0 ? `Pending ${currency(dailyHealth.pendingAmount)}` : 'No pending payment in this day'}</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {dailyForm.entry_mode === 'cows' && (
                <Card>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <SectionTitle title="Cow-wise milk collection" icon={Milk} />
                    <button onClick={() => setDailyForm((prev) => ({ ...prev, cowEntries: [...prev.cowEntries, createCowEntryRow(activeCows)] }))} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"><Plus size={16} />Add cow</button>
                  </div>
                  {!activeCows.length ? (
                    <div className="rounded-3xl border border-dashed border-white/20 bg-white/35 px-4 py-8 text-center text-sm opacity-70 dark:bg-slate-900/25">
                      No lactating cows available. Add cows in the Cows section or change a cow back to Lactating.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dailyForm.cowEntries.map((entry, index) => (
                        <div key={index} className="grid gap-3 rounded-3xl border border-white/20 bg-white/45 p-4 dark:bg-slate-900/40 xl:grid-cols-[1.15fr_.8fr_.9fr_1fr_auto]">
                          <SelectInput label="Cow" value={entry.cow_id} onChange={(value) => updateCowEntry(index, { cow_id: value })} options={activeCows.map((cow) => ({ label: cow.name, value: cow.id }))} />
                          <Input label="Litres collected" type="number" value={entry.total_litres} onChange={(value) => updateCowEntry(index, { total_litres: value })} />
                          <SelectInput label="Morning / evening" value={entry.entry_shift || 'Morning'} onChange={(value) => updateCowEntry(index, { entry_shift: value })} options={shiftOptions} />
                          <Input label="Observation" placeholder="Optional note" value={entry.notes} onChange={(value) => updateCowEntry(index, { notes: value })} />
                          <div className="flex items-end"><button onClick={() => setDailyForm((prev) => ({ ...prev, cowEntries: prev.cowEntries.filter((_, i) => i !== index) }))} className="rounded-2xl px-3 py-3 text-sm font-semibold text-red-500">Remove</button></div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <SectionTitle title="Milk sales" icon={Milk} />
                  <button onClick={() => setDailyForm((prev) => ({ ...prev, milkSales: [...prev.milkSales, createSaleRow(state.buyers)] }))} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"><Plus size={16} />Add sale</button>
                </div>
                <div className="space-y-3">
                  {dailyForm.milkSales.map((sale, index) => {
                    const amount = Number(sale.litres || 0) * Number(sale.rate_per_litre || 0);
                    return (
                      <div key={index} className="rounded-3xl border border-white/20 bg-white/45 p-4 dark:bg-slate-900/40">
                        <div className="grid gap-3 xl:grid-cols-[1.15fr_.75fr_.75fr_1fr_1fr_.9fr_auto] xl:items-end">
                          <SelectInput label="Buyer" value={sale.buyer_id} onChange={(value) => updateMilkSale(index, { buyer_id: value })} options={state.buyers.map((buyer) => ({ label: buyer.name, value: buyer.id }))} />
                          <Input label="Litres" type="number" value={sale.litres} onChange={(value) => updateMilkSale(index, { litres: value })} />
                          <Input label="Rate/L" type="number" value={sale.rate_per_litre} onChange={(value) => updateMilkSale(index, { rate_per_litre: value })} />
                          <SelectInput label="Payment status" value={sale.payment_status} onChange={(value) => updateMilkSale(index, { payment_status: value })} options={paymentStatusOptions} />
                          <SelectInput label="Payment mode" value={sale.payment_mode} onChange={(value) => updateMilkSale(index, { payment_mode: value })} options={paymentModeOptions} />
                          <div>
                            <span className="mb-2 block text-sm font-semibold opacity-70">Income</span>
                            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-lg font-black text-emerald-700 dark:text-emerald-300">{currency(amount)}</div>
                          </div>
                          <div className="flex xl:justify-end xl:pb-1"><button onClick={() => setDailyForm((prev) => ({ ...prev, milkSales: prev.milkSales.filter((_, i) => i !== index) }))} className="rounded-2xl px-3 py-3 text-sm font-semibold text-red-500">Remove</button></div>
                        </div>
                        <div className="mt-3">
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold opacity-70">Optional note</span>
                            <textarea rows={2} value={sale.notes} onChange={(e) => updateMilkSale(index, { notes: e.target.value })} placeholder="Add any note for this sale" className="w-full rounded-2xl border border-white/20 bg-white/50 p-3 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:bg-slate-900/50" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <SectionTitle title="Daily expenses" icon={CircleDollarSign} />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setDailyForm((prev) => ({ ...prev, expenses: [...prev.expenses, createExpenseRow(state.categories, state.foods, feedEligibleCows, 'common', prev.entry_date)] }))} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"><Plus size={16} />Add common</button>
                    <button onClick={() => setDailyForm((prev) => ({ ...prev, expenses: [...prev.expenses, createExpenseRow(state.categories, state.foods, feedEligibleCows, 'feed', prev.entry_date)] }))} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl hover:shadow-emerald-500/30"><Plus size={16} />Add food</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {dailyForm.expenses.map((expense, index) => (
                    <div key={index} className="relative rounded-3xl border border-white/20 bg-white/45 p-4 pb-12 dark:bg-slate-900/40">
                      <button onClick={() => setDailyForm((prev) => ({ ...prev, expenses: prev.expenses.filter((_, i) => i !== index) }))} className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-2xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-600"><Trash2 size={14} />Remove</button>
                      <div className="grid gap-3 xl:grid-cols-12">
                        <div className="xl:col-span-2">
                          <SelectInput label="Expense type" value={expense.expense_type || 'common'} onChange={(value) => updateExpense(index, { expense_type: value })} options={[{ label: 'Common', value: 'common' }, { label: 'Food', value: 'feed' }]} />
                        </div>

                        {(expense.expense_type || 'common') === 'feed' ? (() => {
                          const selectedFood = state.foods.find((food) => String(food.id) === String(expense.food_item_id));
                          const foodUnitLabel = (expense.unit_type_snapshot || selectedFood?.unit_type) === 'liter' ? 'L' : 'kg';
                          return (
                          <>
                            <div className="xl:col-span-2">
                            <SelectInput label="Cow" value={expense.cow_id} onChange={(value) => updateExpense(index, { cow_id: value })} options={feedEligibleCows.map((cow) => ({ label: cow.status === 'Calf' ? `${cow.name} (Calf)` : cow.name, value: cow.id }))} />
                            </div>
                            <div className="xl:col-span-2">
                               <SelectInput label="Food / feed item" value={expense.food_item_id} onChange={(value) => updateExpense(index, { food_item_id: value })} options={state.foods.map((food) => {
                                 const foodSnapshot = resolveFoodSnapshot(state.foods, food.id, dailyForm.entry_date);
                                 return { label: `${food.name} (${currency(foodSnapshot?.unit_rate || 0)}/${foodSnapshot?.unit_type_snapshot === 'liter' ? 'L' : 'kg'})`, value: food.id };
                               })} />
                            </div>
                            <div className="xl:col-span-2">
                                <Input label={`Quantity (${foodUnitLabel})`} type="number" value={expense.quantity_kg} onChange={(value) => updateExpense(index, { quantity_kg: value })} />
                            </div>
                            <div className="xl:col-span-2">
                              <Input label={`Rate / ${foodUnitLabel}`} type="number" value={expense.unit_rate} onChange={(value) => updateExpense(index, { unit_rate: value })} disabled />
                            </div>
                            <div className="xl:col-span-2">
                              <Input label="Amount" type="number" value={expense.amount} onChange={() => {}} disabled />
                            </div>
                            <div className="xl:col-span-2">
                              <SelectInput label="Morning / evening" value={expense.entry_shift || 'Morning'} onChange={(value) => updateExpense(index, { entry_shift: value })} options={shiftOptions} />
                            </div>
                            <div className="xl:col-span-10">
                              <Input label="Notes" placeholder="Optional feed note" value={expense.description} onChange={(value) => updateExpense(index, { description: value })} />
                            </div>
                            <div className="xl:col-span-2 flex items-center justify-center rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-center">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Food expense</div>
                                <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Choose cow + food + {foodUnitLabel}</div>
                              </div>
                            </div>
                          </>
                        )})() : (
                          <>
                            <div className="xl:col-span-3">
                              <SelectInput label="Category" value={expense.category_id} onChange={(value) => updateExpense(index, { category_id: value })} options={state.categories.map((category) => ({ label: category.name, value: category.id }))} />
                            </div>
                            <div className="xl:col-span-2">
                              <Input label="Amount" type="number" value={expense.amount} onChange={(value) => updateExpense(index, { amount: value })} />
                            </div>
                            <div className="xl:col-span-3">
                              <Input label="Description" placeholder="transport, repair..." value={expense.description} onChange={(value) => updateExpense(index, { description: value })} />
                            </div>
                            <div className="xl:col-span-2">
                              <SelectInput label="Payment mode" value={expense.payment_mode} onChange={(value) => updateExpense(index, { payment_mode: value })} options={paymentModeOptions} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="border-2 border-emerald-300/35 bg-gradient-to-r from-emerald-500/10 to-teal-400/10">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">{loadedEntryId ? 'Update this daily entry' : 'Save this daily entry'}</h3>
                    <p className="mt-1 text-sm opacity-70">Keep this action separate so it’s clear when you’re saving the whole day’s milk, sales, and expenses.</p>
                  </div>
                  <button onClick={saveDaily} className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-8 py-4 text-lg font-black text-slate-950 shadow-lg shadow-emerald-500/25">{loadedEntryId ? 'Update Daily Entry' : 'Save Daily Entry'}</button>
                </div>
              </Card>

              <Card>
                <SectionTitle title="Selected date saved data" icon={CalendarDays} />
                {currentSavedItem ? (
                  <SavedEntryCard item={currentSavedItem} onEdit={(entryDate) => { loadDailyEntry(entryDate); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={deleteDailyEntry} compact />
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/20 bg-white/35 px-4 py-8 text-center text-sm opacity-70 dark:bg-slate-900/25">
                    No saved data yet for {dailyForm.entry_date}. Save this day and it will appear here automatically.
                  </div>
                )}
              </Card>
            </section>
          )}

          {tab === 'buyers' && (
            <section className="grid gap-4 xl:grid-cols-[.95fr_1.05fr]">
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <SectionTitle title={buyerEditingId ? 'Edit buyer' : 'Add buyer'} icon={Users} />
                  {buyerEditingId && <button onClick={resetBuyerForm} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm"><X size={14} />Cancel</button>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Buyer name" value={buyerForm.name} onChange={(value) => setBuyerForm({ ...buyerForm, name: value })} />
                  <Input label="Location" value={buyerForm.location} onChange={(value) => setBuyerForm({ ...buyerForm, location: value })} />
                  <Input label="Default rate / litre" type="number" value={buyerForm.default_rate} onChange={(value) => setBuyerForm({ ...buyerForm, default_rate: value })} />
                  <Input label="Contact" value={buyerForm.contact} onChange={(value) => setBuyerForm({ ...buyerForm, contact: value })} />
                  <SelectInput label="Status" value={buyerForm.active ? '1' : '0'} onChange={(value) => setBuyerForm({ ...buyerForm, active: value === '1' })} options={[{ label: 'Active', value: '1' }, { label: 'Inactive', value: '0' }]} />
                </div>
                <TextArea label="Notes" placeholder="Optional remarks" value={buyerForm.notes} onChange={(value) => setBuyerForm({ ...buyerForm, notes: value })} />
                <button onClick={saveBuyer} className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 font-bold text-slate-950">{buyerEditingId ? 'Update Buyer' : 'Save Buyer'}</button>
              </Card>

              <Card>
                <SectionTitle title="Previous buyers / selling places" icon={Users} />
                <div className="space-y-3">
                  {state.buyers.map((buyer) => (
                    <div key={buyer.id} className="flex flex-col gap-3 rounded-3xl border border-white/20 bg-white/45 p-4 dark:bg-slate-900/40 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-bold">{buyer.name}</div>
                        <div className="mt-1 text-sm opacity-70">{buyer.location || 'No location'} • {currency(buyer.default_rate)}/L • {buyer.active ? 'Active' : 'Inactive'}</div>
                        <div className="mt-1 text-sm opacity-65">{buyer.contact || 'No contact'}{buyer.notes ? ` • ${buyer.notes}` : ''}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => editBuyer(buyer)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold"><Pencil size={14} />Edit</button>
                        <button onClick={() => deleteBuyer(buyer)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10"><Trash2 size={14} />Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}

          {tab === 'calves' && (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <SectionTitle title={calfEditingId ? 'Edit calf record' : 'Register new calf'} icon={Milk} />
                    {calfEditingId && <button onClick={resetCalfForm} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm"><X size={14} />Cancel</button>}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Calf name / ID" value={calfForm.name} onChange={(value) => setCalfForm((prev) => ({ ...prev, name: value }))} />
                    <Input label="Breed" value={calfForm.breed} onChange={(value) => setCalfForm((prev) => ({ ...prev, breed: value }))} />
                    <Input label="Birth / start date" type="date" value={calfForm.birth_date} onChange={(value) => setCalfForm((prev) => ({ ...prev, birth_date: value }))} />
                    <SelectInput label="Source" value={calfForm.source_type} onChange={(value) => setCalfForm((prev) => ({ ...prev, source_type: value }))} options={calfSourceOptions} />
                    <Input label="Expected lactation date" type="date" value={calfForm.expected_lactation_date} onChange={(value) => setCalfForm((prev) => ({ ...prev, expected_lactation_date: value }))} />
                    <SelectInput label="Status" value={calfForm.status} onChange={(value) => setCalfForm((prev) => ({ ...prev, status: value }))} options={calfStatusOptions} />
                    <Input label="Purchase / base price" type="number" value={calfForm.purchase_price} onChange={(value) => setCalfForm((prev) => ({ ...prev, purchase_price: value }))} />
                    <Input label="Paid amount" type="number" value={calfForm.paid_amount} onChange={(value) => setCalfForm((prev) => ({ ...prev, paid_amount: value }))} />
                  </div>
                  <TextArea label="Notes" placeholder="Growth, health, vendor, partial payment, etc." value={calfForm.notes} onChange={(value) => setCalfForm((prev) => ({ ...prev, notes: value }))} />
                  <button onClick={saveCalf} className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 font-bold text-slate-950">{calfEditingId ? 'Update calf' : 'Save calf'}</button>
                </Card>

                <Card className="flex h-full flex-col">
                  <SectionTitle title="Calf expenses" icon={CircleDollarSign} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectInput label="Calf" value={calfExpenseForm.calf_id} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, calf_id: value }))} options={calfSummaries.map((calf) => ({ label: calf.name, value: calf.id }))} />
                    <Input label="Expense date" type="date" value={calfExpenseForm.expense_date} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, expense_date: value }))} />
                    <SelectInput label="Expense type" value={calfExpenseForm.expense_type} onChange={(value) => {
                      if (value === 'feed') {
                        const food = state.foods[0];
                        const foodSnapshot = resolveFoodSnapshot(state.foods, food?.id, calfExpenseForm.expense_date);
                        setCalfExpenseForm((prev) => ({ ...prev, expense_type: 'feed', category_id: '', food_item_id: food?.id || '', food_price_history_id: foodSnapshot?.food_price_history_id || null, food_name_snapshot: foodSnapshot?.food_name_snapshot || food?.name || '', unit_type_snapshot: foodSnapshot?.unit_type_snapshot || food?.unit_type || 'kg', rate_effective_from: foodSnapshot?.rate_effective_from || null, quantity_kg: '', unit_rate: foodSnapshot?.unit_rate || '', amount: '', entry_shift: 'Morning', description: '' }));
                      } else {
                        setCalfExpenseForm((prev) => ({ ...prev, expense_type: 'common', category_id: prev.category_id || state.categories[0]?.id || '', food_item_id: '', food_price_history_id: null, food_name_snapshot: '', unit_type_snapshot: '', rate_effective_from: null, quantity_kg: '', unit_rate: '', amount: prev.amount, entry_shift: 'Morning', description: prev.description }));
                      }
                    }} options={[{ label: 'Common', value: 'common' }, { label: 'Food', value: 'feed' }]} />

                    {calfExpenseForm.expense_type === 'feed' ? (
                      <>
                        <SelectInput label="Food item" value={calfExpenseForm.food_item_id} onChange={(value) => {
                          const food = state.foods.find((item) => String(item.id) === String(value));
                          const foodSnapshot = resolveFoodSnapshot(state.foods, value, calfExpenseForm.expense_date);
                          setCalfExpenseForm((prev) => ({ ...prev, food_item_id: value, food_price_history_id: foodSnapshot?.food_price_history_id || null, food_name_snapshot: foodSnapshot?.food_name_snapshot || food?.name || '', unit_type_snapshot: foodSnapshot?.unit_type_snapshot || food?.unit_type || 'kg', rate_effective_from: foodSnapshot?.rate_effective_from || null, unit_rate: foodSnapshot?.unit_rate || '', amount: prev.quantity_kg !== '' && prev.quantity_kg !== null && prev.quantity_kg !== undefined ? Number((Number(prev.quantity_kg || 0) * Number(foodSnapshot?.unit_rate || 0)).toFixed(2)) : '' }));
                        }} options={state.foods.map((food) => {
                          const foodSnapshot = resolveFoodSnapshot(state.foods, food.id, calfExpenseForm.expense_date);
                          return { label: `${food.name} (${currency(foodSnapshot?.unit_rate || 0)}/${foodSnapshot?.unit_type_snapshot === 'liter' ? 'L' : 'kg'})`, value: food.id };
                        })} />
                        <Input label="Quantity" type="number" value={calfExpenseForm.quantity_kg} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, quantity_kg: value, amount: value !== '' && value !== null && value !== undefined ? Number((Number(value || 0) * Number(prev.unit_rate || 0)).toFixed(2)) : '' }))} />
                        <Input label={`Rate / ${calfExpenseForm.unit_type_snapshot === 'liter' ? 'L' : 'kg'}`} type="number" value={calfExpenseForm.unit_rate} onChange={() => {}} disabled />
                        <Input label="Amount" type="number" value={calfExpenseForm.amount} onChange={() => {}} disabled />
                      </>
                    ) : (
                      <>
                        <SelectInput label="Common category" value={calfExpenseForm.category_id} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, category_id: value }))} options={state.categories.map((category) => ({ label: category.name, value: category.id }))} />
                        <Input label="Amount" type="number" value={calfExpenseForm.amount} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, amount: value }))} />
                        <Input label="Description" placeholder="medical, rope, care..." value={calfExpenseForm.description} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, description: value }))} />
                        <div />
                      </>
                    )}
                    {calfExpenseForm.expense_type === 'feed'
                      ? <SelectInput label="Morning / Evening" value={calfExpenseForm.entry_shift || 'Morning'} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, entry_shift: value }))} options={shiftOptions} />
                      : <SelectInput label="Payment mode" value={calfExpenseForm.payment_mode} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, payment_mode: value }))} options={paymentModeOptions} />}
                  </div>
                  {calfExpenseForm.expense_type === 'feed' && <TextArea label="Description" placeholder="Optional feed note" value={calfExpenseForm.description} onChange={(value) => setCalfExpenseForm((prev) => ({ ...prev, description: value }))} />}
                  <div className="mt-auto pt-4">
                    <button onClick={saveCalfExpense} className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-500/20">Add calf expense</button>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle title="Calf rearing records" icon={Milk} />
                  <button onClick={exportAllCalfRecordsPdf} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold">PDF</button>
                </div>
                {calfSummaries.length ? (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-white/25 bg-white/50 p-4 backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/35">
                      <div className="mb-3 text-sm font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Calf register</div>
                      <div className="flex flex-wrap gap-2">
                        {calfSummaries.map((calf) => {
                          const active = String(selectedCalfRecord?.id) === String(calf.id);
                          return (
                            <button
                              key={calf.id}
                              onClick={() => setSelectedCalfRecordId(calf.id)}
                              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${active ? 'bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950' : 'border border-white/25 bg-white/70 text-slate-700 hover:-translate-y-0.5 dark:border-white/10 dark:bg-slate-900/55 dark:text-slate-200'}`}
                            >
                              {calf.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedCalfRecord && (
                      <div className="rounded-3xl border border-white/20 bg-white/55 p-4 dark:bg-slate-900/40">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-xl font-black">{selectedCalfRecord.name}</div>
                            <div className="mt-1 text-sm opacity-70">{selectedCalfRecord.breed || 'Breed not added'} • {selectedCalfRecord.status} • {selectedCalfRecord.sourceLabel}</div>
                            <div className="mt-1 text-sm opacity-60">Birth/start: {selectedCalfRecord.birth_date || '—'} • Expected lactation: {selectedCalfRecord.expected_lactation_date || '—'}</div>
                            <div className="mt-1 text-sm opacity-60">Base price: {currency(selectedCalfRecord.purchase_price || 0)} • Paid before transfer: {currency(selectedCalfRecord.paid_amount || 0)} • Previous rearing expense: {currency(selectedCalfRecord.totalExpense || 0)}</div>
                            {selectedCalfRecord.notes && <div className="mt-1 text-sm opacity-60">{selectedCalfRecord.notes}</div>}
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 md:max-w-[420px]">
                            <button onClick={() => editCalf(selectedCalfRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold"><Pencil size={14} />Edit</button>
                            <button onClick={() => exportCalfRecordPdf(selectedCalfRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold">PDF</button>
                            {!selectedCalfRecord.transferred_to_cow_id && <button onClick={() => deleteCalf(selectedCalfRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"><Trash2 size={14} />Delete</button>}
                            {!selectedCalfRecord.transferred_to_cow_id && <button onClick={() => transferCalf(selectedCalfRecord)} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950">Transfer to cows</button>}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <RecordStat title="Total expense" value={currency(selectedCalfRecord.totalExpense || 0)} tone="orange" />
                          <RecordStat title="Food budget" value={currency(selectedCalfRecord.foodExpense || 0)} tone="teal" />
                          <RecordStat title="Other expense" value={currency(selectedCalfRecord.otherExpense || 0)} tone="amber" />
                          <RecordStat title="Transferred" value={selectedCalfRecord.transferred_to_cow_id ? `Yes • ${selectedCalfRecord.transferred_at || ''}` : 'No'} tone={selectedCalfRecord.transferred_to_cow_id ? 'emerald' : 'sky'} />
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-100/70 dark:bg-slate-900/50">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Expense</th>
                                <th className="px-3 py-2 text-left">Qty</th>
                                <th className="px-3 py-2 text-left">Shifts</th>
                                <th className="px-3 py-2 text-left">Amount</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-left">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedCalfRecord.expenses.length ? selectedCalfRecord.expenses.map((expense) => (
                                <tr key={expense.id} className="border-t border-white/10">
                                  <td className="px-3 py-2">{expense.expense_date}</td>
                                  <td className="px-3 py-2">{expense.expense_type === 'feed' ? 'Food' : 'Common'}</td>
                                  <td className="px-3 py-2">{expense.food_name || expense.category_name || '—'}</td>
                                  <td className="px-3 py-2">{expense.quantity_kg ? `${Number(expense.quantity_kg).toFixed(2)} ${expense.unit_type === 'liter' ? 'L' : 'kg'}` : '—'}</td>
                                  <td className="px-3 py-2">{expense.expense_type === 'feed' ? (expense.entry_shift || 'Morning') : '—'}</td>
                                  <td className="px-3 py-2 font-semibold">{currency(expense.amount || 0)}</td>
                                  <td className="px-3 py-2">{expense.description || '—'}</td>
                                  <td className="px-3 py-2"><button onClick={() => deleteCalfExpense(expense.id)} className="text-red-500">Delete</button></td>
                                </tr>
                              )) : <tr><td className="px-3 py-3 opacity-60" colSpan="8">No calf expenses yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : <div className="text-sm opacity-70">No calf records yet.</div>}
              </Card>
            </section>
          )}

          {tab === 'cows' && (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <ActionCard icon={TrendingUp} title="Top milk performer" value={dashboard?.cows?.best?.name || '—'} hint={dashboard?.cows?.best ? `${litres(dashboard.cows.best.totalMilk)} recorded • ${dashboard.cows.best.status || 'Lactating'}` : 'No cow production data yet'} tone="emerald" />
                <ActionCard icon={Activity} title="Needs production review" value={dashboard?.cows?.low?.name || '—'} hint={dashboard?.cows?.low ? `${litres(dashboard.cows.low.totalMilk)} recorded • ${dashboard.cows.low.nilDays || 0} nil-yield days` : 'No low-production data yet'} tone="rose" />
              </div>

              <div className="space-y-4">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <SectionTitle title={cowEditingId ? 'Edit cow profile' : 'Add cow profile'} icon={Milk} />
                    {cowEditingId && <button onClick={resetCowForm} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm"><X size={14} />Cancel</button>}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="Cow name / ID" value={cowForm.name} onChange={(value) => setCowForm({ ...cowForm, name: value })} />
                    <Input label="Breed or line" value={cowForm.breed} onChange={(value) => setCowForm({ ...cowForm, breed: value })} />
                    <Input label="Age / stage" value={cowForm.age} onChange={(value) => setCowForm({ ...cowForm, age: value })} />
                    <SelectInput label="Lifecycle status" value={cowForm.status} onChange={(value) => setCowForm({ ...cowForm, status: value })} options={cowStatusOptions} />
                    <Input label="Status updated on" type="date" value={cowForm.status_date} onChange={(value) => setCowForm({ ...cowForm, status_date: value })} />
                  </div>
                  <TextArea label="Notes" placeholder="Health, breeding, sale, or retirement remarks" value={cowForm.notes} onChange={(value) => setCowForm({ ...cowForm, notes: value })} />
                  <button onClick={saveCow} className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 font-bold text-slate-950">{cowEditingId ? 'Update Cow' : 'Save Cow'}</button>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                      <SectionTitle title="Cow records" icon={Milk} />
                      <button onClick={() => downloadAllCowsPdf(cowRecordSummaries)} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:shadow-xl"><Printer size={14} />PDF</button>
                    </div>
                  {cowRecordSummaries.length ? (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/30 bg-white/70 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/45">
                        <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">All cows</div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          {cowRecordSummaries.map((cow) => {
                            const active = String(selectedCowRecord?.id) === String(cow.id);
                            const isLactating = (cow.status || 'Lactating') === 'Lactating';
                            return (
                                <button
                                key={cow.id}
                                onClick={() => { setSelectedCowRecordId(cow.id); loadCowHistory(cow.id); }}
                                className={`w-full rounded-2xl border px-4 py-3 text-left transition backdrop-blur-lg ${active ? (isLactating ? 'border-emerald-300/80 bg-white/82 text-slate-900 shadow-[0_14px_28px_rgba(16,185,129,0.14)] dark:border-emerald-400/30 dark:bg-slate-900/85 dark:text-white' : 'border-red-300/80 bg-white/82 text-slate-900 shadow-[0_14px_28px_rgba(239,68,68,0.14)] dark:border-red-400/30 dark:bg-slate-900/85 dark:text-white') : 'border-white/35 bg-white/62 text-slate-800 hover:bg-white/82 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900'}`}
                              >
                                <div className="font-bold">{cow.name}</div>
                                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{litres(cow.totalMilk)} • {cow.status || 'Lactating'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {selectedCowRecord && (
                        <div className="rounded-3xl border border-white/35 bg-white/78 p-5 shadow-[0_22px_50px_rgba(15,23,42,0.1)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{selectedCowRecord.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${(selectedCowRecord.status || 'Lactating') === 'Lactating' ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300'}`}>
                                  {selectedCowRecord.status || 'Lactating'}
                                </span>
                                {selectedCowRecord.breed && <span className="truncate text-slate-500 dark:text-slate-300">{selectedCowRecord.breed}</span>}
                                {selectedCowRecord.age && <span className="shrink-0 text-slate-500 dark:text-slate-300">• {selectedCowRecord.age}</span>}
                                {!selectedCowRecord.breed && !selectedCowRecord.age && <span className="italic text-slate-500 dark:text-slate-300">No additional details</span>}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Status date: {selectedCowRecord.status_date || '—'}</div>
                              {selectedCowRecord.notes && <div className="mt-2 text-sm italic text-slate-600 dark:text-slate-300">{selectedCowRecord.notes}</div>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => downloadCowPdf(selectedCowRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"><Printer size={14} />PDF</button>
                              <button onClick={() => editCow(selectedCowRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"><Pencil size={14} />Edit</button>
                              <button onClick={() => deleteCow(selectedCowRecord)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"><Trash2 size={14} />Delete</button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <RecordStat title="Current status" value={selectedCowRecord.status || 'Lactating'} tone={(selectedCowRecord.status || 'Lactating') === 'Lactating' ? 'emerald' : 'red'} />
                            <RecordStat title="Total milk" value={litres(selectedCowRecord.totalMilk)} tone="sky" />
                            <RecordStat title="Milk entries" value={selectedCowRecord.recordCount} tone="amber" />
                            <RecordStat title="Last milk date" value={selectedCowRecord.lastRecordedDate || '—'} tone="violet" />
                            <RecordStat title="Feed used" value={`${Number(selectedCowRecord.totalFeedKg || 0).toFixed(2)} ${selectedCowRecord.feedHistory.some((row) => row.unitType === 'liter') ? 'units' : 'kg'}`} tone="teal" />
                            <RecordStat title="Feed budget" value={currency(selectedCowRecord.totalFeedBudget || 0)} tone="orange" />
                          </div>

                          <div className="mt-5 grid gap-4 xl:grid-cols-2">
                            <div className="rounded-3xl border border-white/30 bg-white/72 p-4 backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/45">
                              <div className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Milk history by date</div>
                              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-50/95 dark:bg-slate-900/95">
                                <table className="min-w-full text-sm text-slate-800 dark:text-slate-100">
                                  <thead className="bg-slate-800 text-white dark:bg-slate-900">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Date</th>
                                      <th className="px-3 py-2 text-left">Milk litres</th>
                                      <th className="px-3 py-2 text-left">Shifts</th>
                                      <th className="px-3 py-2 text-left">Entry status</th>
                                      <th className="px-3 py-2 text-left">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedCowRecord.history.length ? selectedCowRecord.history.map((row, index) => (
                                      <tr key={`${row.entryDate}-${index}`} className="border-t border-slate-200/80 dark:border-white/10">
                                        <td className="px-3 py-2">{row.entryDate}</td>
                                        <td className="px-3 py-2 font-semibold">{litres(row.totalLitres)}</td>
                                        <td className="px-3 py-2">{row.entryShift || 'Morning'}</td>
                                        <td className="px-3 py-2">{row.status || 'Recorded'}</td>
                                        <td className="px-3 py-2">{row.notes || '—'}</td>
                                      </tr>
                                    )) : <tr><td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan="5">No milk history recorded yet.</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="rounded-3xl border border-white/30 bg-white/72 p-4 backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/45">
                              <div className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Feed history by date</div>
                              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-50/95 dark:bg-slate-900/95">
                                <table className="min-w-full text-sm text-slate-800 dark:text-slate-100">
                                  <thead className="bg-slate-800 text-white dark:bg-slate-900">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Date</th>
                                      <th className="px-3 py-2 text-left">Food</th>
                                      <th className="px-3 py-2 text-left">Qty</th>
                                      <th className="px-3 py-2 text-left">Shifts</th>
                                      <th className="px-3 py-2 text-left">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedCowRecord.feedHistory.length ? selectedCowRecord.feedHistory.map((row, index) => (
                                      <tr key={`${row.entryDate}-${row.foodName}-${index}`} className="border-t border-slate-200/80 dark:border-white/10">
                                        <td className="px-3 py-2">{row.entryDate}</td>
                                        <td className="px-3 py-2">{row.foodName}</td>
                                        <td className="px-3 py-2">{Number(row.quantityKg || 0).toFixed(2)} {row.unitType === 'liter' ? 'L' : 'kg'}</td>
                                        <td className="px-3 py-2">{row.entryShift || 'Morning'}</td>
                                        <td className="px-3 py-2 font-semibold">{currency(row.amount || 0)}</td>
                                      </tr>
                                    )) : <tr><td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan="5">No feed history recorded yet.</td></tr>}
                                  </tbody>
                                </table>
                               </div>
                             </div>
                           </div>

                           <div className="mt-5 rounded-3xl border border-white/30 bg-white/72 p-4 backdrop-blur-lg dark:border-white/10 dark:bg-slate-950/45">
                             <div className="mb-3 flex items-center justify-between">
                               <div className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Update history</div>
                               {cowHistoryLoading && <div className="text-xs text-slate-500">Loading...</div>}
                             </div>
                             <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-slate-50/95 dark:bg-slate-900/95">
                               {cowHistory.length ? cowHistory.map((entry) => (
                                 <div key={entry.id} className="border-b border-slate-200/80 px-4 py-3 last:border-b-0 dark:border-white/10">
                                   <div className="flex items-center justify-between">
                                     <div className="flex items-center gap-2">
                                       <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                       <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{new Date(entry.updated_at).toLocaleString()}</span>
                                     </div>
                                   </div>
                                   <div className="mt-2 space-y-1.5">
                                     {entry.changes.map((change, i) => (
                                       <div key={i} className="text-xs text-slate-700 dark:text-slate-200">
                                         <span className="font-semibold text-slate-500 dark:text-slate-400">{change.field}:</span>{' '}
                                         <span className="text-red-600 dark:text-red-400 line-through">{change.oldValue}</span>{' '}
                                         <span className="text-slate-400">→</span>{' '}
                                         <span className="font-semibold text-emerald-600 dark:text-emerald-400">{change.newValue}</span>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               )) : (
                                 <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                   {cowHistoryLoading ? 'Loading history...' : 'No update history yet. Changes will appear here when you edit this cow.'}
                                 </div>
                               )}
                             </div>
                           </div>
                         </div>
                      )}
                    </div>
                  ) : <div className="text-sm opacity-70">No cow profiles yet.</div>}
                </Card>
              </div>
            </section>
          )}

          {tab === 'investments' && (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <ActionCard icon={Wallet} title="Active investments" value={activeInvestments.length} hint="Still tracking income recovery" tone="sky" />
                <ActionCard icon={CheckCircle2} title="Finished investments" value={finishedInvestments.length} hint="Already moved to finish area" tone="emerald" />
                <ActionCard icon={CircleDollarSign} title="Pending recovery" value={currency(activeInvestments.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0))} hint="Remaining amount across active items" tone="amber" />
              </div>

              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <SectionTitle title={investmentEditingId ? 'Edit investment' : 'Add investment / import asset'} icon={Wallet} />
                  {investmentEditingId && <button onClick={resetInvestmentForm} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm"><X size={14} />Cancel</button>}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <SelectInput
                    label="Source type"
                    value={investmentForm.source_type}
                    onChange={(value) => {
                      setInvestmentForm((prev) => ({ ...prev, source_type: value, source_id: '' }));
                      if (value === 'manual') {
                        setInvestmentForm(createEmptyInvestmentForm());
                      }
                    }}
                    options={[
                      { label: 'Direct / manual', value: 'manual' },
                      { label: 'Import from cow', value: 'cow' },
                      { label: 'Import from calf', value: 'calf' }
                    ]}
                  />

                  {investmentForm.source_type === 'cow' && (
                    <SelectInput
                      label="Choose cow"
                      value={investmentForm.source_id}
                      onChange={(value) => applyInvestmentSource('cow', value)}
                      options={state.cows.map((cow) => ({ label: `${cow.name}${cow.purchase_price ? ` • ${currency(cow.purchase_price)}` : ' • amount missing'}`, value: cow.id }))}
                    />
                  )}

                  {investmentForm.source_type === 'calf' && (
                    <SelectInput
                      label="Choose calf"
                      value={investmentForm.source_id}
                      onChange={(value) => applyInvestmentSource('calf', value)}
                      options={calfSummaries.map((calf) => ({ label: `${calf.name}${calf.purchase_price || calf.paid_amount ? ` • ${currency(calf.purchase_price || calf.paid_amount)}` : ' • amount missing'}`, value: calf.id }))}
                    />
                  )}

                  <Input label="Investment title" value={investmentForm.title} onChange={(value) => setInvestmentForm((prev) => ({ ...prev, title: value }))} placeholder="Cow purchase, calf batch, machine..." />
                  <Input label="Investment date" type="date" value={investmentForm.investment_date} onChange={(value) => setInvestmentForm((prev) => ({ ...prev, investment_date: value }))} />
                  <Input label="Investment amount" type="number" value={investmentForm.investment_amount} onChange={(value) => setInvestmentForm((prev) => ({ ...prev, investment_amount: value }))} placeholder="Enter amount" />
                </div>
                <TextArea label="Notes" placeholder="Optional remarks" value={investmentForm.notes} onChange={(value) => setInvestmentForm((prev) => ({ ...prev, notes: value }))} />
                <button onClick={saveInvestment} className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3 font-bold text-slate-950">{investmentEditingId ? 'Update investment' : 'Save investment'}</button>
              </Card>

              <Card>
                <SectionTitle title="Active investments" icon={TrendingUp} />
                {activeInvestments.length ? (
                  <div className="space-y-3">
                    {activeInvestments.map((investment) => (
                      <div key={investment.id} className="rounded-3xl border border-white/20 bg-white/50 p-4 dark:bg-slate-900/40">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-lg font-bold">{investment.title}</div>
                            <div className="mt-1 text-sm opacity-70">{investment.sourceLabel} • {investment.investment_date} • {currency(investment.investment_amount)}</div>
                            <div className="mt-1 text-sm opacity-65">Recovered {currency(investment.recovered_income)} • Pending {currency(investment.pending_amount)}</div>
                            {investment.notes && <div className="mt-1 text-sm opacity-60">{investment.notes}</div>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => editInvestment(investment)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold"><Pencil size={14} />Edit</button>
                            <button onClick={() => deleteInvestment(investment)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10"><Trash2 size={14} />Delete</button>
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            <span>Income recovery progress</span>
                            <span>{Math.min(100, investment.progress_percent)}%</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${Math.min(100, investment.progress_percent)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm opacity-70">No active investments right now.</div>}
              </Card>

              <Card>
                <SectionTitle title="Finished area" icon={CheckCircle2} />
                {finishedInvestments.length ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100/70 dark:bg-slate-900/50">
                        <tr>
                          <th className="px-3 py-2 text-left">Title</th>
                          <th className="px-3 py-2 text-left">Source</th>
                          <th className="px-3 py-2 text-left">Amount</th>
                          <th className="px-3 py-2 text-left">Completed on</th>
                          <th className="px-3 py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finishedInvestments.map((investment) => (
                          <tr key={investment.id} className="border-t border-white/10">
                            <td className="px-3 py-2 font-semibold">{investment.title}</td>
                            <td className="px-3 py-2">{investment.sourceLabel}</td>
                            <td className="px-3 py-2">{currency(investment.investment_amount)}</td>
                            <td className="px-3 py-2">{investment.completed_on || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => editInvestment(investment)} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-xs font-semibold"><Pencil size={12} />Edit</button>
                                <button onClick={() => deleteInvestment(investment)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10"><Trash2 size={12} />Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="text-sm opacity-70">No finished investments yet.</div>}
              </Card>
            </section>
          )}

          {tab === 'reports' && (
            <section className="min-w-0 space-y-4">
              <div className="sticky top-4 z-30 ml-auto w-full max-w-5xl rounded-[2rem] border border-white/30 bg-white/65 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {reportSections.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => scrollToSection(id)}
                      className="flex items-center gap-3 rounded-2xl border border-white/35 bg-white/70 px-4 py-3 text-left font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-100 dark:hover:bg-slate-900"
                    >
                      <span className="rounded-2xl bg-sky-500/15 p-2 text-sky-600 dark:text-sky-300"><Icon size={16} /></span>
                      <span className="leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Card id="report-filters">
                <SectionTitle title="Report filters" icon={TrendingUp} />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['today', 'Today'],
                    ['month', 'This month'],
                    ['previousMonth', 'Previous month'],
                    ['all', 'All data'],
                    ['custom', 'Custom']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => key === 'custom' ? setReportPreset('custom') : runReport(key)}
                      className={`rounded-2xl px-4 py-3 font-semibold transition ${reportPreset === key ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950' : 'border border-white/20 bg-white/40 dark:bg-slate-900/30'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {reportPreset === 'custom' && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Input label="Start" type="date" value={reportRange.start} onChange={(value) => setReportRange({ ...reportRange, start: value })} />
                    <Input label="End" type="date" value={reportRange.end} onChange={(value) => setReportRange({ ...reportRange, end: value })} />
                    <div className="flex items-end">
                      <button onClick={() => runReport('custom')} className="w-full rounded-2xl border border-white/20 px-4 py-3 font-semibold">Apply custom range</button>
                    </div>
                  </div>
                )}
                <div className="mt-4 rounded-full bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-700 dark:text-sky-300 inline-flex">Active filter: {reportMeta.label}</div>
              </Card>

              {reports && (
                <>
                  <Card id="summary-reports">
                    <SectionTitle title="Summary reports" icon={CalendarDays} />
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard icon={Droplets} label="Report milk" value={litres(reports.summary.milk)} tone="blue" />
                      <StatCard icon={CircleDollarSign} label="Report income" value={currency(reports.summary.income)} tone="green" />
                      <StatCard icon={CircleDollarSign} label="Report expenses" value={currency(reports.summary.expenses)} tone="orange" />
                      <StatCard icon={TrendingUp} label="Report profit" value={currency(reports.summary.profit)} tone={Number(reports.summary.profit) >= 0 ? 'green' : 'red'} />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <InfoBox title="Overview" lines={[`Days covered: ${reports.summary.totalDays || 0}`, `Milk: ${litres(reports.summary.milk)}`, `Profit: ${currency(reports.summary.profit)}`]} />
                      <InfoBox title="Buyer-wise summary" lines={reports.buyerWise.length ? reports.buyerWise.slice(0, 5).map((item) => `${item.name}: ${litres(item.litres)} • ${currency(item.income)}`) : ['No buyer sales in this range']} />
                      <InfoBox title="Expense summary" lines={reports.expenseWise.length ? reports.expenseWise.slice(0, 5).map((item) => `${item.name}: ${currency(item.amount)}`) : ['No expenses in this range']} />
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <ActionCard icon={TrendingUp} title="Best day" value={reportInsights.bestDay ? currency(reportInsights.bestDay.profit) : '—'} hint={reportInsights.bestDay?.entry_date || 'No data'} tone="emerald" />
                      <ActionCard icon={Activity} title="Weakest day" value={reportInsights.weakDay ? currency(reportInsights.weakDay.profit) : '—'} hint={reportInsights.weakDay?.entry_date || 'No data'} tone="rose" />
                      <ActionCard icon={Droplets} title="Avg milk/day" value={litres(reportInsights.avgMilkPerDay)} hint="Average production for this filter" tone="sky" />
                      <ActionCard icon={Wallet} title="Avg rate/L" value={reportInsights.avgRatePerLitre ? currency(reportInsights.avgRatePerLitre) : '—'} hint="Income divided by total milk" tone="amber" />
                    </div>
                  </Card>

                  <Card id="export-reports" className="border border-emerald-300/20 bg-gradient-to-br from-white/55 to-emerald-500/5 dark:from-slate-900/35 dark:to-emerald-500/10">
                    <SectionTitle title="Export reports" icon={NotebookPen} />
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => exportDetailedDailyPdf({ fileName: exportMeta.fileName, title: exportMeta.title, subtitle: exportMeta.subtitle, dailyData: state.dailyData, reportMeta })} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-red-500 to-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:shadow-xl hover:shadow-red-500/30">PDF</button>
                      <button onClick={() => exportBusinessRegisterExcel(exportMeta.fileName, { title: exportMeta.title, table: reportRegisterTable, reportMeta })} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl hover:shadow-emerald-500/30">Excel</button>
                    </div>
                    <p className="mt-4 text-sm opacity-70">PDF: Detailed per-day report with cow, sales, and expense tables. Excel: Business register table with buyer and expense columns.</p>
                  </Card>
                </>
              )}

              <Card id="raw-reports">
                <SectionTitle title="Raw reports / saved daily data" icon={CalendarDays} />
                <div className="space-y-4">
                  {filteredDailyData.length ? filteredDailyData.map((item) => (
                    <SavedEntryCard key={item.entry.id} item={item} onEdit={(entryDate) => { changeTab('daily'); loadDailyEntry(entryDate); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={deleteDailyEntry} />
                  )) : <div className="text-sm opacity-70">No saved entries in this filter.</div>}
                </div>
              </Card>

              <Card id="daily-business-register" className="min-w-0 overflow-hidden">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle title="Daily business register" icon={NotebookPen} />
                  <button onClick={() => setRegisterFullscreen(true)} className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold">Full screen</button>
                </div>
                <p className="mb-4 text-sm opacity-70">Simple table for quick Excel-style viewing.</p>
                <PlainRegisterTable table={reportRegisterTable} />
              </Card>
            </section>
          )}

          {tab === 'settings' && (
            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <SectionTitle title="Common expense categories" icon={Settings2} />
                <div className="mt-4 flex gap-3">
                  <FieldInput placeholder="Add custom category" value={categoryName} onChange={setCategoryName} />
                  <button onClick={saveCategory} className="rounded-2xl bg-slate-950 px-4 py-3 text-white dark:bg-white dark:text-slate-950">Add</button>
                </div>
                <div className="mt-4 space-y-2">
                  {state.categories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm">
                      <div>
                        {category.name} {category.is_default ? <span className="opacity-50">(default)</span> : ''}
                      </div>
                      {!category.is_default && (
                        <button onClick={() => deleteCategory(category)} className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10">Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle title="Food & feed catalogue" icon={Milk} />
                  {foodEditingId && <button onClick={resetFoodForm} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-3 py-2 text-sm"><X size={14} />Cancel</button>}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input label="Name" placeholder="Food / feed name" value={foodForm.name} onChange={(value) => setFoodForm((prev) => ({ ...prev, name: value }))} />
                  <SelectInput label="Unit type" value={foodForm.unit_type || 'kg'} onChange={(value) => setFoodForm((prev) => ({ ...prev, unit_type: value }))} options={[{ label: 'Kilogram (kg)', value: 'kg' }, { label: 'Liter (L)', value: 'liter' }]} />
                  <FieldInput placeholder={`Purchase ${foodForm.unit_type === 'liter' ? 'liters (example 50)' : 'kg (example 50)'}`} type="number" value={foodForm.purchase_kg} onChange={(value) => setFoodForm((prev) => ({ ...prev, purchase_kg: value }))} />
                  <FieldInput placeholder="Purchase amount" type="number" value={foodForm.purchase_amount} onChange={(value) => setFoodForm((prev) => ({ ...prev, purchase_amount: value }))} />
                  <FieldInput placeholder={`Rate / ${foodForm.unit_type === 'liter' ? 'L' : 'kg'}`} value={foodForm.purchase_kg && foodForm.purchase_amount ? currency(Number(foodForm.purchase_amount || 0) / Number(foodForm.purchase_kg || 1)) : ''} disabled />
                </div>
                <div className="mt-3">
                  <TextArea label="Feed note" placeholder="Optional supplier or quality note" value={foodForm.notes} onChange={(value) => setFoodForm((prev) => ({ ...prev, notes: value }))} />
                </div>
                <button onClick={saveFood} className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 font-bold text-slate-950">{foodEditingId ? 'Update feed item' : 'Add feed item'}</button>

                <div className="mt-4 space-y-2">
                  {state.foods.length ? state.foods.map((food) => (
                    <div key={food.id} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-semibold">{food.name}</div>
                          <div className="opacity-70">{Number(food.purchase_kg || 0).toFixed(2)} {food.unit_type === 'liter' ? 'L' : 'kg'} • {currency(food.purchase_amount || 0)} • {currency(food.rate_per_kg || 0)}/{food.unit_type === 'liter' ? 'L' : 'kg'}</div>
                          <div className="mt-1 text-xs opacity-60">Current price since {food.priceHistory?.[0]?.effective_from ? new Date(food.priceHistory[0].effective_from).toLocaleString() : '—'}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => setExpandedFoodHistoryId((prev) => (prev === food.id ? null : food.id))} className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-300">{expandedFoodHistoryId === food.id ? 'Hide history' : 'History'}</button>
                          <button onClick={() => editFood(food)} className="rounded-2xl border border-white/20 px-3 py-2 text-xs font-semibold">Edit</button>
                          <button onClick={() => deleteFood(food)} className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10">Delete</button>
                        </div>
                      </div>

                      {expandedFoodHistoryId === food.id && (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/45 p-3 dark:bg-slate-900/40">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Price history</div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Timestamp-based history used for old-date feed lookup.</div>
                            </div>
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{food.priceHistory?.length || 0} entries</div>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-white/10">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100/80 dark:bg-slate-900/60">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">When</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Qty</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Amount</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Rate</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Notes</th>
                                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {food.priceHistory?.length ? food.priceHistory.map((historyEntry, historyIndex) => (
                                  <tr key={historyEntry.id} className="border-t border-slate-200/60 dark:border-slate-600/40">
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                                      <div>{historyEntry.effective_from ? new Date(historyEntry.effective_from).toLocaleString() : '—'}</div>
                                      {historyIndex === 0 && <div className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Current</div>}
                                    </td>
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{Number(historyEntry.purchase_quantity || 0).toFixed(2)} {historyEntry.unit_type === 'liter' ? 'L' : 'kg'}</td>
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{currency(historyEntry.purchase_amount || 0)}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{currency(historyEntry.unit_rate || 0)}/{historyEntry.unit_type === 'liter' ? 'L' : 'kg'}</td>
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{historyEntry.notes || '—'}</td>
                                    <td className="px-3 py-2">
                                      <button onClick={() => deleteFoodHistoryEntry(food, historyEntry)} className="rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-400">Delete</button>
                                    </td>
                                  </tr>
                                )) : <tr><td className="px-3 py-3 text-slate-400 dark:text-slate-500" colSpan="6">No history entries yet.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )) : <div className="text-sm opacity-70">No feed items added yet.</div>}
                </div>
              </Card>
            </section>
          )}
        </main>
      </div>

      {registerFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 p-3 backdrop-blur-sm md:p-6">
          <div className="flex h-full flex-col rounded-[2rem] border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="display-font text-2xl font-black tracking-tight text-white">Daily business register</h3>
                <p className="mt-1 text-sm text-slate-300">Scroll freely across the full table.</p>
              </div>
              <button onClick={() => setRegisterFullscreen(false)} className="rounded-2xl border border-slate-500 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <PlainRegisterTable table={reportRegisterTable} fullScreen />
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-5 z-40 rounded-full border border-white/25 bg-white/75 px-4 py-3 text-sm font-bold text-slate-900 shadow-xl backdrop-blur transition-all hover:scale-105 md:bottom-28 md:right-6 dark:border-white/10 dark:bg-slate-950/75 dark:text-white"
        >
          ↑ Top
        </button>
      )}

      <AnimatePresence>
        {tab !== 'daily' && !registerFullscreen && (
          <motion.button
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => changeTab('daily')}
            className="fixed bottom-5 right-5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-3.5 text-sm font-black text-slate-950 shadow-2xl shadow-emerald-500/25 md:bottom-6 md:right-6 md:px-5 md:py-4 md:text-base"
          >
            + Daily Entry
          </motion.button>
        )}
      </AnimatePresence>
      {message && <div className="glass fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium">{message}</div>}
    </div>
  );
}

function getExportMeta(reportPreset, reportMeta) {
  const parseDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };

  const startDate = parseDate(reportMeta.start);
  const endDate = parseDate(reportMeta.end);

  if (reportPreset === 'today' && startDate) {
    const label = format(startDate, 'yyyy-MM-dd');
    return {
      fileName: `${label}_milk-business-report`,
      title: 'Milk Business Report',
      subtitle: `Today • ${label}`
    };
  }

  if ((reportPreset === 'month' || reportPreset === 'previousMonth') && startDate) {
    const monthLabel = format(startDate, 'MMMM yyyy');
    return {
      fileName: `${monthLabel}_milk-business-report`,
      title: 'Milk Business Report',
      subtitle: reportPreset === 'month' ? `This month • ${monthLabel}` : `Previous month • ${monthLabel}`
    };
  }

  if (reportPreset === 'all') {
    return {
      fileName: 'all-data_milk-business-report',
      title: 'Milk Business Report',
      subtitle: 'All data'
    };
  }

  const startLabel = startDate ? format(startDate, 'yyyy-MM-dd') : 'start';
  const endLabel = endDate ? format(endDate, 'yyyy-MM-dd') : 'end';
  return {
    fileName: `${startLabel}_to_${endLabel}_milk-business-report`,
    title: 'Milk Business Report',
    subtitle: `${reportMeta.label} • ${startLabel} to ${endLabel}`
  };
}

function isDateInRange(entryDate, start, end) {
  if (start && entryDate < start) return false;
  if (end && entryDate > end) return false;
  return true;
}

function filterDailyDataByRange(items, start, end) {
  return items.filter((item) => isDateInRange(item.entry.entry_date, start, end));
}

function getExpenseDisplayName(expense) {
  return (expense?.expense_type || 'common') === 'feed' ? (expense.food_name || 'Feed') : (expense?.category_name || 'Other expense');
}

function buildRegisterRows(items) {
  const expenseNames = Array.from(new Set(items.flatMap((item) => item.expenses.map((expense) => getExpenseDisplayName(expense))))).slice(0, 4);

  return items.map((item) => {
    const orderedSales = [...(item.milkSales || [])].sort((a, b) => Number(b.litres || 0) - Number(a.litres || 0)).slice(0, 3);
    const remainingInfo = parseStoredNotes(item.entry.notes);
    const row = {
      date: item.entry.entry_date,
      total_milk_l: Number(item.entry.total_milk_litres || 0),
      sold_milk_l: Number((item.milkSales || []).reduce((sum, sale) => sum + Number(sale.litres || 0), 0).toFixed(2)),
      remaining_milk_l: Number(item.entry.remaining_milk_litres || 0)
    };

    for (let i = 0; i < 3; i += 1) {
      const sale = orderedSales[i];
      row[`buyer_${i + 1}`] = sale?.buyer_name || '—';
      row[`buyer_${i + 1}_litres`] = Number(sale?.litres || 0);
      row[`buyer_${i + 1}_rate`] = Number(sale?.rate_per_litre || 0);
      row[`buyer_${i + 1}_income`] = Number(sale?.income || 0);
    }

    expenseNames.forEach((name) => {
      const total = (item.expenses || [])
        .filter((expense) => getExpenseDisplayName(expense) === name)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      row[`${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_exp`] = Number(total.toFixed(2));
    });

    row.total_expenses = Number(item.entry.total_expenses || 0);
    row.total_income = Number(item.entry.total_income || 0);
    row.profit = Number(item.entry.profit || 0);
    row.remaining_use = remainingInfo.remainingUsage || '—';
    row.note = remainingInfo.generalNotes || remainingInfo.remainingNotes || '—';
    return row;
  });
}

function buildPlainRegisterTable(items) {
  const sortedItems = [...items].sort((a, b) => a.entry.entry_date.localeCompare(b.entry.entry_date));
  const buyerNames = Array.from(new Set(sortedItems.flatMap((item) => (item.milkSales || []).map((sale) => sale.buyer_name || 'Unknown buyer'))));
  const expenseNames = Array.from(new Set(sortedItems.flatMap((item) => (item.expenses || []).map((expense) => getExpenseDisplayName(expense)))));

  const rows = sortedItems.map((item) => {
    const buyers = {};
    const expenses = {};

    (item.milkSales || []).forEach((sale) => {
      const buyerName = sale.buyer_name || 'Unknown buyer';
      if (!buyers[buyerName]) buyers[buyerName] = { litres: 0, income: 0 };
      buyers[buyerName].litres += Number(sale.litres || 0);
      buyers[buyerName].income += Number(sale.income || 0);
    });

    Object.keys(buyers).forEach((buyerName) => {
      const litresValue = Number(buyers[buyerName].litres || 0);
      const incomeValue = Number(buyers[buyerName].income || 0);
      buyers[buyerName].litres = Number(litresValue.toFixed(2));
      buyers[buyerName].income = Number(incomeValue.toFixed(2));
      buyers[buyerName].rate = litresValue ? Number((incomeValue / litresValue).toFixed(2)) : 0;
    });

    (item.expenses || []).forEach((expense) => {
      const expenseName = getExpenseDisplayName(expense);
      expenses[expenseName] = Number(((expenses[expenseName] || 0) + Number(expense.amount || 0)).toFixed(2));
    });

    return {
      date: item.entry.entry_date,
      totalMilk: Number(item.entry.total_milk_litres || 0),
      remainingMilk: Number(item.entry.remaining_milk_litres || 0),
      totalExpenses: Number(item.entry.total_expenses || 0),
      totalIncome: Number(item.entry.total_income || 0),
      profit: Number(item.entry.profit || 0),
      buyers,
      expenses
    };
  });

  return { buyerNames, expenseNames, rows };
}

function buildCowRecordSummaries(cows = [], dailyData = []) {
  return cows.map((cow) => {
    const milkRows = dailyData
      .flatMap((item) => (item.cowEntries || []).map((entry) => ({ entryDate: item.entry.entry_date, ...entry })))
      .filter((entry) => String(entry.cow_id) === String(cow.id))
      .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));

    const feedRows = dailyData
      .flatMap((item) => (item.expenses || []).map((expense) => ({ entryDate: item.entry.entry_date, ...expense })))
      .filter((expense) => (expense.expense_type || 'common') === 'feed' && String(expense.cow_id) === String(cow.id))
      .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));

    const totalMilk = milkRows.reduce((sum, entry) => sum + Number(entry.total_litres || 0), 0);
    const totalFeedKg = feedRows.reduce((sum, row) => sum + Number(row.quantity_kg || 0), 0);
    const totalFeedBudget = feedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lastRecordedDate = milkRows[0]?.entryDate || '';
    const lastFeedDate = feedRows[0]?.entryDate || '';
    return {
      ...cow,
      totalMilk: Number(totalMilk.toFixed(2)),
      totalFeedKg: Number(totalFeedKg.toFixed(2)),
      totalFeedBudget: Number(totalFeedBudget.toFixed(2)),
      lastRecordedDate,
      lastFeedDate,
      recordCount: milkRows.length,
      history: milkRows.map((entry) => ({
        entryDate: entry.entryDate,
        totalLitres: Number(entry.total_litres || 0),
        entryShift: entry.entry_shift || (Number(entry.evening_litres || 0) > 0 ? 'Evening' : 'Morning'),
        status: entry.status || 'Recorded',
        notes: entry.notes || ''
      })),
      feedHistory: feedRows.map((row) => ({
        entryDate: row.entryDate,
        foodName: row.food_name || 'Feed',
        quantityKg: Number(row.quantity_kg || 0),
        unitType: row.unit_type || 'kg',
        unitRate: Number(row.unit_rate || 0),
        amount: Number(row.amount || 0),
        entryShift: row.entry_shift || 'Morning',
        notes: row.description || ''
      }))
    };
  });
}

function buildCalfSummaries(calves = []) {
  return calves.map((item) => {
    const calf = item.calf || item;
    const expenses = item.expenses || [];
    const totalExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const foodExpense = expenses.filter((expense) => expense.expense_type === 'feed').reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const otherExpense = totalExpense - foodExpense;
    return {
      ...calf,
      expenses,
      totalExpense: Number(totalExpense.toFixed(2)),
      foodExpense: Number(foodExpense.toFixed(2)),
      otherExpense: Number(otherExpense.toFixed(2)),
      sourceLabel: calf.source_type === 'purchased' ? 'Purchased young' : 'Raised'
    };
  });
}

function buildInvestmentSummaries(investments = [], cows = [], calves = []) {
  return investments.map((investment) => {
    const linkedCow = investment.source_type === 'cow'
      ? cows.find((cow) => String(cow.id) === String(investment.source_id))
      : null;
    const linkedCalf = investment.source_type === 'calf'
      ? calves.find((calf) => String(calf.id) === String(investment.source_id))
      : null;
    const sourceLabel = investment.source_type === 'cow'
      ? `Cow${linkedCow?.name ? ` • ${linkedCow.name}` : ''}`
      : investment.source_type === 'calf'
        ? `Calf${linkedCalf?.name ? ` • ${linkedCalf.name}` : ''}`
        : 'Manual investment';
    const investmentAmount = Number(investment.investment_amount || 0);
    const recoveredIncome = Number(investment.recovered_income || investment.completed_income_amount || 0);
    const progressPercent = investmentAmount > 0 ? Number(((recoveredIncome / investmentAmount) * 100).toFixed(1)) : 0;

    return {
      ...investment,
      sourceLabel,
      linkedCow,
      linkedCalf,
      investment_amount: investmentAmount,
      recovered_income: recoveredIncome,
      pending_amount: Number(investment.pending_amount || Math.max(investmentAmount - recoveredIncome, 0)),
      progress_percent: Number.isFinite(progressPercent) ? progressPercent : 0
    };
  });
}

function buildReportInsights(reports) {
  if (!reports?.rows?.length) {
    return { bestDay: null, weakDay: null, avgMilkPerDay: 0, avgRatePerLitre: 0 };
  }

  const bestDay = reports.rows.reduce((best, row) => (!best || Number(row.profit || 0) > Number(best.profit || 0) ? row : best), null);
  const weakDay = reports.rows.reduce((worst, row) => (!worst || Number(row.profit || 0) < Number(worst.profit || 0) ? row : worst), null);
  const totalDays = Number(reports.summary?.totalDays || reports.rows.length || 1);
  const avgMilkPerDay = Number(reports.summary?.milk || 0) / totalDays;
  const avgRatePerLitre = Number(reports.summary?.milk || 0) ? Number(reports.summary?.income || 0) / Number(reports.summary.milk || 1) : 0;

  return {
    bestDay,
    weakDay,
    avgMilkPerDay,
    avgRatePerLitre
  };
}

function parseStoredNotes(rawNotes = '') {
  const normalized = String(rawNotes || '').trim();

  if (!normalized) {
    return {
      generalNotes: '',
      remainingUsage: '',
      remainingNotes: ''
    };
  }

  const [generalNotes = '', remainingCombined = ''] = normalized.split(' | ');
  const cleanedGeneralNotes = remainingMilkOptions.includes(generalNotes) ? '' : generalNotes;

  if (!remainingCombined && remainingMilkOptions.includes(generalNotes)) {
    return {
      generalNotes: '',
      remainingUsage: generalNotes,
      remainingNotes: ''
    };
  }

  if (!remainingCombined && remainingMilkOptions.some((option) => normalized.startsWith(`${option} - `))) {
    const matchedOption = remainingMilkOptions.find((option) => normalized.startsWith(`${option} - `));
    return {
      generalNotes: '',
      remainingUsage: matchedOption,
      remainingNotes: normalized.slice((matchedOption || '').length + 3)
    };
  }

  const [remainingUsage = '', ...remainingRest] = remainingCombined ? remainingCombined.split(' - ') : [];
  return {
    generalNotes: cleanedGeneralNotes,
    remainingUsage,
    remainingNotes: remainingRest.join(' - ')
  };
}

function createEmptyInvestmentForm() {
  return {
    source_type: 'manual',
    source_id: '',
    title: '',
    investment_date: today(),
    investment_amount: '',
    notes: ''
  };
}

function createEmptyDailyForm() {
  return {
    entry_date: today(),
    entry_mode: 'direct',
    total_milk_litres: '',
    notes: '',
    remaining_milk_usage: 'Home Use',
    remaining_milk_notes: '',
    cowEntries: [],
    milkSales: [],
    expenses: []
  };
}

function hydrateDailyForm(prev, cows, buyers, categories, foods = []) {
  return {
    ...prev,
    cowEntries: prev.cowEntries?.length ? prev.cowEntries : (prev.entry_mode === 'cows' ? [createCowEntryRow(cows)] : []),
    milkSales: prev.milkSales?.length ? prev.milkSales : [createSaleRow(buyers)],
    expenses: prev.expenses?.length ? prev.expenses : []
  };
}

function createCowEntryRow(cows) {
  return {
    cow_id: cows[0]?.id || '',
    total_litres: '',
    entry_shift: 'Morning',
    status: 'Recorded',
    notes: ''
  };
}

function createSaleRow(buyers) {
  return {
    buyer_id: buyers[0]?.id || '',
    litres: '',
    rate_per_litre: buyers[0]?.default_rate || '',
    payment_status: 'Paid',
    payment_mode: 'Cash',
    notes: ''
  };
}

function getLookupTimestampForDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59`).getTime();
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveFoodSnapshot(foods = [], foodId, atValue) {
  const food = foods.find((item) => String(item.id) === String(foodId));
  if (!food) return null;

  const history = [...(food.priceHistory || [])].sort((a, b) => {
    const timeDiff = new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
    if (timeDiff !== 0) return timeDiff;
    return Number(b.id || 0) - Number(a.id || 0);
  });
  const oldestHistory = [...history].sort((a, b) => {
    const timeDiff = new Date(a.effective_from).getTime() - new Date(b.effective_from).getTime();
    if (timeDiff !== 0) return timeDiff;
    return Number(a.id || 0) - Number(b.id || 0);
  })[0] || null;

  const lookupTimestamp = getLookupTimestampForDate(atValue);
  const selectedHistory = history.find((entry) => {
    const effectiveAt = new Date(entry.effective_from).getTime();
    if (Number.isNaN(effectiveAt)) return false;
    if (lookupTimestamp == null) return true;
    return effectiveAt <= lookupTimestamp;
  }) || oldestHistory || history[0] || null;

  return {
    food_item_id: food.id,
    food_name_snapshot: food.name,
    unit_type_snapshot: selectedHistory?.unit_type || food.unit_type || 'kg',
    unit_rate: Number(selectedHistory?.unit_rate ?? food.rate_per_kg ?? 0),
    food_price_history_id: selectedHistory?.id || null,
    rate_effective_from: selectedHistory?.effective_from || null
  };
}

function createExpenseRow(categories, foods = [], cows = [], expenseType = 'common', entryDate = today()) {
  const selectedFood = foods[0] || null;
  const selectedFoodSnapshot = expenseType === 'feed' ? resolveFoodSnapshot(foods, selectedFood?.id, entryDate) : null;
  return {
    expense_type: expenseType,
    category_id: expenseType === 'common' ? categories[0]?.id || '' : '',
    cow_id: expenseType === 'feed' ? cows[0]?.id || '' : '',
    food_item_id: expenseType === 'feed' ? selectedFood?.id || '' : '',
    food_price_history_id: expenseType === 'feed' ? selectedFoodSnapshot?.food_price_history_id || null : null,
    food_name_snapshot: expenseType === 'feed' ? selectedFoodSnapshot?.food_name_snapshot || selectedFood?.name || '' : '',
    unit_type_snapshot: expenseType === 'feed' ? selectedFoodSnapshot?.unit_type_snapshot || selectedFood?.unit_type || 'kg' : '',
    rate_effective_from: expenseType === 'feed' ? selectedFoodSnapshot?.rate_effective_from || null : null,
    entry_shift: expenseType === 'feed' ? 'Morning' : '',
    quantity_kg: '',
    unit_rate: expenseType === 'feed' ? Number(selectedFoodSnapshot?.unit_rate || 0) : '',
    amount: '',
    description: '',
    payment_mode: 'Cash'
  };
}

function mergeExpenseRows(rows = []) {
  const merged = new Map();
  const preservedFeedRows = [];

  rows.forEach((row, index) => {
    const amount = Number(row.amount || 0);
    const expenseType = row.expense_type || 'common';
    if (expenseType === 'feed') {
      if (!row?.cow_id || !row?.food_item_id || !Number(row.quantity_kg || 0) || row.amount === '' || row.amount === null || row.amount === undefined) return;
      preservedFeedRows.push({
        ...row,
        expense_type: 'feed',
        amount: Number(amount.toFixed(2)),
        entry_shift: row.entry_shift || 'Morning',
        quantity_kg: Number(row.quantity_kg || 0),
        unit_rate: Number(row.unit_rate || 0),
        food_price_history_id: row.food_price_history_id || null,
        food_name_snapshot: row.food_name_snapshot || '',
        unit_type_snapshot: row.unit_type_snapshot || 'kg',
        rate_effective_from: row.rate_effective_from || null
      });
      return;
    }

    if (!row?.category_id || row.amount === '' || row.amount === null || row.amount === undefined) return;

    const paymentMode = (row.payment_mode || 'Cash').trim() || 'Cash';
    const description = (row.description || '').trim();
    const key = `${row.category_id}::${paymentMode.toLowerCase() || `row-${index}`}`;

    if (!merged.has(key)) {
      merged.set(key, {
        ...row,
        amount: Number(amount.toFixed(2)),
        payment_mode: paymentMode,
        description
      });
      return;
    }

    const current = merged.get(key);
    current.amount = Number((Number(current.amount || 0) + amount).toFixed(2));
    current.description = Array.from(new Set([current.description, description].map((value) => value?.trim()).filter(Boolean))).join(' | ');
  });

  return [...Array.from(merged.values()), ...preservedFeedRows];
}

function PlainRegisterTable({ table, fullScreen = false }) {
  if (!table?.rows?.length) {
    return <div className="text-sm opacity-70">No saved data yet for the register table.</div>;
  }

  const formatTableDate = (value) => {
    const parsed = value ? new Date(`${value}T00:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? format(parsed, 'dd-MMM-yy') : value;
  };

  const showNumber = (value, emptyLabel = 'Nil') => (value === undefined || value === null || value === '' ? emptyLabel : Number(value).toFixed(2));
  const cellClass = 'border border-slate-300/80 px-3 py-2 text-right whitespace-nowrap';
  const headClass = 'border border-slate-400/70 px-3 py-2 font-bold whitespace-nowrap';
  const totals = table.rows.reduce((sum, row) => ({
    totalMilk: sum.totalMilk + Number(row.totalMilk || 0),
    remainingMilk: sum.remainingMilk + Number(row.remainingMilk || 0),
    totalExpenses: sum.totalExpenses + Number(row.totalExpenses || 0),
    totalIncome: sum.totalIncome + Number(row.totalIncome || 0),
    profit: sum.profit + Number(row.profit || 0)
  }), { totalMilk: 0, remainingMilk: 0, totalExpenses: 0, totalIncome: 0, profit: 0 });

  return (
    <div className={`w-full max-w-full overflow-x-auto overflow-y-auto rounded-2xl border border-slate-400/70 bg-white dark:border-slate-600 dark:bg-slate-950 ${fullScreen ? 'h-full max-h-full' : 'max-h-[70vh]'}`}>
      <table className="min-w-max border-collapse text-xs text-slate-900 dark:text-slate-100">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-900">
            <th rowSpan={2} className={`${headClass} text-left`}>Date</th>
            <th rowSpan={2} className={headClass}>Total milk</th>
            {table.buyerNames.map((buyerName) => (
              <th key={buyerName} colSpan={3} className={`${headClass} text-center`}>{buyerName}</th>
            ))}
            <th rowSpan={2} className={headClass}>Remaining milk</th>
            {table.expenseNames.map((expenseName) => (
              <th key={expenseName} rowSpan={2} className={headClass}>{expenseName}</th>
            ))}
            <th rowSpan={2} className={headClass}>Total expenses</th>
            <th rowSpan={2} className={headClass}>Total income</th>
            <th rowSpan={2} className={headClass}>Profit</th>
          </tr>
          <tr className="bg-slate-50 dark:bg-slate-900/70">
            {table.buyerNames.flatMap((buyerName) => ([
              <th key={`${buyerName}-litres`} className={`${headClass} font-semibold`}>Litres</th>,
              <th key={`${buyerName}-rate`} className={`${headClass} font-semibold`}>Rate</th>,
              <th key={`${buyerName}-income`} className={`${headClass} font-semibold`}>Income</th>
            ]))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.date} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-950 dark:even:bg-slate-900/50">
              <td className="border border-slate-300/80 px-3 py-2 font-medium whitespace-nowrap">{formatTableDate(row.date)}</td>
              <td className={cellClass}>{showNumber(row.totalMilk)}</td>
              {table.buyerNames.flatMap((buyerName) => ([
                <td key={`${row.date}-${buyerName}-litres`} className={cellClass}>{showNumber(row.buyers[buyerName]?.litres)}</td>,
                <td key={`${row.date}-${buyerName}-rate`} className={cellClass}>{showNumber(row.buyers[buyerName]?.rate)}</td>,
                <td key={`${row.date}-${buyerName}-income`} className={cellClass}>{showNumber(row.buyers[buyerName]?.income)}</td>
              ]))}
              <td className={cellClass}>{showNumber(row.remainingMilk)}</td>
              {table.expenseNames.map((expenseName) => (
                <td key={`${row.date}-${expenseName}`} className={cellClass}>{showNumber(row.expenses[expenseName])}</td>
              ))}
              <td className={cellClass}>{showNumber(row.totalExpenses)}</td>
              <td className={cellClass}>{showNumber(row.totalIncome)}</td>
              <td className={`${cellClass} font-semibold`}>{showNumber(row.profit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-200/80 dark:bg-slate-800/90">
            <td className="border border-slate-400/80 px-3 py-3 text-left font-black whitespace-nowrap">TOTAL</td>
            <td className="border border-slate-400/80 px-3 py-3 text-right font-black whitespace-nowrap">{showNumber(totals.totalMilk)}</td>
            {table.buyerNames.flatMap((buyerName) => ([
              <td key={`total-${buyerName}-litres`} className="border border-slate-400/80 px-3 py-3 text-right font-bold whitespace-nowrap">Nil</td>,
              <td key={`total-${buyerName}-rate`} className="border border-slate-400/80 px-3 py-3 text-right font-bold whitespace-nowrap">Nil</td>,
              <td key={`total-${buyerName}-income`} className="border border-slate-400/80 px-3 py-3 text-right font-bold whitespace-nowrap">Nil</td>
            ]))}
            <td className="border border-slate-400/80 px-3 py-3 text-right font-black whitespace-nowrap">{showNumber(totals.remainingMilk)}</td>
            {table.expenseNames.map((expenseName) => (
              <td key={`total-${expenseName}`} className="border border-slate-400/80 px-3 py-3 text-right font-bold whitespace-nowrap">Nil</td>
            ))}
            <td className="border border-slate-400/80 px-3 py-3 text-right font-black whitespace-nowrap">{showNumber(totals.totalExpenses)}</td>
            <td className="border border-slate-400/80 px-3 py-3 text-right font-black whitespace-nowrap">{showNumber(totals.totalIncome)}</td>
            <td className="border border-slate-400/80 px-3 py-3 text-right font-black whitespace-nowrap">{showNumber(totals.profit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function NavigationLinks({ tab, onSelect }) {
  return (
    <nav className="space-y-2">
      {nav.map(([key, label, Icon]) => (
        <button key={key} onClick={() => onSelect(key)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-medium transition ${tab === key ? 'bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950' : 'hover:bg-white/50 dark:hover:bg-slate-800/60'}`}>
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function FarmAccent() {
  return (
    <motion.div
      initial={{ y: 4 }}
      animate={{ y: [0, -5, 0], rotate: [0, -1, 0.5, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      className="relative h-28 w-36 opacity-95"
    >
      <div className="absolute bottom-0 left-1/2 h-6 w-28 -translate-x-1/2 rounded-full bg-emerald-500/12 blur-xl" />
      <div className="absolute bottom-1 left-1/2 h-10 w-32 -translate-x-1/2 rounded-[999px] bg-gradient-to-t from-emerald-300/40 to-transparent" />
      <motion.div className="absolute bottom-5 left-2 h-10 w-20 rounded-[999px] bg-emerald-400/35" animate={{ scaleX: [1, 1.03, 1] }} transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute bottom-7 left-12 h-9 w-18 rounded-[999px] bg-lime-300/40" animate={{ scaleX: [1, 0.97, 1] }} transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute bottom-8 left-8 h-12 w-14 rounded-[1rem] border border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-100 shadow-[0_12px_24px_rgba(217,119,6,0.12)]" animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="absolute inset-x-3 bottom-0 h-6 rounded-t-[0.6rem] bg-red-400/92" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />
        <div className="absolute left-3 top-4 h-4 w-4 rounded-sm bg-white/92" />
        <div className="absolute right-3 top-4 h-4 w-4 rounded-sm bg-white/92" />
        <div className="absolute left-1/2 bottom-0 h-6 w-3 -translate-x-1/2 rounded-t-md bg-amber-900/60" />
      </motion.div>
      <motion.div className="absolute bottom-9 right-4 h-11 w-1 rounded-full bg-amber-800/55" animate={{ rotate: [0, 2, 0, -2, 0] }} transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }} style={{ originY: '100%' }}>
        <div className="absolute -left-3 top-0 h-5 w-7 rounded-[999px] bg-emerald-400/80" />
        <div className="absolute -left-2 top-3 h-4 w-6 rounded-[999px] bg-emerald-300/75" />
      </motion.div>
      <div className="absolute bottom-4 left-0 flex items-center gap-1.5 opacity-70">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-0.5 w-4 rounded-full bg-white/80" />
        ))}
      </div>
    </motion.div>
  );
}

function FarmSceneArt() {
  return (
    <svg viewBox="0 0 800 100" className="w-full opacity-80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#f0fdf4" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id="barn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient id="fence" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <rect width="800" height="100" fill="url(#sky)" rx="16" />
      <motion.circle cx="680" cy="22" r="14" fill="#fde68a" animate={{ r: [14, 16, 14] }} transition={{ duration: 4, repeat: Infinity }} />
      <motion.circle cx="700" cy="18" r="8" fill="#fef3c7" opacity="0.6" animate={{ r: [8, 10, 8] }} transition={{ duration: 3.5, repeat: Infinity }} />
      <motion.g animate={{ x: [0, 4, 0] }} transition={{ duration: 10, repeat: Infinity }}>
        <path d="M60 28 Q75 20 90 28 Q75 36 60 28Z" fill="white" opacity="0.85" />
        <path d="M75 24 Q90 16 105 24 Q90 32 75 24Z" fill="white" opacity="0.6" />
        <path d="M85 26 Q95 22 105 26 Q95 30 85 26Z" fill="white" opacity="0.5" />
      </motion.g>
      <motion.g animate={{ x: [0, -3, 0] }} transition={{ duration: 8, repeat: Infinity }}>
        <path d="M300 22 Q315 14 330 22 Q315 30 300 22Z" fill="white" opacity="0.75" />
        <path d="M315 18 Q325 12 340 18 Q325 24 315 18Z" fill="white" opacity="0.55" />
      </motion.g>
      <motion.g animate={{ x: [0, 2, 0] }} transition={{ duration: 9, repeat: Infinity }}>
        <path d="M520 20 Q535 12 550 20 Q535 28 520 20Z" fill="white" opacity="0.65" />
        <path d="M535 16 Q545 10 560 16 Q545 22 535 16Z" fill="white" opacity="0.5" />
      </motion.g>
      <motion.g animate={{ x: [0, -2, 0] }} transition={{ duration: 7, repeat: Infinity }}>
        <path d="M430 26 Q440 20 450 26 Q440 32 430 26Z" fill="white" opacity="0.5" />
      </motion.g>
      <path d="M0 65 Q100 58 200 64 Q300 60 400 66 Q500 59 600 65 Q700 61 800 68 L800 100 L0 100Z" fill="url(#grass)" />
      <path d="M0 70 Q200 65 400 72 Q600 67 800 74 L800 100 L0 100Z" fill="#16a34a" opacity="0.3" />
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 3, repeat: Infinity }}>
        <rect x="100" y="38" width="55" height="30" fill="url(#barn)" rx="3" />
        <polygon points="92,38 127,20 162,38" fill="#92400e" />
        <polygon points="97,38 127,24 157,38" fill="#b45309" />
        <rect x="120" y="50" width="14" height="18" fill="#451a03" rx="2" />
        <line x1="127" y1="50" x2="127" y2="68" stroke="#92400e" strokeWidth="1.5" />
        <rect x="108" y="44" width="8" height="8" fill="#fef3c7" rx="1" opacity="0.9" />
        <rect x="144" y="44" width="8" height="8" fill="#fef3c7" rx="1" opacity="0.9" />
      </motion.g>
      <motion.g animate={{ y: [0, -1, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
        <rect x="620" y="42" width="45" height="26" fill="url(#barn)" rx="2" />
        <polygon points="614,42 642,28 670,42" fill="#92400e" />
        <rect x="637" y="52" width="10" height="16" fill="#451a03" rx="1" />
        <line x1="642" y1="52" x2="642" y2="68" stroke="#92400e" strokeWidth="1" />
      </motion.g>
      <g>
        {[200, 210, 220, 230, 240].map((x, i) => (
          <line key={i} x1={x} y1="65" x2={x} y2="55" stroke="url(#fence)" strokeWidth="2" opacity="0.7" />
        ))}
        <line x1="198" y1="58" x2="242" y2="58" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <line x1="198" y1="63" x2="242" y2="63" stroke="white" strokeWidth="1.5" opacity="0.6" />
      </g>
      <g>
        {[260, 270, 280, 290, 300].map((x, i) => (
          <line key={`f2-${i}`} x1={x} y1="65" x2={x} y2="56" stroke="url(#fence)" strokeWidth="2" opacity="0.6" />
        ))}
        <line x1="258" y1="59" x2="302" y2="59" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <line x1="258" y1="63" x2="302" y2="63" stroke="white" strokeWidth="1.5" opacity="0.5" />
      </g>
      {[30, 50, 70, 350, 370, 390, 450, 470, 490, 560, 580].map((x, i) => (
        <motion.g key={`blade-${i}`} animate={{ scaleY: [1, 1.15, 1] }} transition={{ duration: 1.8 + (i % 4) * 0.4, repeat: Infinity }}>
          <line x1={x} y1="68" x2={x} y2="56" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" />
        </motion.g>
      ))}
      {[720, 745].map((x, i) => (
        <g key={`tree-${i}`}>
          <rect x={x + 4} y="50" width="5" height="14" fill="#92400e" rx="1" />
          <ellipse cx={x + 6} cy="44" rx="10" ry="14" fill="#16a34a" />
          <ellipse cx={x + 6} cy="38" rx="8" ry="10" fill="#22c55e" />
          <ellipse cx={x + 6} cy="33" rx="5" ry="7" fill="#4ade80" />
        </g>
      ))}
      {[760, 780].map((x, i) => (
        <g key={`btree-${i}`}>
          <rect x={x + 3} y="52" width="4" height="12" fill="#92400e" rx="1" />
          <ellipse cx={x + 5} cy="46" rx="8" ry="12" fill="#15803d" />
          <ellipse cx={x + 5} cy="40" rx="6" ry="8" fill="#16a34a" />
        </g>
      ))}
      <motion.g animate={{ y: [0, -2, 0] }} transition={{ duration: 4, repeat: Infinity }}>
        <rect x="170" y="60" width="10" height="8" fill="white" rx="3" />
        <rect x="171" y="57" width="8" height="3" fill="#94a3b8" rx="1.5" />
        <rect x="173" y="55" width="4" height="3" fill="#d1d5db" rx="1" />
      </motion.g>
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
        <rect x="184" y="61" width="8" height="7" fill="white" rx="2" />
        <rect x="185" y="58" width="6" height="3" fill="#94a3b8" rx="1.5" />
      </motion.g>
      <motion.g animate={{ y: [0, -1, 0] }} transition={{ duration: 5, repeat: Infinity }}>
        <ellipse cx="500" cy="63" rx="12" ry="8" fill="white" />
        <ellipse cx="496" cy="61" rx="3" ry="3" fill="black" />
        <ellipse cx="504" cy="61" rx="3" ry="3" fill="black" />
        <ellipse cx="500" cy="65" rx="2" ry="1.5" fill="#fca5a5" />
      </motion.g>
      <motion.g animate={{ y: [0, -0.8, 0] }} transition={{ duration: 4.5, repeat: Infinity }}>
        <ellipse cx="520" cy="64" rx="10" ry="7" fill="white" />
        <ellipse cx="517" cy="62" rx="2.5" ry="2.5" fill="black" />
        <ellipse cx="523" cy="62" rx="2.5" ry="2.5" fill="black" />
      </motion.g>
      <motion.g animate={{ x: [0, 1, 0] }} transition={{ duration: 6, repeat: Infinity }}>
        <path d="M400 12 L402 18 L398 18Z" fill="#fbbf24" opacity="0.8" />
        <path d="M410 16 L412 22 L408 22Z" fill="#fbbf24" opacity="0.6" />
      </motion.g>
    </svg>
  );
}

function CowMascot() {
  return (
    <motion.div
      initial={{ y: 6, rotate: -2 }}
      animate={{ y: [0, -7, 0], rotate: [-2, 1.5, -1, -2] }}
      transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
      className="relative"
    >
      <div className="absolute inset-0 rounded-full bg-white/35 blur-2xl" />
      <svg viewBox="0 0 220 220" className="relative h-48 w-48 drop-shadow-[0_18px_30px_rgba(15,23,42,0.18)] md:h-56 md:w-56" aria-hidden="true">
        <defs>
          <linearGradient id="cowBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
          <linearGradient id="cowSpot" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="cowHorn" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <ellipse cx="112" cy="190" rx="56" ry="12" fill="rgba(15,23,42,0.14)" />
        <motion.g animate={{ y: [0, -4, 0, -2, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}>
          <path d="M60 92c0-28 23-51 51-51h8c28 0 51 23 51 51v28c0 31-25 56-56 56h-2c-31 0-56-25-56-56V92z" fill="url(#cowBody)" stroke="#cbd5e1" strokeWidth="3" />
          <path d="M88 46c-4 4-6 10-7 17l8-9 3-14c-2 1-3 3-4 6z" fill="url(#cowHorn)" />
          <path d="M132 46c4 4 6 10 7 17l-8-9-3-14c2 1 3 3 4 6z" fill="url(#cowHorn)" />
          <path d="M79 69c3-10 8-18 15-22" fill="none" stroke="#f8c15b" strokeWidth="5" strokeLinecap="round" />
          <path d="M141 69c-3-10-8-18-15-22" fill="none" stroke="#f8c15b" strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="83" cy="92" rx="17" ry="23" fill="url(#cowSpot)" opacity="0.95" />
          <ellipse cx="144" cy="84" rx="18" ry="16" fill="url(#cowSpot)" opacity="0.92" />
          <ellipse cx="114" cy="126" rx="34" ry="26" fill="#fecdd3" stroke="#f9a8d4" strokeWidth="3" />
          <ellipse cx="100" cy="126" rx="6" ry="9" fill="#fb7185" />
          <ellipse cx="128" cy="126" rx="6" ry="9" fill="#fb7185" />
          <path d="M94 146c8 8 30 8 38 0" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <motion.g animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 5, repeat: Infinity, repeatDelay: 2.5 }}>
            <ellipse cx="95" cy="103" rx="6" ry="8" fill="#0f172a" />
            <ellipse cx="131" cy="103" rx="6" ry="8" fill="#0f172a" />
          </motion.g>
          <circle cx="97" cy="100" r="1.8" fill="#ffffff" />
          <circle cx="133" cy="100" r="1.8" fill="#ffffff" />
          <path d="M57 93c-14 4-22 13-24 27" fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
          <path d="M170 93c14 4 22 13 24 27" fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
          <motion.path d="M171 138c14 5 19 16 14 28" fill="none" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" animate={{ d: ['M171 138c14 5 19 16 14 28', 'M171 138c20 1 24 18 11 29', 'M171 138c10 8 17 19 12 29', 'M171 138c14 5 19 16 14 28'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
          <circle cx="182" cy="167" r="3" fill="#1f2937" />
          <path d="M81 176v20" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
          <path d="M145 176v20" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
        </motion.g>
      </svg>
      <div className="absolute -bottom-2 left-1/2 w-28 -translate-x-1/2 rounded-full border border-white/50 bg-white/75 px-3 py-1 text-center text-xs font-bold uppercase leading-tight tracking-[0.18em] text-slate-600 shadow-sm">
        Farm buddy
      </div>
    </motion.div>
  );
}

const Card = ({ children, className = '', ...props }) => <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} transition={{ duration: 0.22 }} className={`glass premium-card rounded-[2rem] p-5 ${className}`} {...props}>{children}</motion.div>;
const StatCard = ({ icon: Icon, label, value, tone = 'blue', sub }) => (
  <Card>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium opacity-65">{label}</p>
        <h3 className="display-font mt-2 text-3xl font-black tracking-tight">{value}</h3>
        {sub && <p className="mt-2 text-xs opacity-60">{sub}</p>}
      </div>
      <div className={`rounded-2xl p-3 ${tone === 'green' ? 'bg-emerald-500/15 text-emerald-500' : tone === 'red' ? 'bg-red-500/15 text-red-500' : tone === 'orange' ? 'bg-amber-500/15 text-amber-500' : 'bg-sky-500/15 text-sky-500'}`}><Icon size={20} /></div>
    </div>
  </Card>
);
function ActionCard({ icon: Icon, title, value, hint, tone = 'sky' }) {
  const toneMap = {
    emerald: {
      ring: 'border-emerald-200/70 dark:border-emerald-400/20',
      glow: 'bg-emerald-500/10',
      iconWrap: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/16 dark:text-emerald-300',
      title: 'text-emerald-600 dark:text-emerald-300'
    },
    rose: {
      ring: 'border-rose-200/70 dark:border-rose-400/20',
      glow: 'bg-rose-500/10',
      iconWrap: 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/16 dark:text-rose-300',
      title: 'text-rose-600 dark:text-rose-300'
    },
    amber: {
      ring: 'border-amber-200/70 dark:border-amber-400/20',
      glow: 'bg-amber-500/10',
      iconWrap: 'bg-amber-500/12 text-amber-600 dark:bg-amber-500/16 dark:text-amber-300',
      title: 'text-amber-600 dark:text-amber-300'
    },
    sky: {
      ring: 'border-sky-200/70 dark:border-sky-400/20',
      glow: 'bg-sky-500/10',
      iconWrap: 'bg-sky-500/12 text-sky-600 dark:bg-sky-500/16 dark:text-sky-300',
      title: 'text-sky-600 dark:text-sky-300'
    }
  };
  const palette = toneMap[tone] || toneMap.sky;

  return (
    <motion.div whileHover={{ y: -3 }} className={`relative min-h-[162px] overflow-hidden rounded-[1.75rem] border ${palette.ring} bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:bg-slate-900/75`}>
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${palette.glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm font-bold ${palette.title}`}>{title}</div>
          <div className="display-font mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{value}</div>
          <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">{hint}</div>
        </div>
        <div className={`rounded-2xl border border-white/60 p-3 shadow-sm ${palette.iconWrap}`}><Icon size={18} /></div>
      </div>
    </motion.div>
  );
}
function RecordStat({ title, value, tone = 'sky' }) {
  const toneMap = {
    emerald: 'border-emerald-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(16,185,129,0.10)] dark:border-emerald-400/20 dark:bg-slate-900/70 dark:text-emerald-100',
    sky: 'border-sky-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(14,165,233,0.10)] dark:border-sky-400/20 dark:bg-slate-900/70 dark:text-sky-100',
    amber: 'border-amber-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(245,158,11,0.10)] dark:border-amber-400/20 dark:bg-slate-900/70 dark:text-amber-100',
    violet: 'border-violet-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(139,92,246,0.10)] dark:border-violet-400/20 dark:bg-slate-900/70 dark:text-violet-100',
    teal: 'border-teal-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(20,184,166,0.10)] dark:border-teal-400/20 dark:bg-slate-900/70 dark:text-teal-100',
    orange: 'border-orange-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(249,115,22,0.10)] dark:border-orange-400/20 dark:bg-slate-900/70 dark:text-orange-100',
    red: 'border-red-300/70 bg-white/82 text-slate-900 shadow-[0_10px_24px_rgba(239,68,68,0.10)] dark:border-red-400/20 dark:bg-slate-900/70 dark:text-red-100'
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 backdrop-blur-lg ${toneMap[tone] || toneMap.sky}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-base font-black break-words text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}
function FactCard({ title, facts = [], footer = '' }) {
  return (
    <motion.div whileHover={{ y: -3 }} className="rounded-[1.75rem] border border-white/20 bg-slate-800/92 p-4 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
      <div className="display-font text-lg font-black tracking-tight">{title}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{fact.label}</div>
            <div className={`mt-2 min-w-0 break-words text-[1.35rem] font-black leading-tight sm:text-[1.55rem] ${fact.tone === 'rose' ? 'text-rose-300' : fact.tone === 'amber' ? 'text-amber-300' : fact.tone === 'emerald' ? 'text-emerald-300' : 'text-sky-300'}`}>{fact.value}</div>
          </div>
        ))}
      </div>
      {footer && <div className="mt-3 text-xs text-slate-300/90">{footer}</div>}
    </motion.div>
  );
}
function SectionTitle({ title, icon: Icon, dark = false }) { return <div className="mb-4 flex items-center gap-3"><div className={`rounded-2xl p-2 ${dark ? 'bg-white/10 text-white' : 'bg-sky-500/15 text-sky-500'}`}><Icon size={18} /></div><h3 className="display-font text-xl font-black tracking-tight">{title}</h3></div>; }
function ChartWrap({ children }) { return <div className="h-72 w-full"><ResponsiveContainer>{children}</ResponsiveContainer></div>; }
function PanelChart({ title, data, type, dataKey = 'value', color = '#3b82f6', xKey = 'name' }) {
  return <Card><h4 className="display-font mb-4 text-lg font-black tracking-tight">{title}</h4><div className="h-64">{type === 'pie' ? <ResponsiveContainer><PieChart><Pie data={data} dataKey={dataKey} nameKey="name" innerRadius={55} outerRadius={90}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(255,255,255,0.96)', color: '#0f172a' }} /></PieChart></ResponsiveContainer> : type === 'line' ? <ResponsiveContainer><LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" stroke="#94a3b8" opacity={0.28} /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(255,255,255,0.96)', color: '#0f172a' }} /><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 2, fill: color }} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer> : <ResponsiveContainer><BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" stroke="#94a3b8" opacity={0.28} /><XAxis dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(255,255,255,0.96)', color: '#0f172a' }} /><Bar dataKey={dataKey} fill={color} radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer>}</div></Card>;
}
function FieldInput({ value, onChange = () => {}, placeholder = '', type = 'text', disabled = false }) { return <input type={type} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-2xl border px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:bg-slate-900/50 ${disabled ? 'border-slate-300 bg-slate-100 text-slate-700 opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100' : 'border-white/20 bg-white/50'}`} />; }
function Input({ label, value, onChange = () => {}, disabled = false, type = 'text', placeholder = '' }) { return <label className="block"><span className="mb-2 block text-sm font-semibold opacity-70">{label}</span><FieldInput type={type} disabled={disabled} value={value} onChange={onChange} placeholder={placeholder} /></label>; }
function SelectInput({ label, value, onChange = () => {}, options = [] }) { return <label className="block"><span className="mb-2 block text-sm font-semibold opacity-70">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/20 bg-white/50 px-4 py-3 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:bg-slate-900/50">{options.map((option) => typeof option === 'string' ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function TextArea({ label, value, onChange = () => {}, placeholder = '', compact = false }) { return <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold opacity-70">{label}</span><textarea rows={compact ? 2 : 3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/20 bg-white/50 p-3 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:bg-slate-900/50" /></label>; }
function InfoBox({ title, lines }) { return <Card><h4 className="display-font text-lg font-black tracking-tight">{title}</h4><div className="mt-4 space-y-2 text-sm opacity-80">{lines.map((line, index) => <div key={index}>{line}</div>)}</div></Card>; }
function MiniStat({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-white/12 p-4 shadow-inner shadow-black/10"><div className="text-sm font-medium text-slate-300">{label}</div><div className="mt-1 text-2xl font-black text-white">{value}</div></div>; }
function SavedEntryCard({ item, onEdit, onDelete, compact = false }) {
  const remainingInfo = parseStoredNotes(item.entry.notes);
  return (
    <div className="rounded-[1.75rem] border border-white/50 bg-white/70 p-4 shadow-xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-800/60">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xl font-black text-slate-900 dark:text-white">{item.entry.entry_date}</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Milk {litres(item.entry.total_milk_litres)} • Sold {litres(item.milkSales.reduce((sum, sale) => sum + Number(sale.litres || 0), 0))} • Remaining {litres(item.entry.remaining_milk_litres)}</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Income {currency(item.entry.total_income)} • Expenses {currency(item.entry.total_expenses)} • Profit <span className={`rounded-full px-2 py-0.5 font-bold ${Number(item.entry.profit) >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200'}`}>{currency(item.entry.profit)}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onEdit(item.entry.entry_date)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"><Pencil size={14} />Edit</button>
          <button onClick={() => onDelete(item.entry.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm backdrop-blur-sm transition hover:bg-red-100 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-400"><Trash2 size={14} />Delete</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-lg dark:border-slate-600/40 dark:bg-slate-700/40">
          <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Cow-wise production</h4>
          <div className="mt-3 space-y-2">
            {item.cowEntries?.length ? item.cowEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200/50 bg-white/50 px-3 py-3 text-sm shadow-sm backdrop-blur-sm dark:border-slate-600/40 dark:bg-slate-700/30">
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-800 dark:text-slate-100">
                  <span>{entry.cow_name || 'Unknown cow'}</span>
                  <span>{litres(entry.total_litres)}</span>
                </div>
                <div className="mt-1 text-slate-500 dark:text-slate-400">{entry.cow_status || 'Lactating'}{entry.notes ? ` • ${entry.notes}` : ''}</div>
                <div className="mt-1 text-slate-500 dark:text-slate-400">{entry.entry_shift || (Number(entry.evening_litres || 0) > 0 ? 'Evening' : 'Morning')}</div>
              </div>
            )) : <div className="text-sm text-slate-400 dark:text-slate-500">No cow-wise production recorded.</div>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-lg dark:border-slate-600/40 dark:bg-slate-700/40">
          <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Milk sold details</h4>
          <div className="mt-3 space-y-2">
            {item.milkSales.length ? item.milkSales.map((sale) => (
              <div key={sale.id} className="rounded-2xl border border-slate-200/50 bg-white/50 px-3 py-3 text-sm shadow-sm backdrop-blur-sm dark:border-slate-600/40 dark:bg-slate-700/30">
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-800 dark:text-slate-100">
                  <span>{sale.buyer_name}</span>
                  <span>{litres(sale.litres)} × {currency(sale.rate_per_litre)} = {currency(sale.income)}</span>
                </div>
                <div className="mt-1 text-slate-500 dark:text-slate-400">{sale.payment_status} • {sale.payment_mode || 'Cash'}{sale.notes ? ` • ${sale.notes}` : ''}</div>
              </div>
            )) : <div className="text-sm text-slate-400 dark:text-slate-500">No milk sales recorded.</div>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-lg dark:border-slate-600/40 dark:bg-slate-700/40">
          <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Expense details</h4>
          <div className="mt-3 space-y-2">
            {item.expenses.length ? item.expenses.map((expense) => (
              <div key={expense.id} className="rounded-2xl border border-slate-200/50 bg-white/50 px-3 py-3 text-sm shadow-sm backdrop-blur-sm dark:border-slate-600/40 dark:bg-slate-700/30">
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-800 dark:text-slate-100">
                  <span>{getExpenseDisplayName(expense)}</span>
                  <span>{currency(expense.amount)}</span>
                </div>
                <div className="mt-1 text-slate-500 dark:text-slate-400">
                  {(expense.expense_type || 'common') === 'feed'
                    ? `${expense.cow_name || 'Cow'} • ${Number(expense.quantity_kg || 0).toFixed(2)} ${expense.unit_type === 'liter' ? 'L' : 'kg'} • ${currency(expense.unit_rate || 0)}/${expense.unit_type === 'liter' ? 'L' : 'kg'} • ${expense.entry_shift || 'Morning'}`
                    : (expense.payment_mode || 'Cash')}
                  {expense.description ? ` • ${expense.description}` : ''}
                </div>
              </div>
            )) : <div className="text-sm text-slate-400 dark:text-slate-500">No expenses recorded.</div>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/60 bg-white/50 px-4 py-3 text-sm shadow-sm backdrop-blur-sm dark:border-slate-600/40 dark:bg-slate-700/40">
          <div className="font-semibold text-slate-500 dark:text-slate-400">General notes</div>
          <div className="mt-1 text-slate-800 dark:text-slate-100">{remainingInfo.generalNotes || '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/50 px-4 py-3 text-sm shadow-sm backdrop-blur-sm dark:border-slate-600/40 dark:bg-slate-700/40">
          <div className="font-semibold text-slate-500 dark:text-slate-400">Remaining milk usage</div>
          <div className="mt-1 text-slate-800 dark:text-slate-100">{remainingInfo.remainingUsage || '—'}{remainingInfo.remainingNotes ? ` • ${remainingInfo.remainingNotes}` : ''}</div>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 rounded-3xl border border-slate-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-lg dark:border-slate-600/40 dark:bg-slate-700/40">
          <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Raw saved data</h4>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-600/40">
            <table className="min-w-full text-sm">
              <tbody>
                {[
                  ['Entry date', item.entry.entry_date],
                  ['Total milk litres', item.entry.total_milk_litres],
                  ['Remaining milk litres', item.entry.remaining_milk_litres],
                  ['Total income', currency(item.entry.total_income)],
                  ['Total expenses', currency(item.entry.total_expenses)],
                  ['Profit', currency(item.entry.profit)],
                  ['Created at', item.entry.created_at || '—'],
                  ['Updated at', item.entry.updated_at || '—']
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-200/60 last:border-b-0 dark:border-slate-600/40">
                    <td className="bg-slate-100/80 px-4 py-3 font-semibold text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">{label}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Raw cow rows</div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-600/40">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100/80 dark:bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Cow</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Litres</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Shift</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Notes</th>
                </tr>
              </thead>
              <tbody>
                {item.cowEntries?.length ? item.cowEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200/60 dark:border-slate-600/40">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{entry.cow_name || 'Unknown cow'}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{entry.total_litres}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{entry.entry_shift || (Number(entry.evening_litres || 0) > 0 ? 'Evening' : 'Morning')}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{entry.notes || '—'}</td>
                  </tr>
                )) : <tr><td className="px-3 py-3 text-slate-400 dark:text-slate-500" colSpan="4">No cow production rows.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Raw milk sales rows</div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-600/40">
            <table className="min-w-full text-sm">
                  <thead className="bg-slate-100/80 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Buyer</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Litres</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Rate</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Income</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Payment</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.milkSales.length ? item.milkSales.map((sale) => (
                      <tr key={sale.id} className="border-t border-slate-200/60 dark:border-slate-600/40">
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.buyer_name}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.litres}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.rate_per_litre}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.income}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.payment_status} / {sale.payment_mode || 'Cash'}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{sale.notes || '—'}</td>
                      </tr>
                    )) : <tr><td className="px-3 py-3 text-slate-400 dark:text-slate-500" colSpan="6">No milk sales rows.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Raw expense rows</div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-600/40">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100/80 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Cow</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Morning / evening</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.expenses.length ? item.expenses.map((expense) => (
                      <tr key={expense.id} className="border-t border-slate-200/60 dark:border-slate-600/40">
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{getExpenseDisplayName(expense)}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{expense.cow_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{expense.quantity_kg ? `${Number(expense.quantity_kg).toFixed(2)} ${expense.unit_type === 'liter' ? 'L' : 'kg'}` : '—'}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{expense.amount}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{(expense.expense_type || 'common') === 'feed' ? (expense.entry_shift || 'Morning') : (expense.payment_mode || 'Cash')}</td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{expense.description || '—'}</td>
                      </tr>
                    )) : <tr><td className="px-3 py-3 text-slate-400 dark:text-slate-500" colSpan="6">No expense rows.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
