'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiDollarSign, FiTrendingUp, FiRepeat, FiPlus, FiArrowUp, FiCalendar, FiEdit2, FiTrash2, FiAlertTriangle, FiX, FiBell, FiLogOut, FiHome, FiList } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO, subMonths } from 'date-fns';
import TransactionForm from '../../components/TransactionForm';

// Calendar date helpers - treat dates as pure calendar days without timezone conversion
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatCalendarDate(dateStr: string, formatType: 'full' | 'month' | 'day' | 'monthYear'): string {
    // Extract just the date part if it's an ISO timestamp (e.g., "2025-12-20T00:00:00Z")
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);

    switch (formatType) {
        case 'full':
            return `${MONTH_NAMES_SHORT[month - 1]} ${day}, ${year}`;
        case 'month':
            return MONTH_NAMES_SHORT[month - 1];
        case 'day':
            return String(day).padStart(2, '0');
        case 'monthYear':
            return `${MONTH_NAMES_LONG[month - 1]} ${year}`;
        default:
            return datePart;
    }
}

// Format YYYY-MM to readable month/year
function formatMonthYear(monthStr: string, short: boolean = false): string {
    const [year, month] = monthStr.split('-').map(Number);
    const monthName = short ? MONTH_NAMES_SHORT[month - 1] : MONTH_NAMES_LONG[month - 1];
    return `${monthName} ${year}`;
}

// Decode HTML entities (e.g., &amp; -> &, &lt; -> <)
// Uses DOMParser for safe HTML entity decoding without XSS risk
function decodeHtmlEntities(text: string): string {
    if (!text) return text;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return doc.documentElement.textContent || text;
}

