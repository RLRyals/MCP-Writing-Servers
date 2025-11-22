# Database Migrations

This directory contains standalone SQL migration files that can be applied to existing databases.

## How to Apply Migrations

### Using psql
```bash
psql -U your_username -d your_database -f migrations/023_npe_tables.sql
```

### Using Docker Compose
If your database is running in Docker Compose:
```bash
docker-compose exec db psql -U your_username -d your_database -f /path/to/migrations/023_npe_tables.sql
```

### Using environment variables from .env
```bash
# Load environment variables
source .env

# Apply migration
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/023_npe_tables.sql
```

## Migration Files

- **023_npe_tables.sql** - Adds NPE (Narrative Physics Engine) tables for tracking:
  - Causality chains and causal links
  - Character decisions with NPE alignment checks
  - Scene validation and NPE compliance scoring
  - POV bias tracking

## Notes

- All migrations are idempotent and can be run multiple times safely
- Migrations check the `migrations` table to avoid duplicate application
- The `init.sql` file includes all migrations for new database installations
- These standalone files are for updating existing databases
