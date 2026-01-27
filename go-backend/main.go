package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/rs/cors"
	"github.com/vidya381/myspendo-backend/constants"
	"github.com/vidya381/myspendo-backend/handlers"
	"github.com/vidya381/myspendo-backend/jobs"
	"github.com/vidya381/myspendo-backend/middleware"
	"github.com/vidya381/myspendo-backend/models"
	"github.com/vidya381/myspendo-backend/utils"
	"golang.org/x/time/rate"

	_ "github.com/jackc/pgx/v5/stdlib" // pgx driver with database/sql
	"github.com/joho/godotenv"
)

var jwtSecret string

var db *sql.DB

func main() {
	// Initialize structured logger
	utils.InitLogger()

	// Load .env file (silently ignore if not found - normal in production)
	_ = godotenv.Load()

	// Validate all required environment variables
	if err := utils.ValidateConfig(); err != nil {
		slog.Error("Configuration validation failed", "error", err)
		os.Exit(1)
	}

	// Load JWT secret (already validated above)
	jwtSecret = os.Getenv("JWT_SECRET")

	// Connect to database
	var err error
	db, err = sql.Open("pgx", getDBConnURL())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// Simple ping to verify connection is valid
	if err := db.Ping(); err != nil {
		panic("Failed to ping DB: " + err.Error())
	}

	// Configure connection pool
	db.SetMaxOpenConns(constants.MaxOpenConnections)
	db.SetMaxIdleConns(constants.MaxIdleConnections)
	db.SetConnMaxLifetime(constants.ConnectionMaxLifetime)
	db.SetConnMaxIdleTime(constants.ConnectionMaxIdleTime)

	slog.Info("Connected to PostgreSQL successfully")

	// Start recurring job and capture quit channel for graceful shutdown
	recurringJobQuit := jobs.StartRecurringJob(db)

	// Create rate limiter for authentication endpoints
	authRateLimiter := middleware.NewIPRateLimiter(
		rate.Limit(constants.AuthRateLimitPerMinute),
		constants.AuthRateLimitBurst)
	authRateLimiter.CleanupOldEntries()
	rateLimitAuth := middleware.RateLimitMiddleware(authRateLimiter)

	// Create rate limiter for API endpoints (more permissive)
	apiRateLimiter := middleware.NewIPRateLimiter(
		rate.Limit(constants.APIRateLimitPerSecond),
		constants.APIRateLimitBurst)
	apiRateLimiter.CleanupOldEntries()
	rateLimitAPI := middleware.RateLimitMiddleware(apiRateLimiter)

	mux := http.NewServeMux()

	// Health check endpoint (no auth required, for monitoring/uptime services)
	mux.HandleFunc("/health", healthCheckHandler)

	// Define routes with HTTPS enforcement, security headers, rate limiting
	mux.HandleFunc("/register", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAuth(registerHandler))))
	mux.HandleFunc("/login", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAuth(loginHandler))))
	// Protected routes (require JWT in Authorization header, with API rate limiting)
	mux.HandleFunc("/category/add", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, addCategoryHandler)))))
	mux.HandleFunc("/category/list", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, listCategoryHandler)))))
	mux.HandleFunc("/transaction/add", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, addTransactionHandler)))))
	mux.HandleFunc("/transaction/list", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, listTransactionHandler)))))
	mux.HandleFunc("/transaction/update", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, updateTransactionHandler)))))
	mux.HandleFunc("/transaction/delete", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, deleteTransactionHandler)))))
	mux.HandleFunc("/summary/totals", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryTotalsHandler)))))
	mux.HandleFunc("/summary/monthly", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryMonthlyHandler)))))
	mux.HandleFunc("/summary/current-month", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryCurrentMonthHandler)))))
	mux.HandleFunc("/summary/category", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryCategoryHandler)))))
	mux.HandleFunc("/summary/group", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryGroupHandler)))))
	mux.HandleFunc("/summary/category/monthly", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, summaryCategoryMonthHandler)))))
	mux.HandleFunc("/export", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, exportTransactionsHandler)))))
	mux.HandleFunc("/recurring/add", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, addRecurringHandler)))))
	mux.HandleFunc("/recurring/list", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, listRecurringHandler)))))
	mux.HandleFunc("/recurring/edit", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, editRecurringHandler)))))
	mux.HandleFunc("/recurring/delete", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, deleteRecurringHandler)))))
	mux.HandleFunc("/transactions/search", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, searchAndFilterTransactionsHandler)))))
	mux.HandleFunc("/budget/add", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, addBudgetHandler)))))
	mux.HandleFunc("/budget/list", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, listBudgetHandler)))))
	mux.HandleFunc("/budget/update", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, updateBudgetHandler)))))
	mux.HandleFunc("/budget/delete", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, deleteBudgetHandler)))))
	mux.HandleFunc("/budget/alerts", middleware.RequireHTTPS(middleware.SecurityHeaders(rateLimitAPI(middleware.RequireAuth(jwtSecret, budgetAlertsHandler)))))

	// Get CORS origins from environment (comma-separated) or use default
	corsOriginEnv := os.Getenv("CORS_ORIGIN")
	var allowedOrigins []string

	if corsOriginEnv == "" {
		allowedOrigins = []string{"http://localhost:3000"}
		slog.Warn("CORS_ORIGIN not set, using default localhost:3000. Set CORS_ORIGIN in production.")
	} else {
		// Support comma-separated multiple origins
		origins := strings.Split(corsOriginEnv, ",")
		for _, origin := range origins {
			origin = strings.TrimSpace(origin)
			// Validate each origin format
			if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
				slog.Error("Invalid CORS_ORIGIN format, must start with http:// or https://", "origin", origin)
				panic("Invalid CORS_ORIGIN configuration")
			}
			allowedOrigins = append(allowedOrigins, origin)
		}
		slog.Info("CORS origins configured", "origins", allowedOrigins)
	}

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowCredentials: true,
	})

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Get port from environment (Render provide PORT)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default for local development
	}
	serverAddr := "0.0.0.0:" + port

	// Start server in a goroutine
	server := &http.Server{
		Addr:    serverAddr,
		Handler: corsHandler.Handler(mux),
	}

	go func() {
		slog.Info("Server starting", "address", serverAddr, "port", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for shutdown signal
	<-sigChan
	slog.Info("Shutdown signal received, stopping server...")

	// Close recurring job gracefully
	close(recurringJobQuit)

	// Give server time to finish ongoing requests
	time.Sleep(constants.ShutdownGracePeriod)

	slog.Info("Server stopped")
}

// Builds the PostgreSQL connection URL from environment variables for use with sql.Open
// Supports two formats:
// 1. DATABASE_URL - single connection string (preferred for Render, Heroku, etc.)
// 2. Individual variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSLMODE)
func getDBConnURL() string {
	// Check if DATABASE_URL is provided (standard format for cloud platforms)
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}

	// Fallback to individual environment variables for local development
	// Default to require SSL for production safety (Supabase, Render, etc.)
	// Can be overridden with DB_SSLMODE=disable for local development
	sslMode := os.Getenv("DB_SSLMODE")
	if sslMode == "" {
		sslMode = "require"
	}

	return fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
		sslMode,
	)
}

