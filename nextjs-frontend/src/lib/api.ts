import { useAuth } from '../context/AuthContext';

// Use /api for production (Vercel proxy), or env var for local dev
const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// A regular function to call API with token, independent of React hooks
export async function apiFetch(
    url: string,
    options: RequestInit = {}
): Promise<any> {
    // Extract token from localStorage
    const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;

    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, {
        ...options,
        headers,
    });

    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem('jwt_token');
            window.location.href = '/login';
            return Promise.reject(new Error('Unauthorized — please log in again'));
        }
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || 'API request failed');
    }
    return res.json();
}

export function useApi() {
    const { token } = useAuth();

    return async function (url: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers);
        headers.set('Content-Type', 'application/json');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const res = await fetch(url, {
            ...options,
            headers,
        });

        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem('jwt_token');
                window.location.href = '/login';
                return Promise.reject(new Error('Unauthorized — please log in again'));
            }
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || 'API request failed');
        }
        return res.json();
    };
}

export async function fetchTransactions(token: string) {
    const res = await fetch(`${BASE}/transaction/list`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error loading transactions");
    return data.transactions || [];
}

export async function addTransaction(token: string, tx: {
    category_id: number,
    amount: number,
    description: string,
    date: string,
}) {
    const formData = new FormData();
    Object.entries(tx).forEach(([k, v]) => formData.append(k, String(v)));
    const res = await fetch(`${BASE}/transaction/add`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error adding transaction");
    return data;
}

export async function updateTransaction(token: string, tx: {
    id: number,
    category_id: number,
    amount: number,
    description: string,
    date: string,
}) {
    const formData = new FormData();
    Object.entries(tx).forEach(([k, v]) => formData.append(k, String(v)));
    const res = await fetch(`${BASE}/transaction/update`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error updating transaction");
    return data;
}

export async function deleteTransaction(token: string, id: number) {
    const formData = new FormData();
    formData.append("id", String(id));
    const res = await fetch(`${BASE}/transaction/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error deleting transaction");
    return data;
}
