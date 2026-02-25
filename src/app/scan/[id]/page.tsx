'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ScanResultsView, type ScanData } from '@/components/scan-results';
import { CrawlMap } from './crawl-map';

export default function ScanPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/scan/${id}`);
        if (!res.ok) throw new Error('Scan not found');
        const json = await res.json();
        if (cancelled) return;
        setData(json);

        // Schedule next poll if still in progress
        if (json.status === 'QUEUED' || json.status === 'RUNNING') {
          setTimeout(() => { if (!cancelled) fetchData(); }, 2000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load scan');
        }
      }
    };

    fetchData();

    return () => { cancelled = true; };
  }, [id]);

  return (
    <ScanResultsView
      data={data}
      error={error}
      variant="full"
      renderCrawlMap={(pages, baseUrl) => <CrawlMap pages={pages} baseUrl={baseUrl} />}
    />
  );
}