// Health check endpoint for monitoring and uptime services (no authentication required)
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// Handles user registration via POST request (expects 'username', 'email', 'password')
func registerHandler(w http.ResponseWriter, r *http.Request) {
	slog.Info("registerHandler called",
		"method", r.Method,
		"remoteAddr", r.RemoteAddr,
		"contentType", r.Header.Get("Content-Type"))

	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only POST allowed",
		})
		return
	}

	username := strings.TrimSpace(r.FormValue("username"))
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")

	slog.Info("Register request received", "username", username, "email", email)

	if username == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Username is required",
		})
		return
	}
	// Validate username format (alphanumeric, underscore, hyphen only)
	if !utils.ValidateUsername(username) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Username must be 3-50 characters and contain only letters, numbers, underscores, or hyphens",
		})
		return
	}
	if email == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Email is required",
		})
		return
	}
	if _, err := mail.ParseAddress(email); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid email format",
		})
		return
	}
	if len(password) < constants.MinPasswordLength {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Password must be at least %d characters", constants.MinPasswordLength),
		})
		return
	}

	slog.Info("Calling RegisterUser", "username", username, "email", email)
	err := handlers.RegisterUser(r.Context(), db, username, email, password)

	slog.Info("RegisterUser returned", "error", err)
	w.Header().Set("Content-Type", "application/json")

	switch err {
	case nil:
		slog.Info("Sending success response for registration", "username", username)
		w.WriteHeader(http.StatusOK)
		encodeErr := json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "User registered successfully!"})
		if encodeErr != nil {
			slog.Error("Failed to encode registration success response", "error", encodeErr)
		} else {
			slog.Info("Registration success response sent", "username", username)
		}
		return
	case handlers.ErrEmailExists:
		slog.Info("Registration failed: email exists", "email", email)
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "This email is already registered."})
		return
	case handlers.ErrUsernameExists:
		slog.Info("Registration failed: username exists", "username", username)
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "This username is already taken."})
		return
	default:
		slog.Error("Registration error", "error", err, "username", username, "email", email)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Registration failed. Please try again later."})
		return
	}
}

