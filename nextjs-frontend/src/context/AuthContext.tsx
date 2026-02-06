'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface AuthContextType {
    token: string | null;
    setToken: (token: string | null) => void;
    logout: () => void;
    initialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // This will only run client-side
        const storedToken = localStorage.getItem('jwt_token');
        if (storedToken) setToken(storedToken);
        setInitialized(true);
    }, []);

    useEffect(() => {
        if (token) {
            localStorage.setItem('jwt_token', token);
        } else {
            localStorage.removeItem('jwt_token');
        }
    }, [token]);

    function logout() {
        setToken(null);
        localStorage.removeItem('jwt_token');
        // Clear session-based alert tracking on logout
        sessionStorage.removeItem('budgetAlertsShown');
        // Redirect to dashboard (will show guest mode)
        router.push('/dashboard');
    }

    return (
        <AuthContext.Provider value={{ token, setToken, logout, initialized }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
