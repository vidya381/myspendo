'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiCheckCircle, FiX, FiArrowLeft, FiDollarSign, FiHome, FiRepeat, FiList, FiLogOut } from 'react-icons/fi';

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
    type: string;
}

export default function BudgetsPage() {
    const router = useRouter();
    const { token, initialized, logout } = useAuth();
    const [authChecked, setAuthChecked] = useState(false);

    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Budget | null>(null);

    // Touch interaction state
    const [showActionMenu, setShowActionMenu] = useState<number | null>(null);
    const [showDetails, setShowDetails] = useState<Budget | null>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef<boolean>(false);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef<boolean>(false);

    // Form state
    const [categoryId, setCategoryId] = useState<number>(0);
    const [amount, setAmount] = useState('');
    const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
    const [alertThreshold, setAlertThreshold] = useState(80);
    const [loadingSubmit, setLoadingSubmit] = useState(false);

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

    // Check auth token on mount and redirect if needed
    useEffect(() => {
        if (!initialized) return;
        if (!token) {
            router.replace('/login');
        } else {
            setAuthChecked(true);
        }
    }, [token, initialized, router]);

    useEffect(() => {
        if (authChecked && token) {
            fetchBudgets();
            fetchCategories();
        }
    }, [authChecked, token]);

    // Prevent background scroll when modals are open
    useEffect(() => {
        if (showDetails || showActionMenu || showModal || deleteConfirm) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showDetails, showActionMenu, showModal, deleteConfirm]);

    // Touch handlers for tap and long press
    const handleTouchStart = (e: React.TouchEvent, budget: Budget) => {
        isLongPress.current = false;
        hasMoved.current = false;
        touchStartPos.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };

        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowActionMenu(budget.id);
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500);
    };

    const handleTouchEnd = (budget: Budget) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (!isLongPress.current && !hasMoved.current) {
            setShowDetails(budget);
        }

        isLongPress.current = false;
        hasMoved.current = false;
        touchStartPos.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartPos.current) {
            const deltaX = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
            const deltaY = Math.abs(e.touches[0].clientY - touchStartPos.current.y);

            if (deltaX > 10 || deltaY > 10) {
                hasMoved.current = true;
            }
        }

        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const fetchBudgets = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/budget/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setBudgets(data.budgets || []);
            }
        } catch (error) {
            console.error('Failed to fetch budgets:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        if (!token) return;
        try {
            const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/category/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                // Only show expense categories for budgets
                setCategories(data.categories?.filter((c: Category) => c.type === 'expense') || []);
            }
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        }
    };

    const openAddModal = () => {
        setEditingBudget(null);
        setCategoryId(0);
        setAmount('');
        setPeriod('monthly');
        setAlertThreshold(80);
        setShowModal(true);
    };

    const openEditModal = (budget: Budget) => {
        setEditingBudget(budget);
        setCategoryId(budget.category_id);
        setAmount(budget.amount.toString());
        setPeriod(budget.period as 'monthly' | 'yearly');
        setAlertThreshold(budget.alert_threshold);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingBudget(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        setLoadingSubmit(true);
        try {
            const formData = new FormData();
            if (editingBudget) {
                formData.append('id', editingBudget.id.toString());
            } else {
                formData.append('category_id', categoryId.toString());
                formData.append('period', period);
            }
            formData.append('amount', amount);
            formData.append('alert_threshold', alertThreshold.toString());

            const endpoint = editingBudget ? '/budget/update' : '/budget/add';
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}${endpoint}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();

            // Handle different response statuses
            if (response.status === 409) {
                // Conflict - duplicate budget
                alert(data.error || 'A budget already exists for this category and period. Please update the existing budget instead of creating a new one.');
                return;
            }

            if (data.success) {
                await fetchBudgets();
                closeModal();
            } else {
                alert(data.error || 'Failed to save budget');
            }
        } catch (error) {
            console.error('Failed to save budget:', error);
            alert('An unexpected error occurred. Please try again.');
        } finally {
            setLoadingSubmit(false);
        }
    };

    const handleDelete = async () => {
        if (!token || !deleteConfirm) return;

        try {
            const formData = new FormData();
            formData.append('id', deleteConfirm.id.toString());

            const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/budget/delete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                await fetchBudgets();
                setDeleteConfirm(null);
            } else {
                alert(data.error || 'Failed to delete budget');
            }
        } catch (error) {
            console.error('Failed to delete budget:', error);
            alert('Failed to delete budget');
        }
    };

    const calculateProgress = (budget: Budget) => {
        if (budget.amount === 0) return 0;
        return Math.min((budget.current_spending / budget.amount) * 100, 100);
    };

    const getProgressColor = (budget: Budget) => {
        const progress = calculateProgress(budget);
        if (progress >= budget.alert_threshold) return 'bg-rose-400';
        if (progress >= budget.alert_threshold * 0.8) return 'bg-amber-400';
        return 'bg-emerald-400';
    };

    const getStatusIcon = (budget: Budget) => {
        const progress = calculateProgress(budget);
        if (progress >= budget.alert_threshold) {
            return <FiAlertTriangle className="w-5 h-5 text-rose-400" />;
        }
        return <FiCheckCircle className="w-5 h-5 text-emerald-400" />;
    };

    if (!authChecked || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading budgets...</p>
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
                            <div className="w-8 h-8 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                                <FiDollarSign className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                                Budgets
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header Info */}
                <div className="mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Your Budgets</h2>
                    <p className="text-sm sm:text-base text-gray-600">Track your spending and stay within your budget limits</p>
                </div>

                {/* Budget Cards Grid */}
                {budgets.length === 0 ? (
                    <div className="bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl border border-white/20 p-8 sm:p-16 text-center">
                        <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <FiDollarSign className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No Budgets Yet</h3>
                        <p className="text-gray-500 mb-6">Create your first budget to start tracking your spending</p>
                        <button
                            onClick={openAddModal}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                            <FiPlus className="w-5 h-5" />
                            Add Your First Budget
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
                        {budgets.map((budget) => {
                            const progress = calculateProgress(budget);
                            const progressColor = getProgressColor(budget);
                            const remaining = Math.max(0, budget.amount - budget.current_spending);

                            // Status-based styling matching dashboard
                            let bgColor = 'bg-emerald-50';
                            let borderColor = 'border-emerald-200';
                            let textColor = 'text-emerald-700';
                            let iconGradient = 'from-emerald-500 to-teal-600';

                            if (progress >= budget.alert_threshold) {
                                bgColor = 'bg-rose-50';
                                borderColor = 'border-rose-200';
                                textColor = 'text-rose-700';
                                iconGradient = 'from-rose-500 to-pink-600';
                            } else if (progress >= budget.alert_threshold * 0.8) {
                                bgColor = 'bg-amber-50';
                                borderColor = 'border-amber-200';
                                textColor = 'text-amber-700';
                                iconGradient = 'from-amber-500 to-orange-600';
                            }

                            return (
                                <div
                                    key={budget.id}
                                    className={`group ${bgColor} border ${borderColor} rounded-xl hover:shadow-lg transition-all duration-200 select-none`}
                                    style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                                    onTouchStart={(e) => handleTouchStart(e, budget)}
                                    onTouchEnd={() => handleTouchEnd(budget)}
                                    onTouchMove={handleTouchMove}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    {/* Mobile Compact Layout */}
                                    <div className="sm:hidden p-3">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-gray-900 text-sm mb-1.5 truncate">
                                                    {budget.category_name}
                                                </h3>
                                                <span className="text-[10px] px-1.5 py-0.5 bg-white rounded-full text-gray-600 capitalize">
                                                    {budget.period}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {progress >= budget.alert_threshold && (
                                                    <FiAlertTriangle className={`w-4 h-4 ${textColor} flex-shrink-0`} />
                                                )}
                                                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${iconGradient} shadow-lg flex-shrink-0`}>
                                                    <FiDollarSign className="w-4 h-4 text-white" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-baseline gap-1 mb-2">
                                            <span className={`text-xl font-bold ${textColor}`}>
                                                ${budget.current_spending.toFixed(0)}
                                            </span>
                                            <span className="text-xs text-gray-600">
                                                / ${budget.amount.toFixed(0)}
                                            </span>
                                        </div>

                                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={`h-full ${progressColor} transition-all duration-500`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Desktop Layout */}
                                    <div className="hidden sm:block p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-900 text-sm mb-1">
                                                    {budget.category_name}
                                                </h3>
                                                <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600 capitalize">
                                                    {budget.period}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {progress >= budget.alert_threshold && (
                                                    <FiAlertTriangle className={`w-5 h-5 ${textColor} flex-shrink-0`} />
                                                )}
                                                <div className={`p-2 rounded-lg bg-gradient-to-br ${iconGradient} shadow-lg flex-shrink-0`}>
                                                    <FiDollarSign className="w-5 h-5 text-white" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <div className="flex items-baseline justify-between mb-2">
                                                <span className={`text-2xl font-bold ${textColor}`}>
                                                    ${budget.current_spending.toFixed(0)}
                                                </span>
                                                <span className="text-sm text-gray-600">
                                                    / ${budget.amount.toFixed(0)}
                                                </span>
                                            </div>

                                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
                                                <div
                                                    className={`h-full ${progressColor} transition-all duration-500`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-gray-600">
                                                <span>{progress.toFixed(0)}% used</span>
                                                <span className="font-semibold">${remaining.toFixed(0)} left</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                                            <span className="text-xs text-gray-600">
                                                🔔 Alert at {budget.alert_threshold}%
                                            </span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openEditModal(budget)}
                                                    className="p-1.5 bg-white hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
                                                    title="Edit"
                                                >
                                                    <FiEdit2 className="w-4 h-4 text-gray-600" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(budget)}
                                                    className="p-1.5 bg-white hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
                                                    title="Delete"
                                                >
                                                    <FiTrash2 className="w-4 h-4 text-rose-600" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Floating Add Button */}
                <button
                    onClick={openAddModal}
                    className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 p-4 sm:p-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-200 transform hover:scale-110 z-50 group"
                    aria-label="Add new budget"
                >
                    <FiPlus className="w-6 h-6" />
                </button>

                {/* Add/Edit Modal */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                            {/* Modal Header */}
                            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                                <h2 className="text-xl font-bold text-gray-900">
                                    {editingBudget ? 'Edit Budget' : 'Add New Budget'}
                                </h2>
                                <button
                                    onClick={closeModal}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                    disabled={loadingSubmit}
                                >
                                    <FiX className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Modal Form */}
                            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                                {/* Category Selection */}
                                {!editingBudget && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            🏷️ Budget Category <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            value={categoryId}
                                            onChange={(e) => setCategoryId(Number(e.target.value))}
                                            required
                                            disabled={loadingSubmit}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-900 font-medium text-base"
                                        >
                                            <option value={0}>Overall Budget</option>
                                            {categories.map((cat) => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="mt-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                                            💡 Select "Overall Budget" to track all expenses, or choose a specific category
                                        </p>
                                    </div>
                                )}

                                {/* Period Selection */}
                                {!editingBudget && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            📆 Budget Period <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setPeriod('monthly')}
                                                disabled={loadingSubmit}
                                                className={`px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
                                                    period === 'monthly'
                                                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                Monthly
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPeriod('yearly')}
                                                disabled={loadingSubmit}
                                                className={`px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
                                                    period === 'yearly'
                                                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                Yearly
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Amount */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        💵 Budget Amount <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700 font-bold text-lg">
                                            $
                                        </span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            required
                                            disabled={loadingSubmit}
                                            className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-900 font-medium text-base"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                {/* Alert Threshold */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                                        ⚠️ Alert Threshold: <span className="text-indigo-600 font-bold text-lg">{alertThreshold}%</span> <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={alertThreshold}
                                        onChange={(e) => setAlertThreshold(Number(e.target.value))}
                                        disabled={loadingSubmit}
                                        className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed accent-indigo-600"
                                    />
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mt-2">
                                        <span>0%</span>
                                        <span>50%</span>
                                        <span>100%</span>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-700 bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                                        💡 You'll receive an alert when spending reaches this percentage
                                    </p>
                                </div>

                                {/* Form Actions */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="submit"
                                        disabled={loadingSubmit}
                                        className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loadingSubmit ? 'Saving...' : editingBudget ? 'Update Budget' : 'Create Budget'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={loadingSubmit}
                                        className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

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
                                <div className="space-y-2">
                                    <button
                                        onClick={() => {
                                            const budget = budgets.find(b => b.id === showActionMenu);
                                            if (budget) openEditModal(budget);
                                            setShowActionMenu(null);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                            <FiEdit2 className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900">Edit Budget</p>
                                            <p className="text-xs text-gray-500">Modify budget details</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            const budget = budgets.find(b => b.id === showActionMenu);
                                            if (budget) {
                                                setDeleteConfirm(budget);
                                                setShowActionMenu(null);
                                            }
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-red-50 rounded-xl transition-colors"
                                    >
                                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                            <FiTrash2 className="w-5 h-5 text-red-600" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-red-900">Delete Budget</p>
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

                {/* Details Modal - Mobile Only */}
                {showDetails && (() => {
                    const progress = calculateProgress(showDetails);
                    const progressColor = getProgressColor(showDetails);
                    const remaining = Math.max(0, showDetails.amount - showDetails.current_spending);

                    let bgColor = 'from-emerald-50 to-teal-50';
                    let textColor = 'text-emerald-700';
                    let statusText = '✅ On Track';

                    if (progress >= showDetails.alert_threshold) {
                        bgColor = 'from-rose-50 to-pink-50';
                        textColor = 'text-rose-700';
                        statusText = '⚠️ Over Budget';
                    } else if (progress >= showDetails.alert_threshold * 0.8) {
                        bgColor = 'from-amber-50 to-orange-50';
                        textColor = 'text-amber-700';
                        statusText = '⚡ Warning';
                    }

                    return (
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
                                        <h3 className="text-xl font-bold text-gray-900">Budget Details</h3>
                                    </div>

                                    {/* Status Display */}
                                    <div className={`text-center mb-6 p-6 bg-gradient-to-br ${bgColor} rounded-2xl`}>
                                        <p className="text-sm text-gray-600 mb-2">{showDetails.category_name}</p>
                                        <p className={`text-4xl font-bold ${textColor} mb-2`}>
                                            ${showDetails.current_spending.toFixed(2)}
                                        </p>
                                        <p className="text-sm text-gray-600">of ${showDetails.amount.toFixed(2)}</p>
                                        <p className={`text-lg font-semibold ${textColor} mt-2`}>{statusText}</p>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mb-6">
                                        <div className="flex items-center justify-between text-sm mb-2">
                                            <span className="text-gray-600">{progress.toFixed(1)}% used</span>
                                            <span className={`font-semibold ${textColor}`}>${remaining.toFixed(2)} remaining</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                            <div
                                                className={`h-full ${progressColor} transition-all duration-500`}
                                                style={{ width: `${Math.min(progress, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Period</p>
                                            <p className="text-base text-gray-900 capitalize">{showDetails.period}</p>
                                        </div>

                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Alert Threshold</p>
                                            <p className="text-base text-gray-900">
                                                🔔 {showDetails.alert_threshold}%
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Budget Limit</p>
                                            <p className="text-base text-gray-900">${showDetails.amount.toFixed(2)}</p>
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
                    );
                })()}

                {/* Delete Confirmation Modal */}
                {deleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 rounded-full">
                                    <FiTrash2 className="w-6 h-6 text-red-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Delete Budget</h3>
                            </div>

                            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                <div className="mb-2">
                                    <span className="text-sm font-semibold text-gray-700">Budget:</span>
                                    <span className="text-sm text-gray-900 ml-2">{deleteConfirm.category_name}</span>
                                </div>
                                <div className="mb-2">
                                    <span className="text-sm font-semibold text-gray-700">Period:</span>
                                    <span className="text-sm text-gray-900 ml-2 capitalize">{deleteConfirm.period}</span>
                                </div>
                                <div>
                                    <span className="text-sm font-semibold text-gray-700">Amount:</span>
                                    <span className="text-sm text-gray-900 ml-2">${deleteConfirm.amount.toFixed(2)}</span>
                                </div>
                            </div>

                            <p className="text-gray-600 mb-6">
                                Are you sure you want to delete this budget? This action cannot be undone.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200"
                                >
                                    Delete Budget
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Navigation - Mobile Only */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-2xl z-40">
                <div className="grid grid-cols-4 h-16">
                    {/* Dashboard */}
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
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
                        className="flex flex-col items-center justify-center gap-1 text-indigo-600 transition-colors"
                        aria-label="Budgets"
                    >
                        <FiDollarSign className="w-5 h-5" />
                        <span className="text-xs font-medium">Budgets</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