// Handles user login via POST request (expects 'email', 'password')
// Returns a JWT token if credentials are valid
func loginHandler(w http.ResponseWriter, r *http.Request) {
	slog.Info("loginHandler called",
		"method", r.Method,
		"remoteAddr", r.RemoteAddr,
		"contentType", r.Header.Get("Content-Type"))

	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only POST allowed",
		})
		return
	}

	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")

	slog.Info("Login request received", "email", email)

	if email == "" || password == "" {
		slog.Info("Login validation failed: missing email or password")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Email and password are required",
		})
		return
	}

	slog.Info("Calling LoginUser", "email", email)
	token, err := handlers.LoginUser(r.Context(), db, email, password, jwtSecret)

	slog.Info("LoginUser returned", "error", err, "tokenLength", len(token))
	w.Header().Set("Content-Type", "application/json")

	switch err {
	case nil:
		slog.Info("Sending success response for login", "email", email, "tokenLength", len(token))
		w.WriteHeader(http.StatusOK)
		encodeErr := json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "token": token})
		if encodeErr != nil {
			slog.Error("Failed to encode login success response", "error", encodeErr)
		} else {
			slog.Info("Login success response sent", "email", email)
		}
		return
	case handlers.ErrUserNotFound, handlers.ErrInvalidCredentials:
		slog.Info("Login failed: invalid credentials", "email", email)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Email or password is incorrect."})
		return
	default:
		slog.Error("Login error", "error", err, "email", email)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Login failed. Please try again later."})
		return
	}
}

// AddCategoryHandler creates a category for an authenticated user.
func addCategoryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only POST allowed",
		})
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "User not authenticated",
		})
		return
	}

	name := utils.SanitizeCategoryName(r.FormValue("name"))
	ctype := strings.ToLower(strings.TrimSpace(r.FormValue("type")))

	if name == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Category name is required",
		})
		return
	}
	if len(name) > constants.MaxCategoryNameLength {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Category name must be %d characters or less", constants.MaxCategoryNameLength),
		})
		return
	}
	if ctype != "expense" && ctype != "income" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Category type must be 'expense' or 'income'",
		})
		return
	}

	categoryID, err := handlers.AddCategory(r.Context(), db, userID, name, ctype)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Add category failed: " + err.Error(),
		})
		return
	}

	// Return JSON of the newly created category
	newCategory := map[string]interface{}{
		"id":   categoryID,
		"name": name,
		"type": ctype,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"category": newCategory,
	})
}

// Handles listing all categories for a user (expects 'user_id' as a URL query parameter)
func listCategoryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only GET allowed",
		})
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "User not authenticated",
		})
		return
	}

	cats, err := handlers.ListCategories(r.Context(), db, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to list categories: " + err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"categories": cats,
	})
}

