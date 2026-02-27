/**
 * SEO issue structure returned by all SEO checking functions.
 */
export interface SEOIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'CONTENT' | 'ACCESSIBILITY';
  title: string;
  whyItMatters: string;
  howToFix: string;
  evidence: {
    url: string;
    expected?: string;
    actual?: string | null;
    snippet?: string;
    src?: string;
    width?: number;
    height?: number;
  };
  impact: number;
  effort: number;
}

/**
 * Extended issue type for SPA detection that includes additional categories.
 */
export interface SPAIssue {
  code: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'SEO' | 'ACCESSIBILITY' | 'PERFORMANCE' | 'LINKS' | 'CONTENT' | 'SECURITY';
  title: string;
  whyItMatters: string | null;
  howToFix: string | null;
  evidence: object;
  impact: number | null;
  effort: number | null;
}
