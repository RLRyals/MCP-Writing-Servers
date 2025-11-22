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

- **023_npe_tables.sql** - (DEPRECATED - replaced by 024) Initial NPE tables
- **024_update_npe_schema.sql** - Comprehensive NPE (Narrative Physics Engine) schema:
  - **Causality tracking** (npe_causality_chains, npe_causal_links) - Track cause-and-effect narrative chains
  - **Character decisions** (npe_character_decisions) - Log decisions with NPE alignment checks and alternatives
  - **Scene validation** (npe_scene_validation) - Validate scene architecture, pacing, dialogue, POV physics
  - **Pacing analysis** (npe_pacing_analysis) - Analyze energy distribution and temporal mechanics
  - **Stakes pressure** (npe_stakes_pressure) - Track escalation and pressure levels
  - **Information economy** (npe_information_economy) - Track reveals and their impact on choices
  - **Relationship tension** (npe_relationship_tension) - Bidirectional tension tracking between characters
  - **Compliance summary** (npe_compliance_summary) - Overall NPE compliance scores and violations

## Notes

- All migrations are idempotent and can be run multiple times safely
- Migrations check the `migrations` table to avoid duplicate application
- The `init.sql` file includes all migrations for new database installations
- These standalone files are for updating existing databases