// Add a new transaction via POST
func addTransactionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Validate category_id
	categoryID, err := strconv.Atoi(r.FormValue("category_id"))
	if err != nil || categoryID <= 0 {
		utils.RespondWithValidationError(w, "Valid category_id is required (must be a positive number)")
		return
	}

	// Validate amount
	amountStr := r.FormValue("amount")
	if amountStr == "" {
		utils.RespondWithValidationError(w, "Amount is required")
		return
	}
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		utils.RespondWithValidationError(w, "Amount must be a valid number")
		return
	}
	if err := utils.ValidateAmount(amount); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate date format
	date := r.FormValue("date")
	if err := utils.ValidateTransactionDate(date); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	description := utils.SanitizeDescription(r.FormValue("description"))

	tx := models.Transaction{
		UserID:      userID,
		CategoryID:  categoryID,
		Amount:      amount,
		Description: description,
		Date:        date,
	}

	err = handlers.AddTransaction(r.Context(), db, tx)
	if err != nil {
		// Check if it's a category ownership error
		if err.Error() == "category not found or unauthorized" {
			utils.RespondWithValidationError(w, "Invalid category or you don't have permission to use this category")
			return
		}
		utils.RespondWithInternalError(w, err, "Add transaction")
		return
	}

	utils.RespondWithSuccess(w, http.StatusCreated, "Transaction added successfully", nil)
}

// List all transactions for a user (GET)
func listTransactionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only GET allowed",
		})
		return
	}
	userID, ok := middleware.GetUserID(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "User not authenticated",
		})
		return
	}
	list, err := handlers.ListTransactions(r.Context(), db, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to fetch transactions: " + err.Error(),
		})
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"transactions": list,
	})
}

// Update an existing transaction (POST)
func updateTransactionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Validate transaction ID
	id, err := strconv.Atoi(r.FormValue("id"))
	if err != nil || id <= 0 {
		utils.RespondWithValidationError(w, "Valid transaction ID is required (must be a positive number)")
		return
	}

	// Validate category_id
	categoryID, err := strconv.Atoi(r.FormValue("category_id"))
	if err != nil || categoryID <= 0 {
		utils.RespondWithValidationError(w, "Valid category_id is required (must be a positive number)")
		return
	}

	// Validate amount
	amountStr := r.FormValue("amount")
	if amountStr == "" {
		utils.RespondWithValidationError(w, "Amount is required")
		return
	}
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		utils.RespondWithValidationError(w, "Amount must be a valid number")
		return
	}
	if err := utils.ValidateAmount(amount); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate date format
	date := r.FormValue("date")
	if err := utils.ValidateTransactionDate(date); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	description := utils.SanitizeDescription(r.FormValue("description"))

	tx := models.Transaction{
		ID:          id,
		UserID:      userID,
		CategoryID:  categoryID,
		Amount:      amount,
		Description: description,
		Date:        date,
	}

	err = handlers.UpdateTransaction(r.Context(), db, tx)
	if err != nil {
		if err.Error() == "category not found or unauthorized" {
			utils.RespondWithValidationError(w, "Invalid category or you don't have permission to use this category")
			return
		}
		utils.RespondWithInternalError(w, err, "Update transaction")
		return
	}

	utils.RespondWithSuccess(w, http.StatusOK, "Transaction updated successfully", nil)
}

// Delete a transaction (POST)
func deleteTransactionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only POST allowed",
		})
		return
	}
	userID, ok := middleware.GetUserID(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "User not found in context",
		})
		return
	}

	id, err := strconv.Atoi(r.FormValue("id"))
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Valid transaction ID is required",
		})
		return
	}

	err = handlers.DeleteTransaction(r.Context(), db, id, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to delete transaction: " + err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Transaction deleted",
	})
}

// Returns overall totals for this user
func summaryTotalsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	expenses, income, err := handlers.GetTotals(r.Context(), db, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary totals")
		return
	}
	json.NewEncoder(w).Encode(map[string]float64{
		"total_expenses": expenses,
		"total_income":   income,
	})
}

// Returns monthly group totals for this user
func summaryMonthlyHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	summary, err := handlers.GetMonthlyTotals(r.Context(), db, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary monthly")
		return
	}
	json.NewEncoder(w).Encode(summary)
}

// Returns current month summary with normalized monthly recurring
func summaryCurrentMonthHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	summary, err := handlers.GetCurrentMonthSummary(r.Context(), db, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary current month")
		return
	}
	json.NewEncoder(w).Encode(summary)
}

