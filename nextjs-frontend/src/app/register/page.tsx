'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ApiResponse = {
    success: boolean;
    message?: string;
    error?: string;
};

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function validateEmailFormat(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function clearError() {
        if (error) setError(null);
    }

    async function handleRegister(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        // Frontend validation
        if (!username.trim()) {
            setError("Username is required");
            return;
        }
        if (!email.trim()) {
            setError("Email is required");
            return;
        }
        if (!validateEmailFormat(email)) {
            setError("Please enter a valid email address");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        // Check if API URL is configured
        const apiUrl = "/api";
        if (!apiUrl) {
            setError("API configuration error. Please contact support.");
            return;
        }

        setLoading(true);

        try {
            const formData = new FormData();
            formData.append("username", username.trim());
            formData.append("email", email.trim());
            formData.append("password", password);

            const res = await fetch(`${apiUrl}/register`, {
                method: "POST",
                body: formData,
            });

            // Check if response is OK before parsing JSON
            if (!res.ok) {
                let errorMessage = "Registration failed. Please try again.";
                try {
                    const errorData: ApiResponse = await res.json();
                    errorMessage = errorData.error || errorMessage;
                } catch {
                    if (res.status >= 500) {
                        errorMessage = "Server error. Please try again later.";
                    }
                }
                setError(errorMessage);
                setLoading(false);
                return;
            }

            const data: ApiResponse = await res.json();

            if (!data.success) {
                setError(data.error || "Registration failed");
                setLoading(false);
                return;
            }

            setSuccess(data.message || "Registered successfully! Redirecting to login...");
            setLoading(false);

            setTimeout(() => {
                router.push("/login");
            }, 2000);
        } catch (err) {
            if (err instanceof TypeError && err.message.includes('fetch')) {
                setError("Network error. Please check your connection and try again.");
            } else if (err instanceof SyntaxError) {
                setError("Invalid response from server. Please try again.");
            } else {
                setError("An unexpected error occurred. Please try again.");
            }
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-indigo-50 via-white to-purple-50 relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
                <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
            </div>
            
            <div className="w-full max-w-md relative z-10">
                {/* Logo/Header Section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
                    <p className="text-gray-600">Join us and start tracking your expenses</p>
                </div>

                {/* Form Card */}
                <form
                    onSubmit={handleRegister}
                    className="bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl px-8 pt-8 pb-10 border border-white/20"
                    aria-label="Registration form"
                >
                    {error && (
                        <div 
                            className="mb-6 text-red-700 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg shadow-sm animate-fade-in"
                            role="alert"
                            aria-live="polite"
                        >
                            <div className="flex items-center">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div 
                            className="mb-6 text-green-700 bg-green-50 border-l-4 border-green-500 p-4 rounded-lg shadow-sm animate-fade-in"
                            role="alert"
                            aria-live="polite"
                        >
                            <div className="flex items-center">
                                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-medium">{success}</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-5">
                        {/* Username Input */}
                        <div>
                            <label 
                                htmlFor="username" 
                                className="block text-sm font-semibold text-gray-700 mb-2"
                            >
                                Username
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                                    placeholder="Choose a username"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        clearError();
                                    }}
                                    disabled={loading}
                                    required
                                    autoComplete="username"
                                    aria-required="true"
                                    aria-invalid={error && error.includes("username") ? "true" : "false"}
                                />
                            </div>
                        </div>

                        {/* Email Input */}
                        <div>
                            <label 
                                htmlFor="email" 
                                className="block text-sm font-semibold text-gray-700 mb-2"
                            >
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                    </svg>
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        clearError();
                                    }}
                                    disabled={loading}
                                    required
                                    autoComplete="email"
                                    aria-required="true"
                                    aria-invalid={error && error.includes("email") ? "true" : "false"}
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label 
                                htmlFor="password" 
                                className="block text-sm font-semibold text-gray-700 mb-2"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="w-full pl-10 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed bg-white text-gray-900 placeholder:text-gray-400"
                                    placeholder="At least 4 characters"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        clearError();
                                    }}
                                    disabled={loading}
                                    required
                                    autoComplete="new-password"
                                    aria-required="true"
                                    aria-invalid={error && error.includes("password") ? "true" : "false"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-200"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    tabIndex={0}
                                >
                                    {showPassword ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">Minimum 4 characters required</p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full mt-8 py-3.5 px-4 rounded-xl font-semibold text-white transition-all duration-200 transform ${
                            loading 
                                ? "bg-indigo-400 cursor-not-allowed" 
                                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-lg hover:shadow-xl active:scale-[0.98]"
                        }`}
                        aria-busy={loading}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Creating account...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center">
                                Create Account
                                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </span>
                        )}
                    </button>

                    {/* Login Link */}
                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            Already have an account?{" "}
                            <Link 
                                href="/login" 
                                className="font-semibold text-indigo-600 hover:text-indigo-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 rounded"
                            >
                                Sign in here
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </main>
    );
}
