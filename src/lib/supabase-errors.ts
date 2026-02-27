/**
 * Supabase/PostgREST error codes
 * @see https://postgrest.org/en/stable/references/errors.html
 */

/** Row not found - returned when .single() finds no matching row */
export const SUPABASE_NOT_FOUND = 'PGRST116';

/** Multiple rows found - returned when .single() finds more than one row */
export const SUPABASE_MULTIPLE_ROWS = 'PGRST116';

/** Check if an error indicates a "not found" condition */
export function isNotFoundError(error: { code?: string } | null): boolean {
  return error?.code === SUPABASE_NOT_FOUND;
}