// Returns category-wise breakdown for this user for a date range
func summaryCategoryHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	result, err := handlers.GetCategoryBreakdown(r.Context(), db, userID, from, to)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary category")
		return
	}
	json.NewEncoder(w).Encode(result)
}

// Group by period endpoint
func summaryGroupHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	granularity := r.URL.Query().Get("by")
	summary, err := handlers.GetGroupTotals(r.Context(), db, userID, granularity)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary group")
		return
	}
	json.NewEncoder(w).Encode(summary)
}

// Category-wise summary for given year/month
func summaryCategoryMonthHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	year, _ := strconv.Atoi(r.URL.Query().Get("year"))
	month, _ := strconv.Atoi(r.URL.Query().Get("month"))
	if year == 0 || month == 0 {
		utils.RespondWithValidationError(w, "year and month required")
		return
	}
	result, err := handlers.GetCategoryMonthSummary(r.Context(), db, userID, year, month)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Summary category month")
		return
	}
	json.NewEncoder(w).Encode(result)
}

// Export transactions to CSV or JSON
func exportTransactionsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	transactions, err := handlers.ListTransactions(r.Context(), db, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Export transactions")
		return
	}

	format := r.URL.Query().Get("format")
	if format == "csv" {
		w.Header().Set("Content-Disposition", "attachment;filename=transactions.csv")
		w.Header().Set("Content-Type", "text/csv")
		writer := csv.NewWriter(w)
		if err := writer.Write([]string{"ID", "CategoryID", "Amount", "Description", "Date", "CreatedAt"}); err != nil {
			utils.RespondWithInternalError(w, err, "CSV header write")
			return
		}
		for _, tx := range transactions {
			if err := writer.Write([]string{
				strconv.Itoa(tx.ID),
				strconv.Itoa(tx.CategoryID),
				fmt.Sprintf("%.2f", tx.Amount),
				tx.Description,
				tx.Date,
				tx.CreatedAt,
			}); err != nil {
				utils.RespondWithInternalError(w, err, "CSV row write")
				return
			}
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			utils.RespondWithInternalError(w, err, "CSV flush")
			return
		}
		return
	}
	// Default: JSON
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(transactions); err != nil {
		utils.RespondWithInternalError(w, err, "JSON encode")
		return
	}
}

// User to add a recurring transaction.
func addRecurringHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Validate category_id
	categoryID, err := strconv.Atoi(r.FormValue("category_id"))
	if err != nil || categoryID <= 0 {
		utils.RespondWithValidationError(w, "Valid category_id is required (must be a positive number)")
		return
	}

	// Validate amount
	amountStr := r.FormValue("amount")
	if amountStr == "" {
		utils.RespondWithValidationError(w, "Amount is required")
		return
	}
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		utils.RespondWithValidationError(w, "Amount must be a valid number")
		return
	}
	if err := utils.ValidateAmount(amount); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate start date format
	startDate := r.FormValue("start_date")
	if err := utils.ValidateRecurringDate(startDate); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate recurrence
	recurrence := strings.ToLower(strings.TrimSpace(r.FormValue("recurrence")))
	if recurrence == "" {
		utils.RespondWithValidationError(w, "Recurrence is required")
		return
	}
	validRecurrence := map[string]bool{
		"daily":   true,
		"weekly":  true,
		"monthly": true,
		"yearly":  true,
	}
	if !validRecurrence[recurrence] {
		utils.RespondWithValidationError(w, "Recurrence must be one of: daily, weekly, monthly, yearly")
		return
	}

	description := utils.SanitizeDescription(r.FormValue("description"))

	rt := models.RecurringTransaction{
		UserID:      userID,
		CategoryID:  categoryID,
		Amount:      amount,
		Description: description,
		StartDate:   startDate,
		Recurrence:  recurrence,
	}

	err = handlers.AddRecurringTransaction(r.Context(), db, rt)
	if err != nil {
		if err.Error() == "category not found or unauthorized" {
			utils.RespondWithValidationError(w, "Invalid category or you don't have permission to use this category")
			return
		}
		utils.RespondWithInternalError(w, err, "Add recurring transaction")
		return
	}

	utils.RespondWithSuccess(w, http.StatusCreated, "Recurring transaction added successfully", nil)
}

