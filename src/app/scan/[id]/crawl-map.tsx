'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CrawlMapProps {
  pages: Array<{
    url: string;
    statusCode: number | null;
    title: string | null;
    links?: Array<{ href: string; text: string; isInternal: boolean }> | null;
  }>;
  baseUrl: string;
}

interface GraphNode {
  id: string;
  url: string;
  title: string | null;
  statusCode: number | null;
  incomingCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isHome: boolean;
}

interface GraphEdge {
  source: number;
  target: number;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash, hash, and common tracking params
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return u.origin + path;
  } catch {
    return url;
  }
}

function shortenUrl(url: string, maxLen = 40): string {
  try {
    const u = new URL(url);
    const display = u.pathname === '/' ? u.hostname : u.hostname + u.pathname;
    return display.length > maxLen ? display.slice(0, maxLen - 1) + '…' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 1) + '…' : url;
  }
}

function statusColor(code: number | null): string {
  if (code === null || code === undefined) return '#64748b';
  if (code >= 200 && code < 300) return '#34d399';
  if (code >= 300 && code < 400) return '#fbbf24';
  return '#ef4444';
}

export function CrawlMap({ pages, baseUrl }: CrawlMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const iterationRef = useRef(0);
  const dragRef = useRef<{ nodeIdx: number; offsetX: number; offsetY: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; url: string; title: string | null } | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const simulationRunning = useRef(true);

  // Build graph data
  const buildGraph = useCallback(() => {
    const normalizedBase = normalizeUrl(baseUrl);
    const urlToIndex = new Map<string, number>();
    const nodes: GraphNode[] = [];

    // Create nodes from crawled pages
    pages.forEach((page, _i) => {
      const normUrl = normalizeUrl(page.url);
      if (urlToIndex.has(normUrl)) return; // skip duplicates
      urlToIndex.set(normUrl, nodes.length);
      nodes.push({
        id: normUrl,
        url: page.url,
        title: page.title,
        statusCode: page.statusCode,
        incomingCount: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 6,
        isHome: normUrl === normalizedBase || normUrl === normalizedBase + '/',
      });
    });

    // Build edges from internal links between crawled pages
    const edgeSet = new Set<string>();
    const edges: GraphEdge[] = [];

    pages.forEach((page) => {
      const sourceNorm = normalizeUrl(page.url);
      const sourceIdx = urlToIndex.get(sourceNorm);
      if (sourceIdx === undefined) return;

      if (page.links) {
        page.links
          .filter((l) => l.isInternal)
          .forEach((link) => {
            // Resolve relative URLs
            let targetUrl: string;
            try {
              targetUrl = new URL(link.href, page.url).href;
            } catch {
              return;
            }
            const targetNorm = normalizeUrl(targetUrl);
            const targetIdx = urlToIndex.get(targetNorm);
            if (targetIdx === undefined || targetIdx === sourceIdx) return;

            const edgeKey = `${sourceIdx}-${targetIdx}`;
            if (edgeSet.has(edgeKey)) return;
            edgeSet.add(edgeKey);
            edges.push({ source: sourceIdx, target: targetIdx });
            nodes[targetIdx].incomingCount++;
          });
      }
    });

    // Calculate radii based on incoming links
    const maxIncoming = Math.max(1, ...nodes.map((n) => n.incomingCount));
    nodes.forEach((node) => {
      const t = node.incomingCount / maxIncoming;
      node.radius = node.isHome ? 20 : 6 + t * 14;
    });

    // Initial positions: home at center, others in a circle
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const spread = Math.min(dimensions.width, dimensions.height) * 0.35;

    nodes.forEach((node, i) => {
      if (node.isHome) {
        node.x = cx;
        node.y = cy;
      } else {
        const angle = (2 * Math.PI * i) / nodes.length + (Math.random() - 0.5) * 0.5;
        const dist = spread * (0.5 + Math.random() * 0.5);
        node.x = cx + Math.cos(angle) * dist;
        node.y = cy + Math.sin(angle) * dist;
      }
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
    iterationRef.current = 0;
    simulationRunning.current = true;
  }, [pages, baseUrl, dimensions]);

  // Force simulation step
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (nodes.length === 0) return;

    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const repulsionStrength = 5000;
    const attractionStrength = 0.005;
    const centerGravity = 0.01;
    const damping = 0.9;

    // Reset forces
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);

    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distSq = dx * dx + dy * dy + 1;
        const force = repulsionStrength / distSq;
        const dist = Math.sqrt(distSq);
        const forceX = (dx / dist) * force;
        const forceY = (dy / dist) * force;
        fx[i] -= forceX;
        fy[i] -= forceY;
        fx[j] += forceX;
        fy[j] += forceY;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const dx = nodes[edge.target].x - nodes[edge.source].x;
      const dy = nodes[edge.target].y - nodes[edge.source].y;
      const forceX = dx * attractionStrength;
      const forceY = dy * attractionStrength;
      fx[edge.source] += forceX;
      fy[edge.source] += forceY;
      fx[edge.target] -= forceX;
      fy[edge.target] -= forceY;
    }

    // Center gravity
    for (let i = 0; i < nodes.length; i++) {
      fx[i] += (cx - nodes[i].x) * centerGravity;
      fy[i] += (cy - nodes[i].y) * centerGravity;
    }

    // Apply forces
    let totalVelocity = 0;
    for (let i = 0; i < nodes.length; i++) {
      // Skip dragged node
      if (dragRef.current && dragRef.current.nodeIdx === i) continue;

      nodes[i].vx = (nodes[i].vx + fx[i]) * damping;
      nodes[i].vy = (nodes[i].vy + fy[i]) * damping;
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;

      // Clamp to bounds
      const pad = nodes[i].radius + 2;
      nodes[i].x = Math.max(pad, Math.min(dimensions.width - pad, nodes[i].x));
      nodes[i].y = Math.max(pad, Math.min(dimensions.height - pad, nodes[i].y));

      totalVelocity += Math.abs(nodes[i].vx) + Math.abs(nodes[i].vy);
    }

    iterationRef.current++;

    // Stop when settled
    if (iterationRef.current > 300 || totalVelocity < 0.1) {
      simulationRunning.current = false;
    }
  }, [dimensions]);

  // Render to canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = dimensions.width;
    const h = dimensions.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, w, h);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Determine connected set for selection highlight
    const connectedNodes = new Set<number>();
    const connectedEdges = new Set<number>();
    if (selectedNode !== null) {
      connectedNodes.add(selectedNode);
      edges.forEach((edge, idx) => {
        if (edge.source === selectedNode || edge.target === selectedNode) {
          connectedEdges.add(idx);
          connectedNodes.add(edge.source);
          connectedNodes.add(edge.target);
        }
      });
    }

    // Draw edges
    edges.forEach((edge, idx) => {
      const source = nodes[edge.source];
      const target = nodes[edge.target];
      if (!source || !target) return;

      const isHighlighted = connectedEdges.has(idx);
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isHighlighted
        ? 'rgba(99, 102, 241, 0.6)'
        : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach((node, idx) => {
      const isConnected = connectedNodes.has(idx);
      const isSelected = selectedNode === idx;
      const color = statusColor(node.statusCode);

      // Glow for selected/connected
      if (isSelected || isConnected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
          node.x, node.y, node.radius,
          node.x, node.y, node.radius + 8
        );
        gradient.addColorStop(0, isSelected ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = isConnected || selectedNode === null ? 1 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = isSelected ? '#6366f1' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = isSelected ? 2 : 0.5;
      ctx.stroke();
    });
  }, [dimensions, selectedNode]);

  // Animation loop
  const loop = useCallback(() => {
    if (simulationRunning.current) {
      simulate();
    }
    render();
    animFrameRef.current = requestAnimationFrame(loop);
  }, [simulate, render]);

  // Initialize
  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [loop]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) {
          setDimensions((prev) => (prev.width === w ? prev : { width: w, height: 500 }));
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Hit testing
  const findNodeAt = useCallback((mx: number, my: number): number | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const dx = mx - nodes[i].x;
      const dy = my - nodes[i].y;
      if (dx * dx + dy * dy <= (nodes[i].radius + 4) ** 2) {
        return i;
      }
    }
    return null;
  }, []);

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = getCanvasCoords(e);

      // Handle drag
      if (dragRef.current) {
        const node = nodesRef.current[dragRef.current.nodeIdx];
        if (node) {
          node.x = x - dragRef.current.offsetX;
          node.y = y - dragRef.current.offsetY;
          node.vx = 0;
          node.vy = 0;
        }
        return;
      }

      const idx = findNodeAt(x, y);
      if (idx === null) {
        setTooltip(null);
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      } else {
        const node = nodesRef.current[idx];
        setTooltip({
          x: e.clientX,
          y: e.clientY,
          url: node.url,
          title: node.title,
        });
        if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
      }
    },
    [findNodeAt, getCanvasCoords]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = getCanvasCoords(e);
      const idx = findNodeAt(x, y);
      if (idx === null) {
        setSelectedNode(null);
      } else {
        const node = nodesRef.current[idx];
        dragRef.current = {
          nodeIdx: idx,
          offsetX: x - node.x,
          offsetY: y - node.y,
        };
        setSelectedNode(idx);
        // Pause simulation during drag
        simulationRunning.current = false;
      }
    },
    [findNodeAt, getCanvasCoords]
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      // Resume simulation briefly to let graph settle
      iterationRef.current = Math.max(iterationRef.current, 280);
      simulationRunning.current = true;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    if (dragRef.current) {
      dragRef.current = null;
      iterationRef.current = Math.max(iterationRef.current, 280);
      simulationRunning.current = true;
    }
  }, []);

  const nodeCount = nodesRef.current.length || pages.length;
  const edgeCount = edgesRef.current.length;

  return (
    <div className="bg-white/2 border border-white/6 backdrop-blur-md rounded-3xl p-8 mb-8">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
        Site Crawl Map
      </h2>
      <p className="text-xs text-slate-500 mb-6">
        {nodeCount} pages · {edgeCount} internal links
      </p>
      <div ref={containerRef} className="relative w-full rounded-2xl overflow-hidden border border-white/6">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height: 500 }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none px-3 py-2 rounded-xl bg-slate-900/95 border border-white/10 shadow-xl backdrop-blur-sm"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
            }}
          >
            <div className="text-xs font-medium text-slate-200 max-w-65 truncate">
              {shortenUrl(tooltip.url, 50)}
            </div>
            {tooltip.title && (
              <div className="text-[10px] text-slate-400 mt-0.5 max-w-65 truncate">
                {tooltip.title}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4">
        {[
          { color: '#34d399', label: '200 OK' },
          { color: '#fbbf24', label: '3xx Redirect' },
          { color: '#ef4444', label: '4xx/5xx Error' },
          { color: '#64748b', label: 'Unknown' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
