import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScanComparison } from './types';

// ─── Resend mock ──────────────────────────────────────────────────────────────
// vi.hoisted ensures mockSend is available when the vi.mock factory runs

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

// ─── Logger mock (suppress noise) ─────────────────────────────────────────────

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import { sendAlertEmail } from './alert-email';
import { logger } from './logger';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeComparison(overrides?: Partial<ScanComparison>): ScanComparison {
  return {
    scoreDelta: -5,
    newP0Issues: [],
    resolvedIssues: [],
    unchangedP0Count: 0,
    categoryDeltas: {},
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendAlertEmail', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockSend.mockResolvedValue({ data: { id: 'mock-id' }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'test@example.com';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://example.com';
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('sends an email with correct recipient and subject', async () => {
    const comparison = makeComparison({ scoreDelta: -8 });

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      comparison,
      ['Score dropped by 8 points'],
      'scan-123',
    );

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe('owner@example.com');
    expect(call.subject).toContain('mysite.com');
    expect(call.subject).toContain('-8');
  });

  it('includes new P0 issues in the subject summary', async () => {
    const comparison = makeComparison({
      scoreDelta: -3,
      newP0Issues: [
        { code: 'missing_alt', title: 'Images missing alt text', category: 'accessibility' },
        { code: 'broken_link', title: 'Broken links found', category: 'links' },
      ],
    });

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      comparison,
      ['2 new critical issue(s) detected'],
      'scan-456',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('2 new critical issues');
  });

  it('includes the scan link in the HTML body', async () => {
    const comparison = makeComparison();

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      comparison,
      ['Score dropped by 5 points'],
      'scan-789',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.html).toContain('https://example.com/scan/scan-789');
  });

  it('escapes HTML in URL and issue titles to prevent XSS', async () => {
    const comparison = makeComparison({
      newP0Issues: [
        {
          code: 'xss_test',
          title: '<script>alert("xss")</script>',
          category: '<img onerror=alert(1)>',
        },
      ],
    });

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com/?q=<evil>',
      comparison,
      ['Score dropped'],
      'scan-xss',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.html).not.toContain('<script>');
    expect(call.html).not.toContain('<img onerror=');
    expect(call.html).toContain('&lt;script&gt;');
  });

  it('includes resolved issues section when present', async () => {
    const comparison = makeComparison({
      resolvedIssues: [
        { code: 'missing_title', title: 'Page missing title tag', category: 'seo' },
      ],
    });

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      comparison,
      ['Score dropped by 5 points'],
      'scan-res',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.html).toContain('Resolved Issues');
    expect(call.html).toContain('Page missing title tag');
  });

  it('skips sending and logs a warning when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      makeComparison(),
      ['Score dropped'],
      'scan-nokey',
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('RESEND_API_KEY'),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('logs an error if Resend returns an error but does not throw', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Domain not verified', name: 'validation_error' },
    });

    await expect(
      sendAlertEmail(
        'owner@example.com',
        'https://mysite.com',
        makeComparison(),
        ['Score dropped'],
        'scan-err',
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send alert email'),
      expect.objectContaining({ error: 'Domain not verified' }),
    );
  });

  it('uses a positive delta prefix in the subject when score improves', async () => {
    const comparison = makeComparison({ scoreDelta: 12 });

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      comparison,
      ['Score improved by 12 points'],
      'scan-pos',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('+12');
  });

  it('uses RESEND_FROM_EMAIL env var as the from address', async () => {
    process.env.RESEND_FROM_EMAIL = 'Alerts <custom@alerts.com>';

    await sendAlertEmail(
      'owner@example.com',
      'https://mysite.com',
      makeComparison(),
      ['Score dropped'],
      'scan-from',
    );

    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBe('Alerts <custom@alerts.com>');
  });
});