// Returns all recurring transactions for the authenticated user
func listRecurringHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	recurrings, err := handlers.ListRecurringTransactions(r.Context(), db, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "List recurring transactions")
		return
	}
	json.NewEncoder(w).Encode(recurrings)
}

func editRecurringHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	id, err := strconv.Atoi(r.FormValue("id"))
	if err != nil {
		utils.RespondWithValidationError(w, "Valid id is required")
		return
	}
	amount, err := strconv.ParseFloat(r.FormValue("amount"), 64)
	if err != nil || amount <= 0 {
		utils.RespondWithValidationError(w, "Amount must be a positive number")
		return
	}
	description := r.FormValue("description")
	startDate := r.FormValue("start_date")
	recurrence := strings.ToLower(strings.TrimSpace(r.FormValue("recurrence")))

	err = handlers.EditRecurringTransaction(r.Context(), db, userID, id, amount, description, startDate, recurrence)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Edit recurring transaction")
		return
	}
	utils.RespondWithSuccess(w, http.StatusOK, "Recurring transaction updated successfully", nil)
}

func deleteRecurringHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "")
		return
	}
	id, err := strconv.Atoi(r.FormValue("id"))
	if err != nil {
		utils.RespondWithValidationError(w, "Valid id is required")
		return
	}
	err = handlers.DeleteRecurringTransaction(r.Context(), db, id, userID)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Delete recurring transaction")
		return
	}
	utils.RespondWithSuccess(w, http.StatusOK, "Recurring transaction deleted successfully", nil)
}

func searchAndFilterTransactionsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Pagination with validation
	limit := 20 // default
	if l := r.URL.Query().Get("limit"); l != "" {
		v, err := strconv.Atoi(l)
		if err != nil {
			utils.RespondWithValidationError(w, "Invalid limit parameter: must be a number")
			return
		}
		limit = v
	}
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		v, err := strconv.Atoi(o)
		if err != nil {
			utils.RespondWithValidationError(w, "Invalid offset parameter: must be a number")
			return
		}
		offset = v
	}

	// Validate pagination parameters
	if err := utils.ValidatePaginationParams(limit, offset); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Sorting
	sortParam := r.URL.Query().Get("sort")
	allowedSorts := map[string]string{
		"date_asc":    "t.date ASC, t.created_at DESC",
		"date_desc":   "t.date DESC, t.created_at DESC",
		"amount_asc":  "t.amount ASC, t.created_at DESC",
		"amount_desc": "t.amount DESC, t.created_at DESC",
	}
	// Default: Sort by when transaction was created (most recent first)
	orderBy := "t.created_at DESC"
	if s, ok := allowedSorts[sortParam]; ok {
		orderBy = s
	}

	// Filters
	keyword := r.URL.Query().Get("q")
	categoryID, _ := strconv.Atoi(r.URL.Query().Get("category_id"))
	dateFrom := r.URL.Query().Get("from")
	dateTo := r.URL.Query().Get("to")
	amountMin, _ := strconv.ParseFloat(r.URL.Query().Get("min_amount"), 64)
	amountMax, _ := strconv.ParseFloat(r.URL.Query().Get("max_amount"), 64)

	list, err := handlers.FilterTransactionsPaginated(
		r.Context(), db, userID, keyword, categoryID, dateFrom, dateTo, amountMin, amountMax, orderBy, limit, offset,
	)
	if err != nil {
		utils.RespondWithInternalError(w, err, "Search transactions")
		return
	}

	utils.RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"transactions": list,
		"limit":        limit,
		"offset":       offset,
	})
}

