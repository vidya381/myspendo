'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiHome, FiRepeat, FiDollarSign, FiList, FiEdit2, FiTrash2, FiArrowUp, FiCalendar, FiX, FiPlus, FiArrowLeft } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import TransactionForm from '../../components/TransactionForm';

interface Transaction {
    id: number;
    user_id: number;
    category: string;
    category_type: 'income' | 'expense';
    amount: number;
    description: string;
    date: string;
    created_at: string;
}

interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
}

type QuickFilter = 'all' | 'expense' | 'income' | 'this_month' | 'last_month';

export default function TransactionsPage() {
    const router = useRouter();
    const { token, initialized } = useAuth();
    const [authChecked, setAuthChecked] = useState(false);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Quick filters
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc'>('date_desc');
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [jumpToDate, setJumpToDate] = useState('');

    // Modal state
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Long press state
    const [showActionMenu, setShowActionMenu] = useState<number | null>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef<boolean>(false);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef<boolean>(false);

    // Details view state
    const [showDetails, setShowDetails] = useState<Transaction | null>(null);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Helper function to handle API calls with automatic 401 redirect
    const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
        const response = await fetch(url, options);
        if (response.status === 401) {
            localStorage.removeItem('jwt_token');
            router.push('/login');
            throw new Error('Session expired. Please log in again.');
        }
        return response;
    };

    // Prevent background scroll when modals are open
    useEffect(() => {
        if (showDetails || showActionMenu || showTransactionModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showDetails, showActionMenu, showTransactionModal]);

    // Auth check
    useEffect(() => {
        if (initialized) {
            setAuthChecked(true);
            if (!token) {
                router.push('/login');
            }
        }
    }, [initialized, token, router]);

    // Fetch categories
    useEffect(() => {
        if (!token) return;

        const fetchCategories = async () => {
            try {
                const res = await fetchWithAuth(`${"/api"}/category/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success && data.categories) {
                    setCategories(data.categories);
                }
            } catch (err) {
                console.error('Failed to fetch categories:', err);
            }
        };

        fetchCategories();
    }, [token]);

    // Fetch transactions
    useEffect(() => {
        if (!token) return;

        const fetchTransactions = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetchWithAuth(`${"/api"}/transaction/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                const data = await res.json();

                if (data.success) {
                    setTransactions(data.transactions || []);
                } else {
                    setError(data.error || 'Failed to fetch transactions');
                }
            } catch (err) {
                setError('Failed to fetch transactions');
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    }, [token, refreshTrigger]);

    // Scroll detection
    const handleScroll = () => {
        if (scrollContainerRef.current) {
            setShowScrollTop(scrollContainerRef.current.scrollTop > 200);
        }
    };

    const scrollToTop = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleJumpToDate = () => {
        if (!jumpToDate) return;

        const targetElement = scrollContainerRef.current?.querySelector(
            `[data-transaction-date="${jumpToDate}"]`
        ) as HTMLElement;

        if (targetElement && scrollContainerRef.current) {
            const containerHeight = scrollContainerRef.current.clientHeight;
            const elementTop = targetElement.offsetTop;
            const scrollPosition = elementTop - 20;

            scrollContainerRef.current.scrollTo({
                top: scrollPosition,
                behavior: 'smooth'
            });
        }
    };

    // Filter transactions based on quick filter
    const getFilteredTransactions = () => {
        let filtered = [...transactions];

        // Apply quick filter
        if (quickFilter === 'expense') {
            filtered = filtered.filter(t => t.category_type === 'expense');
        } else if (quickFilter === 'income') {
            filtered = filtered.filter(t => t.category_type === 'income');
        } else if (quickFilter === 'this_month') {
            const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
            const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
            filtered = filtered.filter(t => t.date >= start && t.date <= end);
        } else if (quickFilter === 'last_month') {
            const lastMonth = subMonths(new Date(), 1);
            const start = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
            const end = format(endOfMonth(lastMonth), 'yyyy-MM-dd');
            filtered = filtered.filter(t => t.date >= start && t.date <= end);
        }

        // Apply comprehensive search (description, category, amount)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t => {
                // Search in description (handle null/undefined)
                const descriptionMatch = t.description?.toLowerCase().includes(query) ?? false;
                // Search in category
                const categoryMatch = t.category?.toLowerCase().includes(query) ?? false;
                // Search in amount (e.g., "50" finds $50.00, $150.00, etc.)
                const amountMatch = t.amount?.toString().includes(query) ?? false;

                return descriptionMatch || categoryMatch || amountMatch;
            });
        }

        // Sort
        filtered.sort((a, b) => {
            if (sortOrder === 'date_desc') {
                return b.date.localeCompare(a.date);
            } else {
                return a.date.localeCompare(b.date);
            }
        });

        return filtered;
    };

    const filteredTransactions = getFilteredTransactions();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    const formatCalendarDate = (dateString: string) => {
        const date = parseISO(dateString);
        return format(date, 'MMM dd, yyyy');
    };

    const handleEdit = (transactionId: number) => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction) {
            setEditingTransaction(transaction);
            setShowTransactionModal(true);
        }
    };

    const handleDelete = async (id: number) => {
        setDeleting(true);
        try {
            const formData = new FormData();
            formData.append('id', id.toString());

            const res = await fetchWithAuth(`${"/api"}/transaction/delete`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const data = await res.json();

            if (data.success) {
                setDeleteConfirm(null);
                setRefreshTrigger(prev => prev + 1);
            } else {
                alert(data.error || 'Failed to delete transaction');
            }
        } catch (err) {
            alert('Failed to delete transaction');
        } finally {
            setDeleting(false);
        }
    };

    // Touch handlers for tap and long press
    const handleTouchStart = (e: React.TouchEvent, transaction: Transaction) => {
        isLongPress.current = false;
        hasMoved.current = false;
        touchStartPos.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };

        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowActionMenu(transaction.id);
            // Haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500); // 500ms long press
    };

    const handleTouchEnd = (transaction: Transaction) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        // Only open details if it wasn't a long press AND user didn't move (scroll)
        if (!isLongPress.current && !hasMoved.current) {
            setShowDetails(transaction);
        }

        isLongPress.current = false;
        hasMoved.current = false;
        touchStartPos.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // Check if user moved significantly (more than 10px in any direction)
        if (touchStartPos.current) {
            const deltaX = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
            const deltaY = Math.abs(e.touches[0].clientY - touchStartPos.current.y);

            if (deltaX > 10 || deltaY > 10) {
                hasMoved.current = true;
            }
        }

        // Cancel long press if user moves finger (scrolling)
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const decodeHtmlEntities = (text: string) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    };

    if (!authChecked || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 pb-20 sm:pb-0">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 shadow-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        {/* Desktop Back Button - Hidden on Mobile */}
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                            aria-label="Back to Dashboard"
                        >
                            <FiArrowLeft className="w-4 h-4" />
                            <span>Back to Dashboard</span>
                        </button>
                        {/* Mobile: Show icon + title */}
                        <div className="flex sm:hidden items-center space-x-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                <FiList className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                Transactions
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Quick Filter Chips */}
                <div className="mb-4 flex flex-wrap gap-2">
                    <button
                        onClick={() => setQuickFilter('all')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            quickFilter === 'all'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-indigo-300'
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setQuickFilter('expense')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            quickFilter === 'expense'
                                ? 'bg-red-600 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-red-300'
                        }`}
                    >
                        Expenses
                    </button>
                    <button
                        onClick={() => setQuickFilter('income')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            quickFilter === 'income'
                                ? 'bg-green-600 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-green-300'
                        }`}
                    >
                        Income
                    </button>
                    <button
                        onClick={() => setQuickFilter('this_month')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            quickFilter === 'this_month'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-300'
                        }`}
                    >
                        This Month
                    </button>
                    <button
                        onClick={() => setQuickFilter('last_month')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            quickFilter === 'last_month'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-300'
                        }`}
                    >
                        Last Month
                    </button>
                </div>

                {/* Search & Sort Controls */}
                <div className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl p-3 sm:p-4 border border-white/20 mb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {/* Comprehensive Search */}
                        <div className="relative sm:col-span-2">
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-3 pr-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm"
                            />
                        </div>

                        {/* Sort Order */}
                        <select
                            value={sortOrder}
                            onChange={e => setSortOrder(e.target.value as 'date_desc' | 'date_asc')}
                            className="px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white text-gray-900 font-medium text-sm"
                        >
                            <option value="date_desc">Newest First</option>
                            <option value="date_asc">Oldest First</option>
                        </select>
                    </div>
                </div>

                {/* Transaction List */}
                <div className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl p-3 sm:p-6 border border-white/20">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-600">
                            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''} found
                        </p>
                    </div>

                    {filteredTransactions.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-500 font-medium">No transactions found</p>
                            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or add a new transaction</p>
                        </div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="max-h-[calc(100vh-400px)] overflow-y-auto rounded-xl border-2 border-gray-200 bg-gray-50/50"
                        >
                            <div className="divide-y divide-gray-200">
                                {filteredTransactions.map((tx: Transaction) => {
                                    const isExpense = tx.category_type === 'expense';

                                    return (
                                        <div
                                            key={tx.id}
                                            data-transaction-date={tx.date}
                                            className="group sm:px-4 sm:py-3 bg-white hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-colors"
                                        >
                                            {/* Mobile Layout with Long Press */}
                                            <div className="sm:hidden">
                                                <div
                                                    className="px-2 py-1.5 active:bg-gray-100 transition-colors select-none"
                                                    style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                                                    onTouchStart={(e) => handleTouchStart(e, tx)}
                                                    onTouchEnd={() => handleTouchEnd(tx)}
                                                    onTouchMove={(e) => handleTouchMove(e)}
                                                    onContextMenu={(e) => e.preventDefault()}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-xs font-semibold text-gray-900 truncate mb-0.5">
                                                                {tx.description ? decodeHtmlEntities(tx.description) : 'No description'}
                                                            </h4>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                                                                    {decodeHtmlEntities(tx.category)}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500">
                                                                    {formatCalendarDate(tx.date)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className={`text-sm font-bold flex-shrink-0 ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                                            {isExpense ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Desktop Layout */}
                                            <div className="hidden sm:flex items-center gap-3">
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
                                                            {formatCalendarDate(tx.date)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex-shrink-0 text-right">
                                                    <div className={`text-lg font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                                        {isExpense ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                                    </div>
                                                </div>

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
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Scroll to Top Button */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-20 left-4 sm:bottom-24 sm:left-6 p-3 bg-white border-2 border-indigo-200 text-indigo-600 rounded-full shadow-xl hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 transition-all duration-200 transform hover:scale-110 z-40 animate-fade-in"
                    aria-label="Scroll to top"
                >
                    <FiArrowUp className="w-5 h-5" />
                </button>
            )}

            {/* FAB - Mobile Only */}
            <button
                onClick={() => setShowTransactionModal(true)}
                className="sm:hidden fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-full shadow-2xl flex items-center justify-center z-50 transition-all duration-300 active:scale-95 hover:shadow-indigo-500/50"
                aria-label="Add Transaction"
            >
                <FiPlus className="w-7 h-7 text-white" />
            </button>

            {/* FAB - Desktop Only */}
            <button
                onClick={() => setShowTransactionModal(true)}
                className="hidden sm:flex fixed bottom-6 right-6 p-5 rounded-full shadow-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 transition-all duration-200 transform hover:scale-110 active:scale-95 z-50 items-center justify-center"
            >
                <FiPlus size={28} />
            </button>

            {/* Bottom Navigation - Mobile Only */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-2xl z-40">
                <div className="grid grid-cols-4 h-16">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        aria-label="Dashboard"
                    >
                        <FiHome className="w-5 h-5" />
                        <span className="text-xs font-medium">Home</span>
                    </button>

                    <button
                        onClick={() => router.push('/transactions')}
                        className="flex flex-col items-center justify-center gap-1 text-indigo-600 transition-colors"
                        aria-label="Transactions"
                    >
                        <FiList className="w-5 h-5" />
                        <span className="text-xs font-medium">Transactions</span>
                    </button>

                    <button
                        onClick={() => router.push('/recurring')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        aria-label="Recurring"
                    >
                        <FiRepeat className="w-5 h-5" />
                        <span className="text-xs font-medium">Recurring</span>
                    </button>

                    <button
                        onClick={() => router.push('/budgets')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        aria-label="Budgets"
                    >
                        <FiDollarSign className="w-5 h-5" />
                        <span className="text-xs font-medium">Budgets</span>
                    </button>
                </div>
            </nav>

            {/* Action Menu Bottom Sheet - Mobile Only */}
            {showActionMenu && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 sm:hidden"
                    onClick={() => setShowActionMenu(null)}
                >
                    <div
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4">
                            {/* Drag indicator */}
                            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>

                            <div className="space-y-2">
                                <button
                                    onClick={() => {
                                        handleEdit(showActionMenu);
                                        setShowActionMenu(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
                                >
                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                        <FiEdit2 className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-900">Edit Transaction</p>
                                        <p className="text-xs text-gray-500">Modify transaction details</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        const transaction = transactions.find(t => t.id === showActionMenu);
                                        if (transaction) {
                                            setDeleteConfirm(transaction);
                                            setShowActionMenu(null);
                                        }
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-red-50 rounded-xl transition-colors"
                                >
                                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                        <FiTrash2 className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-red-900">Delete Transaction</p>
                                        <p className="text-xs text-red-500">Remove permanently</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setShowActionMenu(null)}
                                    className="w-full px-4 py-3 mt-2 text-center font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Details Modal - Mobile Only */}
            {showDetails && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 sm:hidden"
                    onClick={() => setShowDetails(null)}
                >
                    <div
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            {/* Header */}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900">Transaction Details</h3>
                            </div>

                            {/* Amount - Large Display */}
                            <div className="text-center mb-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl">
                                <p className="text-sm text-gray-600 mb-2">Amount</p>
                                <p className={`text-4xl font-bold ${showDetails.category_type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                                    {showDetails.category_type === 'expense' ? '-' : '+'}{formatCurrency(Math.abs(showDetails.amount))}
                                </p>
                            </div>

                            {/* Details Grid */}
                            <div className="space-y-4">
                                {/* Description */}
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                                    <p className="text-base text-gray-900">
                                        {showDetails.description ? decodeHtmlEntities(showDetails.description) : 'No description'}
                                    </p>
                                </div>

                                {/* Category */}
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</p>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                                            showDetails.category_type === 'income'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                        }`}>
                                            {decodeHtmlEntities(showDetails.category)}
                                        </span>
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                            showDetails.category_type === 'income'
                                                ? 'bg-green-50 text-green-600'
                                                : 'bg-red-50 text-red-600'
                                        }`}>
                                            {showDetails.category_type === 'income' ? 'Income' : 'Expense'}
                                        </span>
                                    </div>
                                </div>

                                {/* Date */}
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</p>
                                    <div className="flex items-center gap-2 text-gray-900">
                                        <FiCalendar className="w-4 h-4 text-gray-400" />
                                        <span className="text-base">{formatCalendarDate(showDetails.date)}</span>
                                    </div>
                                </div>

                                {/* Created At */}
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created</p>
                                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                                        <span>{format(parseISO(showDetails.created_at), 'MMM dd, yyyy \'at\' h:mm a')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setShowDetails(null)}
                                className="w-full mt-6 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold text-gray-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Transaction?</h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete this transaction? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-100 transition-all duration-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm.id)}
                                disabled={deleting}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {showTransactionModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
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
                                aria-label="Close modal"
                            >
                                <FiX className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6">
                            <TransactionForm
                                token={token || ''}
                                categories={categories}
                                setCategories={setCategories}
                                onSuccess={() => {
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
