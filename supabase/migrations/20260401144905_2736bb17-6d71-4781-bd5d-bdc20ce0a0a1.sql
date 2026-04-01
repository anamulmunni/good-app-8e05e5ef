
-- Clean up duplicate private_keys (keep the first one)
WITH dup_key AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY private_key ORDER BY created_at, id) rn
  FROM verification_pool
),
dup_user_unused AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY added_by ORDER BY created_at DESC, id DESC) rn
  FROM verification_pool
  WHERE is_used = false
)
DELETE FROM verification_pool
WHERE id IN (
  SELECT id FROM dup_key WHERE rn > 1
  UNION
  SELECT id FROM dup_user_unused WHERE rn > 1
);

-- Add unique constraint: same private_key can't exist twice
CREATE UNIQUE INDEX IF NOT EXISTS verification_pool_private_key_uniq ON verification_pool (private_key);

-- Add unique constraint: one active (unused) key per user
CREATE UNIQUE INDEX IF NOT EXISTS verification_pool_one_active_key_per_user_uniq ON verification_pool (added_by) WHERE is_used = false;