// Budget handlers
func addBudgetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Validate category_id (0 means overall budget, > 0 means category-specific)
	categoryID, err := strconv.Atoi(r.FormValue("category_id"))
	if err != nil || categoryID < 0 {
		utils.RespondWithValidationError(w, "Valid category_id is required (0 for overall budget, or a positive number for category-specific budget)")
		return
	}

	// Validate amount
	amountStr := r.FormValue("amount")
	if amountStr == "" {
		utils.RespondWithValidationError(w, "Amount is required")
		return
	}
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		utils.RespondWithValidationError(w, "Amount must be a valid number")
		return
	}
	if err := utils.ValidateAmount(amount); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate period
	period := strings.ToLower(strings.TrimSpace(r.FormValue("period")))
	if period == "" {
		period = "monthly"
	}
	if period != "monthly" && period != "yearly" {
		utils.RespondWithValidationError(w, "Period must be 'monthly' or 'yearly'")
		return
	}

	// Validate alert threshold
	alertThreshold := 80 // default
	alertThresholdStr := r.FormValue("alert_threshold")
	if alertThresholdStr != "" {
		threshold, err := strconv.Atoi(alertThresholdStr)
		if err != nil {
			utils.RespondWithValidationError(w, "Alert threshold must be a valid number")
			return
		}
		if threshold < 0 || threshold > 100 {
			utils.RespondWithValidationError(w, "Alert threshold must be between 0 and 100")
			return
		}
		alertThreshold = threshold
	}

	budget := models.Budget{
		UserID:         userID,
		CategoryID:     categoryID,
		Amount:         amount,
		Period:         period,
		AlertThreshold: alertThreshold,
	}

	err = handlers.AddBudget(r.Context(), db, budget)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			utils.RespondWithConflict(w, err.Error())
			return
		}
		utils.RespondWithInternalError(w, err, "Add budget")
		return
	}

	utils.RespondWithSuccess(w, http.StatusCreated, "Budget added successfully", nil)
}

func listBudgetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := middleware.GetUserID(r)
	if !ok {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Unauthorized",
		})
		return
	}

	budgets, err := handlers.ListBudgets(r.Context(), db, userID)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"budgets": budgets,
	})
}

func updateBudgetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.RespondWithMethodNotAllowed(w, "POST")
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		utils.RespondWithUnauthorized(w, "User not authenticated")
		return
	}

	// Validate budget ID
	budgetID, err := strconv.Atoi(r.FormValue("id"))
	if err != nil || budgetID <= 0 {
		utils.RespondWithValidationError(w, "Valid budget ID is required (must be a positive number)")
		return
	}

	// Validate amount
	amountStr := r.FormValue("amount")
	if amountStr == "" {
		utils.RespondWithValidationError(w, "Amount is required")
		return
	}
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		utils.RespondWithValidationError(w, "Amount must be a valid number")
		return
	}
	if err := utils.ValidateAmount(amount); err != nil {
		utils.RespondWithValidationError(w, err.Error())
		return
	}

	// Validate alert threshold
	alertThresholdStr := r.FormValue("alert_threshold")
	if alertThresholdStr == "" {
		utils.RespondWithValidationError(w, "Alert threshold is required")
		return
	}
	alertThreshold, err := strconv.Atoi(alertThresholdStr)
	if err != nil {
		utils.RespondWithValidationError(w, "Alert threshold must be a valid number")
		return
	}
	if alertThreshold < 0 || alertThreshold > 100 {
		utils.RespondWithValidationError(w, "Alert threshold must be between 0 and 100")
		return
	}

	err = handlers.UpdateBudget(r.Context(), db, userID, budgetID, amount, alertThreshold)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			utils.RespondWithNotFound(w, "Budget")
			return
		}
		utils.RespondWithInternalError(w, err, "Update budget")
		return
	}

	utils.RespondWithSuccess(w, http.StatusOK, "Budget updated successfully", nil)
}

func deleteBudgetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Only POST allowed",
		})
		return
	}

	userID, ok := middleware.GetUserID(r)
	if !ok {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Unauthorized",
		})
		return
	}

	budgetID, err := strconv.Atoi(r.FormValue("id"))
	if err != nil || budgetID <= 0 {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Valid budget ID is required",
		})
		return
	}

	err = handlers.DeleteBudget(r.Context(), db, budgetID, userID)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Budget deleted successfully",
	})
}

func budgetAlertsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := middleware.GetUserID(r)
	if !ok {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Unauthorized",
		})
		return
	}

	alerts, err := handlers.GetBudgetAlerts(r.Context(), db, userID)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(alerts)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
