'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import TransactionForm from '../../../components/TransactionForm';

interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
}

export default function AddTransactionPage() {
    const router = useRouter();
    const { token, initialized } = useAuth();
    const [authChecked, setAuthChecked] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);

    // Check auth token on mount and redirect if needed
    useEffect(() => {
        if (!initialized) return;
        if (!token) {
            router.replace('/login');
        } else {
            setAuthChecked(true);
        }
    }, [token, initialized, router]);

    // Fetch categories
    useEffect(() => {
        if (!token || !authChecked) return;

        async function fetchCategories() {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/category/list`, {
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
    }, [token, authChecked]);

    function handleSuccess() {
        // Signal that data should be refreshed
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('refreshDashboard', 'true');
        }
        router.push('/dashboard');
    }

    function handleCancel() {
        router.push('/dashboard');
    }

    if (!authChecked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
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
                            <h1 className="text-2xl font-bold text-slate-800">
                                Add Transaction
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl p-8 sm:p-10 border border-white/20">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Transaction Details</h2>
                        <p className="text-sm text-gray-600">Fill in the information below to add a new transaction</p>
                    </div>
                    {token && (
                        <TransactionForm
                            token={token}
                            categories={categories}
                            setCategories={setCategories}
                            onSuccess={handleSuccess}
                            onCancel={handleCancel}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

