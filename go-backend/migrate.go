package main

import (
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/vidya381/myspendo-backend/utils"
)

func main() {
	// Initialize structured logger
	utils.InitLogger()

	// Load .env file (silently ignore if not found - normal in production)
	_ = godotenv.Load()

	// Validate required database environment variables
	if err := utils.ValidateDBConfig(); err != nil {
		slog.Error("Configuration validation failed", "error", err)
		os.Exit(1)
	}

	// Connect to database
	db, err := sql.Open("pgx", getDBConnURL())
	if err != nil {
		slog.Error("Failed to open database connection", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		slog.Error("Failed to ping database", "error", err)
		os.Exit(1)
	}

	slog.Info("Connected to PostgreSQL successfully")

	// Read all migration files from the migrations directory
	migrationDir := "migrations"
	entries, err := os.ReadDir(migrationDir)
	if err != nil {
		slog.Error("Failed to read migrations directory", "error", err)
		os.Exit(1)
	}

	// Execute each migration file in order (sorted by filename)
	migrationCount := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		migrationFile := fmt.Sprintf("%s/%s", migrationDir, entry.Name())
		slog.Info("Applying migration", "file", entry.Name())

		sqlBytes, err := os.ReadFile(migrationFile)
		if err != nil {
			slog.Error("Failed to read migration file", "file", migrationFile, "error", err)
			os.Exit(1)
		}

		sqlStatement := string(sqlBytes)
		_, err = db.Exec(sqlStatement)
		if err != nil {
			slog.Error("Failed to execute migration", "file", entry.Name(), "error", err)
			os.Exit(1)
		}

		slog.Info("Migration applied successfully", "file", entry.Name())
		migrationCount++
	}

	slog.Info("All migrations completed", "count", migrationCount)
}

func getDBConnURL() string {
	// Check if DATABASE_URL is provided (standard format for cloud platforms)
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}

	// Fallback to individual environment variables for local development
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	// Default to require SSL for production safety (Neon, Render, etc.)
	// Can be overridden with DB_SSLMODE=disable for local development
	sslMode := os.Getenv("DB_SSLMODE")
	if sslMode == "" {
		sslMode = "require"
	}

	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslMode)
}
