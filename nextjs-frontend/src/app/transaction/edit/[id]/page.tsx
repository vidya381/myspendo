'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import TransactionForm from '../../../../components/TransactionForm';

interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
}

interface Transaction {
    id: number;
    category_id: number;
    category: string;
    amount: number;
    description: string;
    date: string;
}

export default function EditTransactionPage() {
    const router = useRouter();
    const params = useParams();
    const transactionId = params?.id as string;
    const { token, initialized } = useAuth();
    const [authChecked, setAuthChecked] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Check auth token on mount and redirect if needed
    useEffect(() => {
        if (!initialized) return;
        if (!token) {
            router.replace('/login');
        } else {
            setAuthChecked(true);
        }
    }, [token, initialized, router]);

    // Fetch transaction data and categories
    useEffect(() => {
        if (!token || !authChecked || !transactionId) return;

        async function fetchData() {
            try {
                // Fetch categories
                const categoriesRes = await fetch(`${"/api"}/category/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const categoriesData = await categoriesRes.json();
                if (categoriesData.success && categoriesData.categories) {
                    setCategories(categoriesData.categories);
                }

                // Fetch transaction details
                const transactionRes = await fetch(`${"/api"}/transaction/list`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const transactionsData = await transactionRes.json();

                // Find the specific transaction
                const transactionsList = transactionsData.transactions || [];
                const foundTransaction = transactionsList.find((tx: Transaction) => tx.id === parseInt(transactionId));

                if (foundTransaction) {
                    setTransaction(foundTransaction);
                } else {
                    setError('Transaction not found');
                }
            } catch (err) {
                console.error('Failed to fetch data:', err);
                setError('Failed to load transaction data');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [token, authChecked, transactionId]);

    function handleSuccess() {
        // Signal that data should be refreshed
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('refreshDashboard', 'true');
        }
        router.push('/dashboard', { scroll: false });
    }

    function handleCancel() {
        router.push('/dashboard');
    }

    if (!authChecked || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    if (error || !transaction) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
                <div className="text-center">
                    <div className="text-red-600 text-xl font-bold mb-4">{error || 'Transaction not found'}</div>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all duration-200"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 shadow-sm sticky top-0 z-40">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                aria-label="Back to dashboard"
                            >
                                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                Edit Transaction
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl p-8 sm:p-10 border border-white/20">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Update Transaction Details</h2>
                        <p className="text-sm text-gray-600">Modify the information below to update this transaction</p>
                    </div>
                    {token && (
                        <TransactionForm
                            token={token}
                            categories={categories}
                            setCategories={setCategories}
                            onSuccess={handleSuccess}
                            onCancel={handleCancel}
                            initialValues={{
                                id: transaction.id,
                                category_id: transaction.category_id,
                                category_name: transaction.category,
                                amount: transaction.amount,
                                description: transaction.description,
                                date: transaction.date,
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
