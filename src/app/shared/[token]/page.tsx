'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ScanResultsView, type ScanData } from '@/components/scan-results';

export default function SharedScanPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/shared/${token}`);
        if (!res.ok) throw new Error('Shared report not found');
        const json = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load shared report');
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <ScanResultsView
      data={data}
      error={error}
      variant="shared"
    />
  );
}
