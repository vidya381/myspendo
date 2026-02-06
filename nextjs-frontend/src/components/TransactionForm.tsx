'use client';

import React, { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';

// Decode HTML entities (e.g., &amp; -> &, &lt; -> <)
// Uses DOMParser for safe HTML entity decoding without XSS risk
function decodeHtmlEntities(text: string): string {
    if (!text) return text;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return doc.documentElement.textContent || text;
}

interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
}

interface TransactionFormProps {
    token: string;
    categories: Category[];
    setCategories: Dispatch<SetStateAction<Category[]>>;
    onSuccess: () => void;
    onCancel?: () => void;
    initialValues?: {
        id?: number;
        category_id?: number;
        category_name?: string;
        amount?: number;
        description?: string;
        date?: string;
    };
}

export default function TransactionForm({
    token,
    categories,
    setCategories,
    onSuccess,
    onCancel,
    initialValues = {},
}: TransactionFormProps) {

    const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);

    const [categoryInput, setCategoryInput] = useState(
        initialValues.category_name ? decodeHtmlEntities(initialValues.category_name) : ''
    );
    const [categoryId, setCategoryId] = useState<number | null>(
        initialValues.category_id || null
    );

    const [showCategoryTypeInput, setShowCategoryTypeInput] = useState(false);
    const [categoryType, setCategoryType] = useState<'income' | 'expense'>('expense');
    const [amount, setAmount] = useState(
        initialValues.amount !== undefined ? initialValues.amount.toString() : ''
    );
    const [description, setDescription] = useState(
        initialValues.description ? decodeHtmlEntities(initialValues.description) : ''
    );
    const [date, setDate] = useState(
        initialValues.date
            ? initialValues.date.split('T')[0]  // Extract date part from ISO timestamp
            : new Date().toISOString().slice(0, 10)
    );

    const [loadingCategories, setLoadingCategories] = useState(categories.length === 0);
    const [loadingSubmit, setLoadingSubmit] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [userHasInteracted, setUserHasInteracted] = useState(false);

    const categoryInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // If categories are already provided, use them without fetching
        if (categories.length > 0) {
            setFilteredCategories(categories);
            setLoadingCategories(false);
            return;
        }

        // Otherwise, fetch categories
        async function fetchCategories() {
            setLoadingCategories(true);
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/category/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success && data.categories) {
                    setCategories(data.categories);
                    setFilteredCategories(data.categories);
                } else {
                    setError(data.error || 'Failed to load categories');
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load categories');
            } finally {
                setLoadingCategories(false);
            }
        }
        fetchCategories();
    }, [token, categories]);

    useEffect(() => {
        if (!categories || categories.length === 0) {
            // If no categories exist yet, and user is typing, show type input
            if (categoryInput && userHasInteracted) {
                setFilteredCategories([]);
                setCategoryId(null);
                setShowCategoryTypeInput(true);
                setShowDropdown(false);
            }
            return;
        }
        if (!categoryInput) {
            setFilteredCategories(categories);
            setCategoryId(null);
            setShowCategoryTypeInput(false);
            setShowDropdown(false);
            return;
        }
        const filtered = categories.filter((cat) =>
            cat.name.toLowerCase().startsWith(categoryInput.toLowerCase())
        );
        setFilteredCategories(filtered);

        // Check for exact match
        const exactMatch = categories.find(
            (cat) => cat.name.toLowerCase() === categoryInput.toLowerCase()
        );

        if (exactMatch) {
            setCategoryId(exactMatch.id);
            setShowCategoryTypeInput(false);
            // Don't auto-show dropdown for exact matches (user selected from dropdown)
            setShowDropdown(false);
        } else {
            setCategoryId(null);
            // Only show category type input if user has interacted
            setShowCategoryTypeInput(userHasInteracted);
            // Only show dropdown if there are filtered results, no exact match, and user has interacted
            if (filtered.length > 0 && userHasInteracted) {
                setShowDropdown(true);
            } else {
                setShowDropdown(false);
            }
        }
    }, [categoryInput, categories, userHasInteracted]);

    // Handle clicks outside dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                categoryInputRef.current &&
                !categoryInputRef.current.contains(event.target as Node)
            ) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCategorySelect = (category: Category) => {
        setCategoryInput(category.name);
        setCategoryId(category.id);
        setShowDropdown(false);
        setShowCategoryTypeInput(false);
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!categoryInput.trim()) {
            setError('Category name is required');
            categoryInputRef.current?.focus();
            return;
        }
        if (!categoryId && !categoryType) {
            setError('Please select category type for new category');
            return;
        }
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError("Enter a valid amount greater than zero.");
            return;
        }
        if (!date) {
            setError('Select a valid date');
            return;
        }

        setLoadingSubmit(true);
        try {
            let usedCategoryId = categoryId;
            if (!usedCategoryId) {
                const formData = new FormData();
                formData.append('name', categoryInput.trim());
                formData.append('type', categoryType);

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/category/add`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                const data = await res.json();

                if (!data.success) {
                    throw new Error(data.error || 'Failed to create category');
                }

                const createdCategory = data.category;
                if (!createdCategory || !createdCategory.id) {
                    throw new Error('Invalid category data from server');
                }

                usedCategoryId = createdCategory.id;

                // Update local categories state
                // setCategories(prev => [...prev, createdCategory]);
                setCategories(prev => prev ? [...prev, data.category] : [data.category]);


            }

            const txForm = new FormData();
            txForm.append('category_id', String(usedCategoryId));
            txForm.append('amount', amount.toString());
            txForm.append('description', description);
            txForm.append('date', date);

            // If editing, append id
            if (initialValues.id) {
                txForm.append('id', String(initialValues.id));
            }

            const txUrl = initialValues.id
                ? `${process.env.NEXT_PUBLIC_API_URL || "/api"}/transaction/update`
                : `${process.env.NEXT_PUBLIC_API_URL || "/api"}/transaction/add`;

            const txRes = await fetch(txUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: txForm,
            });
            const txData = await txRes.json();
            if (!txData.success) throw new Error(txData.error || 'Failed to save transaction');

            // Reset form if adding
            if (!initialValues.id) {
                setCategoryInput('');
                setCategoryId(null);
                setDescription('');
                setAmount('0');
                setDate(new Date().toISOString().slice(0, 10));
                setShowCategoryTypeInput(false);
            }
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An error occurred while saving the transaction');
        } finally {
            setLoadingSubmit(false);
        }
    }

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
                <div className="mb-6 text-red-700 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg shadow-sm animate-fade-in">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                </div>
            )}

            <div>
                <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-2">
                    🏷️ Category <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                    </div>
                    <input
                        id="category"
                        value={categoryInput}
                        onChange={(e) => {
                            setUserHasInteracted(true);
                            setCategoryInput(e.target.value);
                        }}
                        onFocus={() => {
                            setUserHasInteracted(true);
                            if (categoryInput && filteredCategories.length > 0) {
                                setShowDropdown(true);
                            }
                        }}
                        disabled={loadingSubmit || loadingCategories}
                        maxLength={100}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                        autoComplete="off"
                        placeholder="Type or select a category"
                        ref={categoryInputRef}
                    />

                    {/* Custom Dropdown */}
                    {showDropdown && filteredCategories.length > 0 && (
                        <div
                            ref={dropdownRef}
                            className="absolute z-20 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto"
                        >
                            {filteredCategories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => handleCategorySelect(cat)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 transition-all duration-150 border-b border-gray-100 last:border-b-0 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${
                                            cat.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400'
                                        }`} />
                                        <span className="text-gray-900 font-medium group-hover:text-emerald-700 transition-colors">
                                            {cat.name}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                        cat.type === 'income'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-rose-50 text-rose-700'
                                    }`}>
                                        {cat.type === 'income' ? '💰 Income' : '💳 Expense'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showCategoryTypeInput && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-100 rounded-xl p-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                        💡 New Category Type <span className="text-rose-500">*</span>
                    </label>
                    <p className="text-xs text-gray-600 mb-3">This category doesn't exist yet. Choose whether it's an income or expense.</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setCategoryType('expense')}
                            disabled={loadingSubmit}
                            className={`px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                                categoryType === 'expense'
                                    ? 'bg-gradient-to-r from-rose-400 to-pink-400 text-white shadow-lg scale-105'
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <span>💳</span> Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategoryType('income')}
                            disabled={loadingSubmit}
                            className={`px-4 py-3.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                                categoryType === 'income'
                                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-white shadow-lg scale-105'
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <span>💰</span> Income
                        </button>
                    </div>
                </div>
            )}

            <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-gray-700 mb-2">
                    💵 Amount <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <input
                        id="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        disabled={loadingSubmit}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                        placeholder="0.00"
                        required
                    />
                </div>
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                    📝 Description <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 pt-3 pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </div>
                    <input
                        id="description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={loadingSubmit}
                        maxLength={500}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                        placeholder="Add a description"
                    />
                </div>
            </div>

            <div>
                <label htmlFor="date" className="block text-sm font-semibold text-gray-700 mb-2">
                    📅 Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        disabled={loadingSubmit}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900"
                        required
                    />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                    type="submit"
                    disabled={loadingSubmit || loadingCategories}
                    className={`flex-1 py-3.5 px-4 rounded-xl font-semibold text-white transition-all duration-200 transform ${
                        loadingSubmit || loadingCategories
                            ? "bg-emerald-600 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 shadow-lg hover:shadow-xl active:scale-[0.98]"
                    }`}
                >
                    {loadingSubmit ? (
                        <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                        </span>
                    ) : (
                        <span className="flex items-center justify-center">
                            {initialValues.id ? 'Update Transaction' : 'Add Transaction'}
                            <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                    )}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3.5 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loadingSubmit}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}
