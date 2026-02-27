/**
 * Scanner Core Module
 *
 * This module provides core utilities for the scanner:
 * - scoring.ts - Score calculation (computeCategoryScore, computeSummary)
 * - utils.ts - Utility functions (dedupeIssues, updateProgress, isHtmlPage)
 * - types.ts - Type definitions (ScanContext, ScanIssue)
 */

export { SEVERITY_PENALTY, impactToScore, computeCategoryScore, computeSummary } from './scoring';
export { updateProgress, dedupeIssues, isHtmlPage, normalizeForCompare } from './utils';
export type { ScanContext, ScanIssue, PhaseName } from './types';
export { ALL_PHASE_NAMES } from './types';
