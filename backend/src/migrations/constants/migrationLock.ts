// The lock that lets one backend at a time run migrations (see `runMigrations`).

export const migrationLockCollectionName = 'migration_lock';

/** The id of the only document in the lock collection. */
export const MIGRATION_LOCK_ID = 'migrations';

/** How long a lock lasts without renewal; the owner renews it every third of this. */
export const MIGRATION_LOCK_LEASE_MS = 5 * 60 * 1000;

/** How often a backend that cannot take the lock tries again. */
export const MIGRATION_LOCK_RETRY_MS = 500;
