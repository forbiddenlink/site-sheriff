import { isDisallowedByRobots } from '../robots-checker';

/**
 * Detect if a URL is likely an authenticated/dashboard page that shouldn't
 * be prioritized for SEO issues (since search engines can't access them).
 * Also checks robots.txt Disallow patterns if provided.
 */
export function isLikelyAuthPage(url: string, disallowPatterns: string[] = []): boolean {
  // Check robots.txt Disallow patterns first
  if (isDisallowedByRobots(url, disallowPatterns)) {
    return true;
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const authPatterns = [
      '/dashboard',
      '/admin',
      '/account',
      '/settings',
      '/profile',
      '/billing',
      '/app/',      // Common SaaS app routes
      '/console',
      '/portal',
      '/my-',       // my-account, my-orders, etc.
      '/user/',
      '/member/',
    ];
    return authPatterns.some(pattern => pathname.includes(pattern));
  } catch {
    return false;
  }
}