// Calculate days left in budget period
function getDaysLeftInPeriod(period: string): number {
    const now = new Date();

    if (period === 'monthly') {
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const daysLeft = Math.ceil((lastDayOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, daysLeft);
    } else if (period === 'weekly') {
        const dayOfWeek = now.getDay();
        const daysUntilSunday = 7 - dayOfWeek;
        return daysUntilSunday;
    } else if (period === 'yearly') {
        const lastDayOfYear = new Date(now.getFullYear(), 11, 31);
        const daysLeft = Math.ceil((lastDayOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, daysLeft);
    }

    return 0;
}

// Calculate total days in budget period
function getTotalDaysInPeriod(period: string): number {
    const now = new Date();

    if (period === 'monthly') {
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    } else if (period === 'weekly') {
        return 7;
    } else if (period === 'yearly') {
        const isLeapYear = (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || (now.getFullYear() % 400 === 0);
        return isLeapYear ? 366 : 365;
    }

    return 30; // default
}

interface SummaryData {
    total_expenses: number;
    total_income: number;
    recurring_expenses: number;
}

interface SpendingCategory {
    category: string;
    amount: number;
}

interface Transaction {
    id: number;
    date: string;
    amount: number;
    category: string;
    category_type: string; // "income" or "expense"
    description: string;
}

interface Budget {
    id: number;
    user_id: number;
    category_id: number;
    category_name: string;
    amount: number;
    period: string;
    alert_threshold: number;
    current_spending: number;
    created_at: string;
}

interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
}

export default function Dashboard() {
    const router = useRouter();
    const { token, initialized, logout } = useAuth();

    // Track auth check is complete
    const [authChecked, setAuthChecked] = useState(false);

    // States
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [spendingData, setSpendingData] = useState<SpendingCategory[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Filters, sorting & pagination
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [filterCategory, setFilterCategory] = useState('');
    const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc'>('date_desc');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]); // Store all transactions
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [jumpToDate, setJumpToDate] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);

    // Swipeable summary cards state (mobile only)
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [touchEndX, setTouchEndX] = useState<number | null>(null);

    // Historical modal state
    const [showHistoricalModal, setShowHistoricalModal] = useState(false);
    const [historicalType, setHistoricalType] = useState<'expenses' | 'income' | 'recurring'>('expenses');
    const [monthlyHistory, setMonthlyHistory] = useState<Array<{month: string; expenses: number; income: number; recurring: number}>>([]);
    const [deleting, setDeleting] = useState(false);
    const [highlightedTransactionId, setHighlightedTransactionId] = useState<number | null>(null);
    const [showUpdatedBadge, setShowUpdatedBadge] = useState(false);

    // Budget state
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [budgetAlerts, setBudgetAlerts] = useState<Budget[]>([]);
    const [showToast, setShowToast] = useState(false);
    const [showOnTrackBudgets, setShowOnTrackBudgets] = useState(false);

    // Transaction update toast
    const [showUpdateToast, setShowUpdateToast] = useState(false);
    const [updateToastMessage, setUpdateToastMessage] = useState('');

    // Transaction modal state
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Helper function to handle API calls with automatic 401 redirect
    const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
        const response = await fetch(url, options);
        if (response.status === 401) {
            // Token expired or invalid - clear and redirect to login
            localStorage.removeItem('jwt_token');
            router.push('/login');
            throw new Error('Session expired. Please log in again.');
        }
        return response;
    };

    // Check auth token on mount and redirect if needed
    useEffect(() => {
        if (!initialized) return;
        if (!token) {
            router.replace('/login');
        } else {
            setAuthChecked(true);
        }
    }, [token, initialized, router]);

    // Refresh data when navigating back from add transaction page
    useEffect(() => {
        if (authChecked && token) {
            // Check if we should refresh (e.g., after adding a transaction)
            const shouldRefresh = sessionStorage.getItem('refreshDashboard');
            if (shouldRefresh === 'true') {
                sessionStorage.removeItem('refreshDashboard');
                setRefreshTrigger(prev => prev + 1);
            }
        }
    }, [authChecked, token]);

    // Refresh data when page becomes visible or focused (e.g., after adding a transaction)
    useEffect(() => {
        function handleVisibilityChange() {
            if (!document.hidden && authChecked && token) {
                setRefreshTrigger(prev => prev + 1);
            }
        }

        function handleFocus() {
            if (authChecked && token) {
                setRefreshTrigger(prev => prev + 1);
            }
        }

        // Save scroll position before leaving page
        function handleBeforeUnload() {
            sessionStorage.setItem('dashboardScrollPosition', window.scrollY.toString());
            if (scrollContainerRef.current) {
                sessionStorage.setItem('transactionHistoryScrollPosition', scrollContainerRef.current.scrollTop.toString());
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [authChecked, token]);

    // Lock body scroll when historical modal is open
    useEffect(() => {
        if (showHistoricalModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showHistoricalModal]);

    // Fetch data whenever token or filters/month changes
    useEffect(() => {
        if (!token || !authChecked) return;

        setLoading(true);
        setError(null);

        async function fetchData() {
            try {
                // 1. Current month summary (includes normalized recurring)
                const summaryRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/summary/current-month`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!summaryRes.ok) throw new Error('Failed to fetch summary');
                const summaryJson = await summaryRes.json();
                setSummary({
                    total_expenses: summaryJson.monthly_expenses || 0,
                    total_income: summaryJson.monthly_income || 0,
                    recurring_expenses: summaryJson.monthly_recurring || 0
                });

                // 2. Fetch monthly history for historical modal
                const historyRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/summary/monthly`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (historyRes.ok) {
                    const historyData = await historyRes.json();
                    // Get last 6 months and calculate recurring for each
                    const last6Months = (historyData || []).slice(0, 6);

                    // Fetch recurring list to calculate monthly recurring for each month
                    const recurringRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/recurring/list`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const recurringList: any[] = recurringRes.ok ? await recurringRes.json() : [];

                    // Calculate normalized recurring (assume it's constant for now)
                    const normalizedRecurring = (Array.isArray(recurringList) ? recurringList : []).reduce((acc, item) => {
                        if (item && item.recurrence && item.amount && item.amount > 0) {
                            switch (item.recurrence) {
                                case 'daily': acc += item.amount * 30; break;
                                case 'weekly': acc += item.amount * 4; break;
                                case 'monthly': acc += item.amount; break;
                                case 'yearly': acc += item.amount / 12; break;
                            }
                        }
                        return acc;
                    }, 0);

                    const history = last6Months.map((m: any) => ({
                        month: m.month,
                        expenses: m.total_expenses || 0,
                        income: m.total_income || 0,
                        recurring: normalizedRecurring
                    }));
                    setMonthlyHistory(history);
                }

                // 3. Spending breakdown by category for current month
                const spendingRes = await fetchWithAuth(
                    `${process.env.NEXT_PUBLIC_API_URL}/summary/category/monthly?year=${selectedMonth.slice(0, 4)}&month=${parseInt(selectedMonth.slice(5, 7))}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!spendingRes.ok) throw new Error('Failed to fetch spending breakdown');
                const spendingJson = await spendingRes.json();
                setSpendingData(
                    Array.isArray(spendingJson)
                        ? spendingJson.map((item: any) => ({
                            category: item.category || 'Unknown',
                            amount: item.total || 0,
                        }))
                        : []
                );

                // 4. Transactions list with filtering/sorting - Fetch ALL transactions
                const params = new URLSearchParams({
                    month: selectedMonth,
                    sort: sortOrder,
                    limit: '1000', // High limit to get all transactions
                });

                const txRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/transactions/search?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!txRes.ok) throw new Error('Failed to fetch transactions');
                const txData = await txRes.json();

                // Ensure no duplicates in initial load
                const txArray = txData.transactions || [];
                const uniqueTransactions = Array.isArray(txArray)
                    ? txArray.filter((tx: Transaction, index: number, self: Transaction[]) =>
                        index === self.findIndex((t: Transaction) => t.id === tx.id)
                    )
                    : [];

                // Sort transactions based on current sortOrder
                const sortedTransactions = [...uniqueTransactions].sort((a, b) => {
                    const dateA = new Date(a.date).getTime();
                    const dateB = new Date(b.date).getTime();
                    return sortOrder === 'date_desc' ? dateB - dateA : dateA - dateB;
                });

                // Store all transactions
                setAllTransactions(sortedTransactions);
                setTransactions(sortedTransactions);
                setPage(1);
                // No pagination - we fetch all transactions at once
                setHasMore(false);

                // 5. Fetch budgets
                const budgetsRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/budget/list`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (budgetsRes.ok) {
                    const budgetsData = await budgetsRes.json();
                    const budgetsList = budgetsData.success ? (budgetsData.budgets || []) : [];
                    setBudgets(budgetsList);

                    // Filter budgets that have exceeded their alert threshold
                    const alerts = budgetsList.filter((b: Budget) => {
                        const progress = (b.current_spending / b.amount) * 100;
                        return progress >= b.alert_threshold;
                    });
                    setBudgetAlerts(alerts);

                    // Show toast notification only once per session
                    const alertsShown = sessionStorage.getItem('budgetAlertsShown');
                    if (alerts.length > 0 && !alertsShown) {
                        setShowToast(true);
                        sessionStorage.setItem('budgetAlertsShown', 'true');

                        // Auto-dismiss toast after 8 seconds
                        setTimeout(() => setShowToast(false), 8000);
                    } else if (alertsShown) {
                        // If already shown this session, keep toast dismissed
                        setShowToast(false);
                    }
                }
            } catch (err: any) {
                setError(err.message || 'Unknown error');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [token, authChecked, selectedMonth, refreshTrigger]); // Removed sortOrder - will handle client-side

    // Client-side sorting when sortOrder changes
    useEffect(() => {
        const sorted = [...allTransactions].sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'date_desc' ? dateB - dateA : dateA - dateB;
        });
        setAllTransactions(sorted);
    }, [sortOrder]);

    // Client-side filtering when filters change (category and amount range)
    useEffect(() => {
        let filtered = [...allTransactions];

        // Filter by category
        if (filterCategory) {
            filtered = filtered.filter((tx: Transaction) =>
                tx.category.toLowerCase().includes(filterCategory.toLowerCase())
            );
        }

        // Filter by amount range
        if (minAmount) {
            const min = parseFloat(minAmount);
            if (!isNaN(min)) {
                filtered = filtered.filter((tx: Transaction) => Math.abs(tx.amount) >= min);
            }
        }
        if (maxAmount) {
            const max = parseFloat(maxAmount);
            if (!isNaN(max)) {
                filtered = filtered.filter((tx: Transaction) => Math.abs(tx.amount) <= max);
            }
        }

        setTransactions(filtered);
    }, [filterCategory, minAmount, maxAmount, allTransactions]);

    // Smart scroll restoration after transactions are rendered
    useEffect(() => {
        if (loading || transactions.length === 0) return;

        const savedDashboardScroll = sessionStorage.getItem('dashboardScrollPosition');
        const savedTransactionScroll = sessionStorage.getItem('transactionHistoryScrollPosition');
        const editedTransactionId = sessionStorage.getItem('editedTransactionId');
        const originalDate = sessionStorage.getItem('originalTransactionDate');

        // Use setTimeout for better mobile compatibility
        const restoreScroll = () => {
            // Always restore main dashboard scroll
            if (savedDashboardScroll) {
                window.scrollTo({
                    top: parseInt(savedDashboardScroll, 10),
                    behavior: 'instant'
                });
                sessionStorage.removeItem('dashboardScrollPosition');
            }

            // Smart transaction history scroll
            if (editedTransactionId && originalDate) {
                const editedId = parseInt(editedTransactionId, 10);
                const editedTransaction = transactions.find(tx => tx.id === editedId);

                if (editedTransaction) {
                    const dateChanged = editedTransaction.date !== originalDate;

                    if (dateChanged) {
                        // Date changed - smooth scroll to center on edited transaction
                        const transactionElement = scrollContainerRef.current?.querySelector(
                            `[data-transaction-id="${editedId}"]`
                        ) as HTMLElement;

                        if (transactionElement && scrollContainerRef.current) {
                            const containerHeight = scrollContainerRef.current.clientHeight;
                            const elementTop = transactionElement.offsetTop;
                            const elementHeight = transactionElement.clientHeight;
                            const scrollPosition = elementTop - (containerHeight / 2) + (elementHeight / 2);

                            scrollContainerRef.current.scrollTo({
                                top: Math.max(0, scrollPosition),
                                behavior: 'smooth'
                            });

                            setHighlightedTransactionId(editedId);
                            setShowUpdatedBadge(true);
                            setTimeout(() => setShowUpdatedBadge(false), 2000);
                            setTimeout(() => setHighlightedTransactionId(null), 3000);

                            // Show toast for significant date changes (7+ days)
                            const oldDate = new Date(originalDate);
                            const newDate = new Date(editedTransaction.date);
                            const diffDays = Math.ceil(Math.abs(newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));
                            if (diffDays >= 7) {
                                setUpdateToastMessage(
                                    `Transaction moved from ${formatCalendarDate(originalDate, 'full')} to ${formatCalendarDate(editedTransaction.date, 'full')}`
                                );
                                setShowUpdateToast(true);
                                setTimeout(() => setShowUpdateToast(false), 5000);
                            }
                        }
                    } else {
                        // Date unchanged - restore scroll position
                        if (savedTransactionScroll && scrollContainerRef.current) {
                            scrollContainerRef.current.scrollTop = parseInt(savedTransactionScroll, 10);
                        }

                        setHighlightedTransactionId(editedId);
                        setShowUpdatedBadge(true);
                        setTimeout(() => setShowUpdatedBadge(false), 2000);
                        setTimeout(() => setHighlightedTransactionId(null), 1500);
                    }
                }

                // Clean up
                sessionStorage.removeItem('editedTransactionId');
                sessionStorage.removeItem('originalTransactionDate');
                sessionStorage.removeItem('transactionHistoryScrollPosition');
            } else if (savedTransactionScroll && scrollContainerRef.current) {
                // No edit tracked - restore scroll position normally
                scrollContainerRef.current.scrollTop = parseInt(savedTransactionScroll, 10);
                sessionStorage.removeItem('transactionHistoryScrollPosition');
            }
        };

        // Call restoreScroll with a small delay for mobile compatibility
        setTimeout(restoreScroll, 100);
    }, [transactions, loading]);

    // Fetch categories when transaction modal opens
    useEffect(() => {
        if (!token || !showTransactionModal) return;

        async function fetchCategories() {
            try {
                const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/category/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success && data.categories) {
                    setCategories(data.categories);
                }
            } catch (err) {
                console.error('Failed to fetch categories:', err);
            }
        }

        fetchCategories();
    }, [token, showTransactionModal]);

    // Load more handler for pagination
    async function loadMore() {
        if (!token || loadingMore || !hasMore) return;

        setLoadingMore(true);
        setLoadMoreError(null);

        const nextPage = page + 1;
        const params = new URLSearchParams({
            month: selectedMonth,
            category: filterCategory,
            sort: sortOrder,
            page: `${nextPage}`,
            limit: '20', // Explicitly set page size
        });

        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/transactions/search?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                throw new Error('Failed to load more transactions');
            }

            const moreTx = await res.json();
            const moreTxArray = moreTx.transactions || [];
            const newTransactions = Array.isArray(moreTxArray) ? moreTxArray : [];

            // Filter out duplicates by ID before adding
            const existingIds = new Set(transactions.map(tx => tx.id));
            const uniqueNewTransactions = newTransactions.filter(tx => !existingIds.has(tx.id));

            if (uniqueNewTransactions.length > 0) {
                setTransactions((prev) => [...prev, ...uniqueNewTransactions]);
                setPage(nextPage);
            }

            // Set hasMore to false if we got less than 20 new transactions
            setHasMore(uniqueNewTransactions.length === 20);
        } catch (err: any) {
            // Use local error state instead of global error to avoid breaking the page
            setLoadMoreError(err.message || 'Failed to load more transactions. Please try again.');
            console.error('Error loading more transactions:', err);
        } finally {
            setLoadingMore(false);
        }
    }

    // Format currencies nicely
    function formatCurrency(value: number) {
        return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    }

    // Handle scroll in the transaction container
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        setShowScrollTop(target.scrollTop > 200);
    };

    // Scroll to top of transaction list
    const scrollToTop = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Handle edit transaction
    const handleEdit = (transactionId: number) => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction) {
            // Save scroll positions before opening modal
            sessionStorage.setItem('dashboardScrollPosition', window.scrollY.toString());
            if (scrollContainerRef.current) {
                sessionStorage.setItem('transactionHistoryScrollPosition', scrollContainerRef.current.scrollTop.toString());
            }
            setEditingTransaction(transaction);
            setShowTransactionModal(true);
        }
    };

    // Handler to open historical modal
    const openHistoricalModal = (type: 'expenses' | 'income' | 'recurring') => {
        setHistoricalType(type);
        setShowHistoricalModal(true);
    };

    // Swipe handlers for summary cards
    const handleTouchStartCard = (e: React.TouchEvent) => {
        setTouchStartX(e.touches[0].clientX);
        setTouchEndX(e.touches[0].clientX);
    };

    const handleTouchMoveCard = (e: React.TouchEvent) => {
        setTouchEndX(e.touches[0].clientX);
    };

    const handleTouchEndCard = () => {
        if (!touchStartX || !touchEndX) return;

        const distance = touchStartX - touchEndX;
        const threshold = 50;

        if (distance > threshold) {
            // Swipe left - next card (circular)
            setActiveCardIndex((activeCardIndex + 1) % 3);
        } else if (distance < -threshold) {
            // Swipe right - previous card (circular)
            setActiveCardIndex((activeCardIndex - 1 + 3) % 3);
        }

        setTouchStartX(null);
        setTouchEndX(null);
    };

    // Handle delete transaction
    const handleDelete = async (transactionId: number) => {
        if (!token) return;

        setDeleting(true);
        try {
            const formData = new FormData();
            formData.append('id', String(transactionId));

            const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/transaction/delete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to delete transaction');
            }

            // Remove from local state
            setAllTransactions(prev => prev.filter(tx => tx.id !== transactionId));
            setTransactions(prev => prev.filter(tx => tx.id !== transactionId));
            setDeleteConfirm(null);
            setRefreshTrigger(prev => prev + 1); // Refresh summary data
        } catch (err) {
            console.error('Error deleting transaction:', err);
            alert('Failed to delete transaction. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    // Jump to specific date
    const handleJumpToDate = () => {
        if (!jumpToDate || !scrollContainerRef.current) return;

        const targetDate = jumpToDate; // Keep as string for comparison (YYYY-MM-DD)
        const transactionElements = scrollContainerRef.current.querySelectorAll('[data-transaction-date]');

        // Find the transaction with the exact date or closest date
        let foundElement: HTMLElement | null = null;
        let closestDiff = Infinity;

        for (let i = 0; i < transactionElements.length; i++) {
            const element = transactionElements[i] as HTMLElement;
            const txDateStr = element.dataset.transactionDate || '';

            // Check for exact match first
            if (txDateStr === targetDate) {
                foundElement = element;
                break;
            }

            // Otherwise, find the closest date
            const diff = Math.abs(new Date(txDateStr).getTime() - new Date(targetDate).getTime());
            if (diff < closestDiff) {
                closestDiff = diff;
                foundElement = element;
            }
        }

        if (foundElement) {
            foundElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Clear the date input after jumping
            setTimeout(() => setJumpToDate(''), 500);
        }
    };

    // Handlers for month slider (prev/next month)
    function prevMonth() {
        const prev = subMonths(parseISO(selectedMonth + '-01'), 1);
        setSelectedMonth(format(prev, 'yyyy-MM'));
    }
    function nextMonth() {
        const next = subMonths(parseISO(selectedMonth + '-01'), -1);
        if (next > new Date()) return; // disallow future months
        setSelectedMonth(format(next, 'yyyy-MM'));
    }

    // Show loading screen until auth check done or data loading
    if (!authChecked || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
                <div className="bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl p-8 max-w-md w-full border border-white/20">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
                        <p className="text-red-600 mb-6">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 shadow-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                <FiDollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                <span className="hidden sm:inline">MySpendo</span>
                                <span className="sm:hidden">MySpendo</span>
                            </h1>
                        </div>
                        {/* Desktop Navigation - Hidden on Mobile */}
                        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
                            <button
                                onClick={() => router.push('/recurring')}
                                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-1 sm:gap-2"
                                aria-label="Recurring"
                            >
                                <FiRepeat className="w-4 h-4" />
                                <span>Recurring</span>
                            </button>
                            <button
                                onClick={() => router.push('/budgets')}
                                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-1 sm:gap-2 relative"
                                aria-label="Budgets"
                            >
                                <FiDollarSign className="w-4 h-4" />
                                <span>Budgets</span>
                                {budgetAlerts.length > 0 && (
                                    <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full border-2 border-white animate-pulse">
                                        {budgetAlerts.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={logout}
                                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors duration-200"
                                aria-label="Logout"
                            >
                                <FiLogOut className="w-4 h-4" />
                                <span>Logout</span>
                            </button>
                        </div>
                        {/* Mobile Logout Only */}
                        <div className="sm:hidden">
                            <button
                                onClick={logout}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors duration-200"
                                aria-label="Logout"
                            >
                                <FiLogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 sm:pb-8 space-y-8">
                {/* 1. Top Summary Cards */}
                <section>
                    {/* Desktop: Grid Layout */}
                    <div className="hidden md:grid grid-cols-3 gap-6">
                        <Card
                            icon={<FiTrendingUp size={32} />}
                            label="This Month Expenses"
                            value={formatCurrency(summary?.total_expenses || 0)}
                            gradient="from-red-500 to-pink-500"
                            bgGradient="from-red-50 to-pink-50"
                            onClick={() => openHistoricalModal('expenses')}
                        />
                        <Card
                            icon={<FiDollarSign size={32} />}
                            label="This Month Income"
                            value={formatCurrency(summary?.total_income || 0)}
                            gradient="from-green-500 to-emerald-500"
                            bgGradient="from-green-50 to-emerald-50"
                            onClick={() => openHistoricalModal('income')}
                        />
                        <Card
                            icon={<FiRepeat size={32} />}
                            label="Monthly Recurring"
                            value={formatCurrency(summary?.recurring_expenses || 0)}
                            gradient="from-orange-500 to-amber-500"
                            bgGradient="from-orange-50 to-amber-50"
                        />
                    </div>

                    {/* Mobile: Swipeable Cards */}
                    <div className="md:hidden">
                        <div
                            className="relative overflow-hidden"
                            onTouchStart={handleTouchStartCard}
                            onTouchMove={handleTouchMoveCard}
                            onTouchEnd={handleTouchEndCard}
                        >
                            <div
                                className="flex transition-transform duration-300 ease-out"
                                style={{ transform: `translateX(-${activeCardIndex * 100}%)` }}
                            >
                                <div className="w-full flex-shrink-0 px-1">
                                    <Card
                                        icon={<FiTrendingUp size={32} />}
                                        label="This Month Expenses"
                                        value={formatCurrency(summary?.total_expenses || 0)}
                                        gradient="from-red-500 to-pink-500"
                                        bgGradient="from-red-50 to-pink-50"
                                        onClick={() => openHistoricalModal('expenses')}
                                    />
                                </div>
                                <div className="w-full flex-shrink-0 px-1">
                                    <Card
                                        icon={<FiDollarSign size={32} />}
                                        label="This Month Income"
                                        value={formatCurrency(summary?.total_income || 0)}
                                        gradient="from-green-500 to-emerald-500"
                                        bgGradient="from-green-50 to-emerald-50"
                                        onClick={() => openHistoricalModal('income')}
                                    />
                                </div>
                                <div className="w-full flex-shrink-0 px-1">
                                    <Card
                                        icon={<FiRepeat size={32} />}
                                        label="Monthly Recurring"
                                        value={formatCurrency(summary?.recurring_expenses || 0)}
                                        gradient="from-orange-500 to-amber-500"
                                        bgGradient="from-orange-50 to-amber-50"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Dot Indicators */}
                        <div className="flex justify-center gap-2 mt-4">
                            {[0, 1, 2].map((index) => (
                                <button
                                    key={index}
                                    onClick={() => setActiveCardIndex(index)}
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                        activeCardIndex === index
                                            ? 'w-8 bg-indigo-600'
                                            : 'w-2 bg-gray-300'
                                    }`}
                                    aria-label={`Go to card ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* 2. Spending Breakdown Chart */}
                <section className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl p-6 border border-white/20">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 mb-1">Spending Breakdown</h2>
                            <p className="text-sm text-gray-600">{formatMonthYear(selectedMonth)}</p>
                        </div>
                        <div className="flex items-center space-x-2 bg-gray-50 rounded-xl p-1">
                            <button
                                onClick={prevMonth}
                                className="px-4 py-2 rounded-lg hover:bg-white transition-colors duration-200 text-gray-700 font-medium"
                                aria-label="Previous month"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <span className="px-4 py-2 text-sm font-medium text-gray-700 min-w-[120px] text-center">
                                {formatMonthYear(selectedMonth, true)}
                            </span>
                            <button
                                onClick={nextMonth}
                                className="px-4 py-2 rounded-lg hover:bg-white transition-colors duration-200 text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Next month"
                                disabled={subMonths(parseISO(selectedMonth + '-01'), -1) > new Date()}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {spendingData.length === 0 ? (
                        <div className="h-[300px] flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                                </svg>
                                <p>No spending data available for this month</p>
                            </div>
                        </div>
                    ) : (
                        (() => {
                            const totalSpending = spendingData.reduce((sum, item) => sum + item.amount, 0);
                            const maxAmount = Math.max(...spendingData.map(item => item.amount));

                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {spendingData.map((item, index) => {
                                        const percentage = totalSpending > 0 ? (item.amount / totalSpending) * 100 : 0;
                                        const barWidth = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;

                                        // Color palette for different categories
                                        const colors = [
                                            { gradient: 'from-indigo-500 to-purple-600', bg: 'from-indigo-50 to-purple-50', border: 'border-indigo-200' },
                                            { gradient: 'from-pink-500 to-rose-600', bg: 'from-pink-50 to-rose-50', border: 'border-pink-200' },
                                            { gradient: 'from-blue-500 to-cyan-600', bg: 'from-blue-50 to-cyan-50', border: 'border-blue-200' },
                                            { gradient: 'from-emerald-500 to-teal-600', bg: 'from-emerald-50 to-teal-50', border: 'border-emerald-200' },
                                            { gradient: 'from-amber-500 to-orange-600', bg: 'from-amber-50 to-orange-50', border: 'border-amber-200' },
                                            { gradient: 'from-violet-500 to-purple-600', bg: 'from-violet-50 to-purple-50', border: 'border-violet-200' },
                                        ];
                                        const color = colors[index % colors.length];

                                        return (
                                            <div
                                                key={item.category}
                                                className={`bg-gradient-to-br ${color.bg} p-5 rounded-xl border-2 ${color.border} shadow-md hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex-1">
                                                        <h3 className="text-sm font-semibold text-gray-700 mb-1 truncate" title={item.category}>
                                                            {item.category}
                                                        </h3>
                                                        <p className="text-2xl font-bold text-gray-900">
                                                            {formatCurrency(item.amount)}
                                                        </p>
                                                    </div>
                                                    <div className={`p-2 rounded-lg bg-gradient-to-br ${color.gradient} shadow-lg`}>
                                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                        </svg>
                                                    </div>
                                                </div>

                                                {/* Progress bar */}
                                                <div className="mt-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-gray-600">
                                                            {percentage.toFixed(1)}% of total
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-white/50 rounded-full h-2.5 overflow-hidden shadow-inner">
                                                        <div
                                                            className={`h-full bg-gradient-to-r ${color.gradient} rounded-full transition-all duration-500 ease-out`}
                                                            style={{ width: `${barWidth}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()
                    )}
                </section>

                {/* 3. Budget Overview - Status-Based with Time-Aware Info */}
                {budgets.length > 0 && (() => {
                    // Group budgets by status
                    const overBudget = budgets.filter(b => (b.current_spending / b.amount) * 100 >= 100);
                    const warning = budgets.filter(b => {
                        const progress = (b.current_spending / b.amount) * 100;
                        return progress >= b.alert_threshold && progress < 100;
                    });
                    const onTrack = budgets.filter(b => {
                        const progress = (b.current_spending / b.amount) * 100;
                        return progress < b.alert_threshold;
                    });

                    const BudgetCard = ({ budget, status }: { budget: Budget; status: 'over' | 'warning' | 'ontrack' }) => {
                        const progress = Math.min((budget.current_spending / budget.amount) * 100, 100);
                        const remaining = Math.max(0, budget.amount - budget.current_spending);
                        const daysLeft = getDaysLeftInPeriod(budget.period);
                        const totalDays = getTotalDaysInPeriod(budget.period);
                        const daysPassed = totalDays - daysLeft;

                        // Calculate daily burn rates
                        const actualDailyBurn = daysPassed > 0 ? budget.current_spending / daysPassed : 0;
                        const allowedDailyBurn = budget.amount / totalDays;

                        let statusConfig = {
                            bgColor: 'bg-emerald-50',
                            borderColor: 'border-emerald-200',
                            textColor: 'text-emerald-700',
                            progressColor: 'bg-emerald-400',
                            icon: null as React.ReactNode
                        };

                        if (status === 'over') {
                            statusConfig = {
                                bgColor: 'bg-rose-50',
                                borderColor: 'border-rose-200',
                                textColor: 'text-rose-700',
                                progressColor: 'bg-rose-400',
                                icon: <FiAlertTriangle className="w-5 h-5 text-rose-600" />
                            };
                        } else if (status === 'warning') {
                            statusConfig = {
                                bgColor: 'bg-amber-50',
                                borderColor: 'border-amber-200',
                                textColor: 'text-amber-700',
                                progressColor: 'bg-amber-400',
                                icon: <FiAlertTriangle className="w-5 h-5 text-amber-600" />
                            };
                        }

                        return (
                            <div
                                className={`${statusConfig.bgColor} border ${statusConfig.borderColor} rounded-xl p-4 hover:shadow-lg transition-all duration-200`}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900 text-sm mb-1">
                                            {budget.category_name}
                                        </h3>
                                        <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600 capitalize">
                                            {budget.period}
                                        </span>
                                    </div>
                                    {statusConfig.icon}
                                </div>

                                {/* Amount and Progress */}
                                <div className="mb-3">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <span className={`text-2xl font-bold ${statusConfig.textColor}`}>
                                            ${budget.current_spending.toFixed(0)}
                                        </span>
                                        <span className="text-sm text-gray-600">
                                            / ${budget.amount.toFixed(0)}
                                        </span>
                                    </div>

                                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
                                        <div
                                            className={`h-full ${statusConfig.progressColor} transition-all duration-500`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                                        <span>{progress.toFixed(0)}% used</span>
                                        <span className="font-semibold">${remaining.toFixed(0)} left</span>
                                    </div>
                                </div>

                                {/* Time-Aware Information */}
                                <div className="pt-3 border-t border-gray-200/50 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">Days remaining:</span>
                                        <span className="font-semibold text-gray-900">{daysLeft} days</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">Daily spending:</span>
                                        <span className={`font-semibold ${
                                            actualDailyBurn > allowedDailyBurn ? 'text-rose-600' : 'text-emerald-600'
                                        }`}>
                                            ${actualDailyBurn.toFixed(2)}/day
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">Budget allows:</span>
                                        <span className="font-semibold text-gray-900">${allowedDailyBurn.toFixed(2)}/day</span>
                                    </div>
                                </div>
                            </div>
                        );
                    };

                    return (
                        <section className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl p-6 border border-white/20">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-1">Budget Overview</h2>
                                    <p className="text-sm text-gray-600">
                                        {overBudget.length > 0 && <span className="text-rose-600 font-semibold">{overBudget.length} over budget</span>}
                                        {overBudget.length > 0 && warning.length > 0 && <span>, </span>}
                                        {warning.length > 0 && <span className="text-amber-600 font-semibold">{warning.length} need attention</span>}
                                        {(overBudget.length > 0 || warning.length > 0) && onTrack.length > 0 && <span>, </span>}
                                        {onTrack.length > 0 && <span className="text-emerald-600 font-semibold">{onTrack.length} on track</span>}
                                    </p>
                                </div>
                                <button
                                    onClick={() => router.push('/budgets')}
                                    className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all duration-200 border border-indigo-200"
                                >
                                    View All →
                                </button>
                            </div>

                            {/* Over Budget - Always Visible */}
                            {overBudget.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-sm font-bold text-rose-700 mb-3 flex items-center gap-2">
                                        <FiAlertTriangle className="w-4 h-4" />
                                        Over Budget ({overBudget.length})
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {overBudget.map((budget) => (
                                            <BudgetCard key={budget.id} budget={budget} status="over" />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Warning - Always Visible */}
                            {warning.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2">
                                        <FiAlertTriangle className="w-4 h-4" />
                                        Needs Attention ({warning.length})
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {warning.map((budget) => (
                                            <BudgetCard key={budget.id} budget={budget} status="warning" />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* On Track - Collapsible */}
                            {onTrack.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setShowOnTrackBudgets(!showOnTrackBudgets)}
                                        className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2 hover:text-emerald-800 transition-colors"
                                    >
                                        <span className={`transform transition-transform ${showOnTrackBudgets ? 'rotate-90' : ''}`}>
                                            ▶
                                        </span>
                                        On Track ({onTrack.length})
                                    </button>
                                    {showOnTrackBudgets && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {onTrack.map((budget) => (
                                                <BudgetCard key={budget.id} budget={budget} status="ontrack" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })()}

                {/* 4. Transaction History - Desktop Only */}
                <section className="hidden sm:block bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl p-3 sm:p-6 border border-white/20">
                    <div className="mb-3 sm:mb-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-4">
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-0.5 sm:mb-1">Transaction History</h2>
                                <p className="text-xs sm:text-sm text-gray-600">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''} found</p>
                            </div>
                        </div>

                        {/* Search & Filter Controls - Improved Layout */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                            {/* Category Filter */}
                            <div className="relative sm:col-span-2 lg:col-span-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Filter by category"
                                    value={filterCategory}
                                    onChange={e => setFilterCategory(e.target.value)}
                                    className="w-full pl-10 pr-4 py-1.5 sm:py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm"
                                />
                            </div>

                            {/* Jump to Date */}
                            <div className="relative">
                                <input
                                    type="date"
                                    value={jumpToDate}
                                    onChange={e => setJumpToDate(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && jumpToDate) {
                                            handleJumpToDate();
                                        }
                                    }}
                                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 text-sm"
                                    placeholder="Jump to date"
                                />
                                {jumpToDate && (
                                    <button
                                        onClick={handleJumpToDate}
                                        className="absolute inset-y-0 right-2 flex items-center text-indigo-600 hover:text-indigo-800 transition-colors"
                                        title="Jump to date (or press Enter)"
                                    >
                                        <div className="p-1 rounded-md hover:bg-indigo-100 transition-all">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                            </svg>
                                        </div>
                                    </button>
                                )}
                            </div>

                            {/* Amount Range Filter */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400 text-sm font-medium">$</span>
                                </div>
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={minAmount}
                                    onChange={e => setMinAmount(e.target.value)}
                                    className="w-full pl-6 sm:pl-8 pr-2 sm:pr-3 py-1.5 sm:py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm"
                                    step="0.01"
                                    min="0"
                                />
                            </div>

                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400 text-sm font-medium">$</span>
                                </div>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={maxAmount}
                                    onChange={e => setMaxAmount(e.target.value)}
                                    className="w-full pl-6 sm:pl-8 pr-2 sm:pr-3 py-1.5 sm:py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm"
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                        </div>

                        {/* Sort Order - Separate Row */}
                        <div className="mt-2 sm:mt-3 flex justify-end">
                            <select
                                value={sortOrder}
                                onChange={e => setSortOrder(e.target.value as 'date_desc' | 'date_asc')}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 font-medium text-sm"
                            >
                                <option value="date_desc">Newest First</option>
                                <option value="date_asc">Oldest First</option>
                            </select>
                        </div>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="text-center py-12">
                            <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-gray-500 font-medium">No transactions found</p>
                            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or add a new transaction</p>
                        </div>
                    ) : (
                        <div>
                            {/* Scrollable Container */}
                            <div
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="max-h-[600px] overflow-y-auto overflow-x-hidden rounded-xl border-2 border-gray-200 bg-gray-50/50"
                                style={{ scrollBehavior: 'smooth' }}
                            >
                                <div className="divide-y divide-gray-200">
                                    {transactions.map((tx: Transaction, index: number) => {
                                        const isExpense = tx.category_type === 'expense';

                                        return (
                                            <div
                                                key={`${tx.id}-${index}-${tx.date}`}
                                                data-transaction-date={tx.date}
                                                data-transaction-id={tx.id}
                                                className={`group relative px-2 sm:px-4 py-1.5 sm:py-3 transition-all duration-1000 ease-in-out ${
                                                    highlightedTransactionId === tx.id
                                                        ? 'bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-50 border-l-4 border-yellow-500'
                                                        : 'bg-white hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50'
                                                }`}
                                            >
                                                {/* Updated Checkmark on Border */}
                                                {highlightedTransactionId === tx.id && showUpdatedBadge && (
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                )}

                                                {/* Desktop Layout */}
                                                <div className="hidden sm:flex items-center gap-3">
                                                    {/* Compact Date Badge */}
                                                    <div className="flex-shrink-0">
                                                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white shadow-sm">
                                                            <span className="text-[10px] font-semibold uppercase leading-none">
                                                                {formatCalendarDate(tx.date, 'month')}
                                                            </span>
                                                            <span className="text-lg font-bold leading-none mt-0.5">
                                                                {formatCalendarDate(tx.date, 'day')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Transaction Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="text-sm font-semibold text-gray-900 truncate">
                                                                {tx.description ? decodeHtmlEntities(tx.description) : 'No description'}
                                                            </h4>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700">
                                                                {decodeHtmlEntities(tx.category)}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {formatCalendarDate(tx.date, 'full')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Amount */}
                                                    <div className="flex-shrink-0 text-right">
                                                        <div className={`text-lg font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                                            {isExpense ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                                        </div>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex-shrink-0 flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                        <button
                                                            onClick={() => handleEdit(tx.id)}
                                                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-all duration-150"
                                                            title="Edit transaction"
                                                        >
                                                            <FiEdit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm(tx)}
                                                            className="p-2 rounded-lg text-red-600 hover:bg-red-100 transition-all duration-150"
                                                            title="Delete transaction"
                                                        >
                                                            <FiTrash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Mobile Layout */}
                                                <div className="sm:hidden">
                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-xs font-semibold text-gray-900 truncate mb-0.5">
                                                                {tx.description ? decodeHtmlEntities(tx.description) : 'No description'}
                                                            </h4>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                                                                    {decodeHtmlEntities(tx.category)}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500">
                                                                    {formatCalendarDate(tx.date, 'full')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className={`text-sm font-bold flex-shrink-0 ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                                            {isExpense ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleEdit(tx.id)}
                                                            className="flex-1 px-2 py-1 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all duration-150"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm(tx)}
                                                            className="flex-1 px-2 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-150"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                </section>
            </div>

            {/* Delete Confirmation Modal */}
            {/* Historical Modal - Only for Expenses and Income (Last 6 Months) */}
            {showHistoricalModal && monthlyHistory.length > 0 && historicalType !== 'recurring' && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center overflow-hidden"
                    onClick={() => setShowHistoricalModal(false)}
                >
                    <div
                        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            {/* Header */}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900">
                                    {historicalType === 'expenses' && 'Expenses History (Last 6 Months)'}
                                    {historicalType === 'income' && 'Income History (Last 6 Months)'}
                                </h3>
                            </div>

                            {/* Monthly List */}
                            <div className="space-y-3">
                                {monthlyHistory.map((month, index) => {
                                    const value = historicalType === 'expenses' ? month.expenses : month.income;
                                    const prevValue = index < monthlyHistory.length - 1
                                        ? (historicalType === 'expenses' ? monthlyHistory[index + 1].expenses : monthlyHistory[index + 1].income)
                                        : value;

                                    const percentChange = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : 0;
                                    const isIncrease = percentChange > 0;
                                    const isDecrease = percentChange < 0;

                                    return (
                                        <div
                                            key={month.month}
                                            className="flex items-center justify-between p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex-1">
                                                <p className="font-semibold text-gray-900">
                                                    {format(parseISO(month.month + '-01'), 'MMMM yyyy')}
                                                </p>
                                                {index < monthlyHistory.length - 1 && Math.abs(percentChange) > 0.1 && (
                                                    <p className={`text-xs mt-1 ${
                                                        isIncrease ? (historicalType === 'income' ? 'text-green-600' : 'text-red-600')
                                                        : isDecrease ? (historicalType === 'income' ? 'text-red-600' : 'text-green-600')
                                                        : 'text-gray-500'
                                                    }`}>
                                                        {isIncrease ? '↑' : '↓'} {Math.abs(percentChange).toFixed(1)}% vs previous month
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xl font-bold ${
                                                    historicalType === 'expenses' ? 'text-red-600' : 'text-green-600'
                                                }`}>
                                                    {formatCurrency(value)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setShowHistoricalModal(false)}
                                className="w-full mt-6 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold text-gray-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 rounded-full bg-red-100">
                                <FiTrash2 className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Delete Transaction</h3>
                                <p className="text-sm text-gray-600">This action cannot be undone</p>
                            </div>
                        </div>

                        {/* Transaction Details */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                                            {decodeHtmlEntities(deleteConfirm.category)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {deleteConfirm.description ? decodeHtmlEntities(deleteConfirm.description) : 'No description'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-lg font-bold ${
                                        deleteConfirm.category_type === 'income'
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                    }`}>
                                        {deleteConfirm.category_type === 'income' ? '+' : '-'}${Math.abs(deleteConfirm.amount).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                {formatCalendarDate(deleteConfirm.date, 'full')}
                            </p>
                        </div>

                        <p className="text-gray-700 mb-6 text-sm">
                            Are you sure you want to delete this transaction?
                        </p>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="px-4 py-2 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-100 transition-all duration-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm.id)}
                                disabled={deleting}
                                className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scroll to Top Button - Fixed to Viewport */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-20 left-4 sm:bottom-24 sm:left-6 p-3 bg-white border-2 border-indigo-200 text-indigo-600 rounded-full shadow-xl hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 transition-all duration-200 transform hover:scale-110 z-40 animate-fade-in"
                    aria-label="Scroll to top"
                >
                    <FiArrowUp className="w-5 h-5" />
                </button>
            )}

            {/* Floating Add Transaction Button - Desktop Only */}
            <button
                onClick={() => {
                    setEditingTransaction(null);
                    setShowTransactionModal(true);
                }}
                aria-label="Add transaction"
                className="hidden sm:flex fixed bottom-6 right-6 p-5 rounded-full shadow-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 transition-all duration-200 transform hover:scale-110 active:scale-95 z-50 items-center justify-center"
            >
                <FiPlus size={28} />
            </button>

            {/* Toast Notification for Transaction Updates */}
            {showUpdateToast && (
                <div className="fixed top-16 left-4 right-4 sm:top-20 sm:left-auto sm:right-6 max-w-md bg-white rounded-2xl shadow-2xl border-2 border-green-200 p-4 z-50 animate-fade-in">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 p-2 bg-green-100 rounded-full">
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-bold text-gray-900">Transaction Updated</h4>
                                <button
                                    onClick={() => setShowUpdateToast(false)}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                    aria-label="Close notification"
                                >
                                    <FiX className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-700">
                                {updateToastMessage}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification for Budget Alerts */}
            {showToast && budgetAlerts.length > 0 && (
                <div className="fixed top-28 left-4 right-4 sm:top-32 sm:left-auto sm:right-6 max-w-md bg-white rounded-2xl shadow-2xl border-2 border-red-200 p-4 z-50 animate-fade-in">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 p-2 bg-red-100 rounded-full">
                            <FiBell className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-bold text-gray-900">Budget Alert!</h4>
                                <button
                                    onClick={() => setShowToast(false)}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                    aria-label="Close notification"
                                >
                                    <FiX className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-700 mb-3">
                                {budgetAlerts.length === 1
                                    ? `You have 1 budget that has exceeded its alert threshold.`
                                    : `You have ${budgetAlerts.length} budgets that have exceeded their alert thresholds.`
                                }
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setShowToast(false);
                                        router.push('/budgets');
                                    }}
                                    className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                                >
                                    View Budgets
                                </button>
                                <button
                                    onClick={() => setShowToast(false)}
                                    className="px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Transaction Modal */}
            {showTransactionModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                            <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowTransactionModal(false);
                                    setEditingTransaction(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <FiX className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6">
                            {token && (
                                <TransactionForm
                                    token={token}
                                    categories={categories}
                                    setCategories={setCategories}
                                    onSuccess={() => {
                                        // Track edited transaction for smart scrolling
                                        if (editingTransaction) {
                                            sessionStorage.setItem('editedTransactionId', editingTransaction.id.toString());
                                            sessionStorage.setItem('originalTransactionDate', editingTransaction.date);
                                        }

                                        setShowTransactionModal(false);
                                        setEditingTransaction(null);
                                        setRefreshTrigger(prev => prev + 1);
                                    }}
                                    onCancel={() => {
                                        setShowTransactionModal(false);
                                        setEditingTransaction(null);
                                    }}
                                    initialValues={editingTransaction ? {
                                        id: editingTransaction.id,
                                        category_id: undefined,
                                        category_name: editingTransaction.category,
                                        amount: editingTransaction.amount,
                                        description: editingTransaction.description,
                                        date: editingTransaction.date,
                                    } : undefined}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Action Button (FAB) - Mobile Only */}
            <button
                onClick={() => setShowTransactionModal(true)}
                className="sm:hidden fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-full shadow-2xl flex items-center justify-center z-50 transition-all duration-300 active:scale-95 hover:shadow-indigo-500/50"
                aria-label="Add Transaction"
            >
                <FiPlus className="w-7 h-7 text-white" />
            </button>

            {/* Bottom Navigation - Mobile Only */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-2xl z-40">
                <div className="grid grid-cols-4 h-16">
                    {/* Dashboard */}
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="flex flex-col items-center justify-center gap-1 text-indigo-600 transition-colors"
                        aria-label="Dashboard"
                    >
                        <FiHome className="w-5 h-5" />
                        <span className="text-xs font-medium">Home</span>
                    </button>

                    {/* Transactions */}
                    <button
                        onClick={() => router.push('/transactions')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        aria-label="Transactions"
                    >
                        <FiList className="w-5 h-5" />
                        <span className="text-xs font-medium">Transactions</span>
                    </button>

                    {/* Recurring */}
                    <button
                        onClick={() => router.push('/recurring')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        aria-label="Recurring"
                    >
                        <FiRepeat className="w-5 h-5" />
                        <span className="text-xs font-medium">Recurring</span>
                    </button>

                    {/* Budgets */}
                    <button
                        onClick={() => router.push('/budgets')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors relative"
                        aria-label="Budgets"
                    >
                        <FiDollarSign className="w-5 h-5" />
                        <span className="text-xs font-medium">Budgets</span>
                        {budgetAlerts.length > 0 && (
                            <span className="absolute top-1 right-4 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
                                {budgetAlerts.length}
                            </span>
                        )}
                    </button>
                </div>
            </nav>
        </div>
    );
}

function Card({ icon, label, value, gradient, bgGradient, onClick }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    gradient: string;
    bgGradient: string;
    onClick?: () => void;
}) {
    const CardContent = (
        <>
            <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
                    <div className="text-white">{icon}</div>
                </div>
            </div>
            <div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                {onClick && (
                    <p className="text-xs text-gray-400 mt-1">Tap for history</p>
                )}
            </div>
        </>
    );

    if (onClick) {
        return (
            <button
                onClick={onClick}
                className={`w-full text-left bg-gradient-to-br ${bgGradient} p-6 rounded-2xl shadow-lg border border-white/50 backdrop-blur-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 active:scale-95`}
            >
                {CardContent}
            </button>
        );
    }

    return (
        <div className={`bg-gradient-to-br ${bgGradient} p-6 rounded-2xl shadow-lg border border-white/50 backdrop-blur-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1`}>
            {CardContent}
        </div>
    );
}
