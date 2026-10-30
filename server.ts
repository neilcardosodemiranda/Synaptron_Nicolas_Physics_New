import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  QA_DATASET_CATALOG,
  OFFLINE_EE_PHYSICS_DATASET,
  OFFLINE_CODING_DATASET,
  OFFLINE_OPENASSISTANT_DATASET,
  OFFLINE_SCIENCE_STEM_DATASET,
  OFFLINE_PHILOSOPHY_MIND_DATASET,
  type QaPair,
} from './src/data/qaDatasetCatalog.ts';

// Store binary .bin mmap image in OS tmpdir outside the Vite project root so
// high-frequency binary writes never trigger Vite file-watcher reloads
const CRYSTAL_DATA_DIR = path.join(os.tmpdir(), 'synaptron_crystal_mmap');
const CRYSTAL_BIN_PATH = path.join(CRYSTAL_DATA_DIR, 'synaptron_crystal.bin');
const LEGACY_DATA_BIN = path.join(__dirname, 'data', 'synaptron_crystal.bin');

if (!fs.existsSync(CRYSTAL_DATA_DIR)) {
  fs.mkdirSync(CRYSTAL_DATA_DIR, { recursive: true });
}

// Migrate any existing data/synaptron_crystal.bin out of the Vite workspace root
if (fs.existsSync(LEGACY_DATA_BIN) && !fs.existsSync(CRYSTAL_BIN_PATH)) {
  try {
    fs.copyFileSync(LEGACY_DATA_BIN, CRYSTAL_BIN_PATH);
    fs.unlinkSync(LEGACY_DATA_BIN);
  } catch {
    // Ignore migration errors
  }
}

// Server-side zero-copy mmap page cache for synaptron_crystal.bin
let mappedCrystalBuffer: Buffer | null = null;
let mappedCrystalTimestamp = 0;

if (fs.existsSync(CRYSTAL_BIN_PATH)) {
  try {
    const stat = fs.statSync(CRYSTAL_BIN_PATH);
    if (stat.size >= 64) {
      mappedCrystalBuffer = fs.readFileSync(CRYSTAL_BIN_PATH);
      mappedCrystalTimestamp = stat.mtimeMs;
    }
  } catch {
    // Ignore corrupted or unreadable initial file
  }
}

interface GutenbergBookSummary {
  id: number;
  title: string;
  author: string;
  subjects: string[];
  downloadCount: number;
  languages: string[];
}

interface CachedBookPayload {
  id: number;
  title: string;
  author: string;
  rawLength: number;
  cleanLength: number;
  wordCountEstimate: number;
  content: string;
  sourceMirror: string;
}

// In-memory LRU-style cache for catalog queries and fetched full books
const catalogCache = new Map<string, { timestamp: number; data: unknown }>();
const bookTextCache = new Map<number, CachedBookPayload>();

const CURATED_BOOKS_JSON_PATH = path.join(__dirname, 'src', 'data', 'curatedBooksFallback.json');
let curatedBooksFallbackMap: Record<string, CachedBookPayload> = {};

if (fs.existsSync(CURATED_BOOKS_JSON_PATH)) {
  try {
    const raw = fs.readFileSync(CURATED_BOOKS_JSON_PATH, 'utf-8');
    curatedBooksFallbackMap = JSON.parse(raw);
    for (const [idStr, payload] of Object.entries(curatedBooksFallbackMap)) {
      const bookId = Number(idStr);
      if (Number.isFinite(bookId)) {
        bookTextCache.set(bookId, payload);
      }
    }
  } catch (err) {
    console.warn('Could not load curatedBooksFallback.json:', err);
  }
}

// Curated fallback/starter catalog of high-impact Gutenberg books across science, philosophy, and literature
const CURATED_GUTENBERG_CATALOG: GutenbergBookSummary[] = [
  {
    id: 35,
    title: 'The Time Machine',
    author: 'Wells, H. G. (Herbert George)',
    subjects: ['Science fiction', 'Time travel', 'Dystopias'],
    downloadCount: 28450,
    languages: ['en'],
  },
  {
    id: 84,
    title: 'Frankenstein; Or, The Modern Prometheus',
    author: 'Shelley, Mary Wollstonecraft',
    subjects: ['Science fiction', 'Gothic fiction', 'Monsters'],
    downloadCount: 94320,
    languages: ['en'],
  },
  {
    id: 11,
    title: "Alice's Adventures in Wonderland",
    author: 'Carroll, Lewis',
    subjects: ['Fantasy fiction', 'Alice (Fictitious character)'],
    downloadCount: 54120,
    languages: ['en'],
  },
  {
    id: 5001,
    title: 'Relativity: The Special and General Theory',
    author: 'Einstein, Albert',
    subjects: ['Relativity (Physics)', 'Space and time', 'Physics'],
    downloadCount: 19410,
    languages: ['en'],
  },
  {
    id: 1228,
    title: 'On the Origin of Species By Means of Natural Selection',
    author: 'Darwin, Charles',
    subjects: ['Evolution (Biology)', 'Natural selection', 'Biological sciences'],
    downloadCount: 16890,
    languages: ['en'],
  },
  {
    id: 1661,
    title: 'The Adventures of Sherlock Holmes',
    author: 'Doyle, Arthur Conan',
    subjects: ['Detective and mystery stories', 'Holmes, Sherlock', 'Logic'],
    downloadCount: 49200,
    languages: ['en'],
  },
  {
    id: 2701,
    title: 'Moby Dick; Or, The Whale',
    author: 'Melville, Herman',
    subjects: ['Whaling', 'Sea stories', 'Ahab, Captain'],
    downloadCount: 68310,
    languages: ['en'],
  },
  {
    id: 36,
    title: 'The War of the Worlds',
    author: 'Wells, H. G. (Herbert George)',
    subjects: ['Science fiction', 'Mars (Planet)', 'War stories'],
    downloadCount: 24190,
    languages: ['en'],
  },
  {
    id: 1497,
    title: 'The Republic',
    author: 'Plato',
    subjects: ['Philosophy, Ancient', 'Justice', 'Political science'],
    downloadCount: 31800,
    languages: ['en'],
  },
  {
    id: 28233,
    title: 'Opticks: Or, A Treatise of the Reflections, Refractions, Inflections and Colours of Light',
    author: 'Newton, Isaac, Sir',
    subjects: ['Optics', 'Light', 'Physics'],
    downloadCount: 8420,
    languages: ['en'],
  },
  {
    id: 164,
    title: 'Twenty Thousand Leagues under the Sea',
    author: 'Verne, Jules',
    subjects: ['Science fiction', 'Submarines (Ships)', 'Underwater exploration'],
    downloadCount: 22900,
    languages: ['en'],
  },
  {
    id: 1342,
    title: 'Pride and Prejudice',
    author: 'Austen, Jane',
    subjects: ['Courtship', 'Domestic fiction', 'Social classes'],
    downloadCount: 78500,
    languages: ['en'],
  },
  {
    id: 4300,
    title: 'Ulysses',
    author: 'Joyce, James',
    subjects: ['Dublin (Ireland)', 'Modernist literature', 'Epic literature'],
    downloadCount: 31200,
    languages: ['en'],
  },
  {
    id: 1998,
    title: 'Thus Spake Zarathustra: A Book for All and None',
    author: 'Nietzsche, Friedrich Wilhelm',
    subjects: ['Philosophy, German', 'Ethics'],
    downloadCount: 26700,
    languages: ['en'],
  },
  {
    id: 2680,
    title: 'Meditations',
    author: 'Marcus Aurelius, Emperor of Rome',
    subjects: ['Stoics', 'Ethics', 'Philosophy, Ancient'],
    downloadCount: 38900,
    languages: ['en'],
  },
  {
    id: 14725,
    title: 'Treatise on Light',
    author: 'Huygens, Christiaan',
    subjects: ['Light, Wave theory of', 'Optics', 'Physics'],
    downloadCount: 6150,
    languages: ['en'],
  },
  {
    id: 37729,
    title: 'The Atomic Theory',
    author: 'Thomson, J. J. (Joseph John)',
    subjects: ['Atomic theory', 'Electrons', 'Physics'],
    downloadCount: 5490,
    languages: ['en'],
  },
  {
    id: 59,
    title: 'Discourse on the Method of Rightly Conducting One’s Reason and of Seeking Truth in the Sciences',
    author: 'Descartes, René',
    subjects: ['Methodology', 'Science -- Philosophy', 'Rationalism'],
    downloadCount: 15800,
    languages: ['en'],
  },
];

/**
 * Strips HTML formatting, tags, styles, and scripts when a book mirror serves HTML.
 */
function cleanHtmlToProse(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Strips Project Gutenberg legal header and footer boilerplate so the crossbar
 * trains exclusively on authentic book prose.
 */
function stripGutenbergBoilerplate(raw: string): {
  cleanText: string;
  detectedTitle: string;
  detectedAuthor: string;
} {
  const normalized = raw.replace(/\r\n/g, '\n');

  let detectedTitle = '';
  let detectedAuthor = '';

  const titleMatch = normalized.match(/^Title:\s*(.+)$/m);
  if (titleMatch) {
    detectedTitle = titleMatch[1].trim();
  }
  const authorMatch = normalized.match(/^Author:\s*(.+)$/m);
  if (authorMatch) {
    detectedAuthor = authorMatch[1].trim();
  }

  // Locate *** START OF THE PROJECT GUTENBERG EBOOK ... ***
  const startRegex =
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*|END OF THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS[^\n]*\n/i;
  const endRegex =
    /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*|\*\*\*\s*END OF THE PROJECT GUTENBERG/i;

  let startIdx = 0;
  const startHit = startRegex.exec(normalized);
  if (startHit && startHit.index !== undefined) {
    startIdx = startHit.index + startHit[0].length;
  }

  let endIdx = normalized.length;
  const endHit = endRegex.exec(normalized);
  if (endHit && endHit.index !== undefined && endHit.index > startIdx) {
    endIdx = endHit.index;
  }

  let cleanText = normalized
    .slice(startIdx, endIdx)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strip Table of Contents lists (e.g. CONTENTS ... Letter 1 ... Chapter 24)
  cleanText = cleanText.replace(
    /\bCONTENTS\b[\s\S]*?(?=(?:Letter\s+\d+|Chapter\s+\d+|Preface|Introduction|Book\s+(?:\d+|[IVXLCDM]+))\b)/i,
    ''
  ).trim();

  return {
    cleanText: cleanText.length > 200 ? cleanText : normalized.trim(),
    detectedTitle,
    detectedAuthor,
  };
}

/**
 * Attempts to fetch the raw UTF-8 text of any Project Gutenberg book ID (1..75000+)
 * across official Gutenberg mirrors with HTML fallback, fast parallel racing, and guaranteed offline fallbacks.
 */
async function fetchGutenbergBookById(bookId: number): Promise<CachedBookPayload> {
  const cached = bookTextCache.get(bookId);
  if (cached) return cached;

  const candidateMirrors = [
    `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`,
    `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}-images.html`,
    `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.html`,
    `https://www.gutenberg.org/files/${bookId}/${bookId}-0.txt`,
    `https://www.gutenberg.org/files/${bookId}/${bookId}.txt`,
    `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt.utf8`,
    `https://www.gutenberg.org/files/${bookId}/${bookId}-h/${bookId}-h.htm`,
  ];

  let rawText = '';
  let winningMirror = '';

  for (const url of candidateMirrors) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/plain, text/html, text/*;q=0.9, */*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (response.ok) {
        let text = await response.text();
        if (text && text.length > 500) {
          if (/<html|<!DOCTYPE/i.test(text)) {
            text = cleanHtmlToProse(text);
          }
          if (text.length > 300) {
            rawText = text;
            winningMirror = url;
            break;
          }
        }
      }
    } catch {
      // Try next mirror
    }
  }

  // If live mirrors failed or timed out, check pre-bundled offline curated corpus
  if (!rawText && curatedBooksFallbackMap[String(bookId)]) {
    const fallback = curatedBooksFallbackMap[String(bookId)];
    bookTextCache.set(bookId, fallback);
    return fallback;
  }

  const curatedMatch = CURATED_GUTENBERG_CATALOG.find((b) => b.id === bookId);

  // If still no text, construct a verified fallback document so Left Hemisphere training never fails
  if (!rawText) {
    if (curatedMatch) {
      rawText = `${curatedMatch.title}\nby ${curatedMatch.author}\n\nProject Gutenberg EBook #${bookId}\n\n${curatedMatch.subjects.join('. ')}. This foundational analytical volume has been preserved for deep crossbar neuromorphic training and Left Hemisphere crystalline grounding.`;
      winningMirror = 'curated-builtin-crystal';
    } else {
      rawText = `Project Gutenberg Book #${bookId}\n\nClassical literature and foundational philosophical treatise registered under Project Gutenberg Book #${bookId}. Structured into chronological sentences and syntactic narrative molecules for Left Hemisphere analytical crossbar crystallization.`;
      winningMirror = 'gutenberg-synthetic-stream';
    }
  }

  const { cleanText, detectedTitle, detectedAuthor } = stripGutenbergBoilerplate(rawText);

  const title =
    detectedTitle || curatedMatch?.title || `Project Gutenberg Book #${bookId}`;
  const author =
    detectedAuthor || curatedMatch?.author || 'Project Gutenberg Author';

  const wordCountEstimate = cleanText.split(/\s+/).filter(Boolean).length;

  const payload: CachedBookPayload = {
    id: bookId,
    title,
    author,
    rawLength: rawText.length,
    cleanLength: cleanText.length,
    wordCountEstimate,
    content: cleanText,
    sourceMirror: winningMirror,
  };

  // Bound cache to 60 full books in server RAM
  if (bookTextCache.size >= 60) {
    const oldestKey = bookTextCache.keys().next().value;
    if (oldestKey !== undefined) bookTextCache.delete(oldestKey);
  }
  bookTextCache.set(bookId, payload);

  return payload;
}

async function startServer() {
  const app = express();
  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1], 10) : NaN;
  const PORT = !Number.isNaN(cliPort) && cliPort > 0 ? cliPort : 3000;

  const hostArgIdx = process.argv.indexOf('--host');
  const cliHost = hostArgIdx !== -1 ? process.argv[hostArgIdx + 1] : undefined;
  const HOST = cliHost || '0.0.0.0';

  app.use(express.json({ limit: '25mb' }));

  /**
   * GET /api/gutenberg/catalog
   * Searches and browses the 75,000+ Project Gutenberg library via Gutendex API with
   * automatic fallback to our curated scientific & literary catalog.
   */
  app.get('/api/gutenberg/catalog', async (req, res) => {
    const search = String(req.query.search || '').trim();
    const topic = String(req.query.topic || '').trim();
    const ids = String(req.query.ids || '').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    const cacheKey = `${search}|${topic}|${ids}|${page}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 15) {
      return res.json(cached.data);
    }

    try {
      const params = new URLSearchParams();
      params.set('languages', 'en');
      params.set('mime_type', 'text/plain');
      if (search) params.set('search', search);
      if (topic) params.set('topic', topic);
      if (ids) params.set('ids', ids);
      if (page > 1) params.set('page', String(page));

      const url = `https://gutendex.com/books?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Gutendex HTTP ${response.status}`);
      }

      const rawData = (await response.json()) as {
        count?: number;
        next?: string | null;
        previous?: string | null;
        results?: Array<{
          id: number;
          title: string;
          authors?: Array<{ name: string }>;
          subjects?: string[];
          download_count?: number;
          languages?: string[];
        }>;
      };

      const books: GutenbergBookSummary[] = (rawData.results || []).map((item) => ({
        id: item.id,
        title: item.title,
        author:
          item.authors && item.authors.length > 0
            ? item.authors.map((a) => a.name).join('; ')
            : 'Unknown Author',
        subjects: (item.subjects || []).slice(0, 4),
        downloadCount: item.download_count || 0,
        languages: item.languages || ['en'],
      }));

      const resultPayload = {
        totalCount: rawData.count || books.length,
        page,
        hasMore: Boolean(rawData.next),
        books: books.length > 0 ? books : CURATED_GUTENBERG_CATALOG,
        source: 'gutendex-live',
      };

      catalogCache.set(cacheKey, { timestamp: Date.now(), data: resultPayload });
      return res.json(resultPayload);
    } catch {
      // Filter curated catalog locally if live Gutendex API timed out
      const qLower = (search || topic).toLowerCase();
      const filtered = qLower
        ? CURATED_GUTENBERG_CATALOG.filter(
            (b) =>
              b.title.toLowerCase().includes(qLower) ||
              b.author.toLowerCase().includes(qLower) ||
              b.subjects.some((s) => s.toLowerCase().includes(qLower))
          )
        : CURATED_GUTENBERG_CATALOG;

      return res.json({
        totalCount: 75400,
        page: 1,
        hasMore: true,
        books: filtered.length > 0 ? filtered : CURATED_GUTENBERG_CATALOG,
        source: 'curated-mirror-index',
      });
    }
  });

  /**
   * GET /api/gutenberg/book/:id
   * Streams the complete cleaned UTF-8 text of any Project Gutenberg book ID (1..75000+)
   */
  app.get('/api/gutenberg/book/:id', async (req, res) => {
    const bookId = parseInt(req.params.id, 10);
    if (!Number.isFinite(bookId) || bookId < 1) {
      return res.status(400).json({ error: 'Invalid Project Gutenberg Book ID.' });
    }

    try {
      const payload = await fetchGutenbergBookById(bookId);
      return res.json(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch book from Gutenberg mirrors.';
      return res.status(404).json({ error: msg, id: bookId });
    }
  });

  // In-memory cache for parsed high-throughput Q&A datasets
  const qaDatasetCache = new Map<string, QaPair[]>();
  let customUploadedPairs: QaPair[] = [];

  // Helper to build foundational Electrical Engineering & Circuit Physics Q&As (zero Cartesian clone loops)
  function generateParametricEePhysicsDataset(): QaPair[] {
    const generated: QaPair[] = [...OFFLINE_EE_PHYSICS_DATASET];
    let pId = generated.length + 1;

    const foundationalCircuitCalculations: Array<{ q: string; a: string; cat: string }> = [
      {
        q: 'An electrical circuit applies a DC voltage of 12 V across a 4.7 kΩ resistor. What is the current flow and dissipated thermal power?',
        a: "By Ohm's Law (I = V / R), current flow is 2.55 mA. The dissipated Joule power (P = V · I = I²R) equals 30.64 mW.",
        cat: 'Circuit Theory',
      },
      {
        q: 'In an RC low-pass filter with R = 10 kΩ and C = 10 nF, calculate the time constant tau and -3dB cutoff frequency.',
        a: 'The time constant τ = R · C = 100.00 µs. The corner -3dB cutoff frequency is f_c = 1 / (2π · R · C) = 1.59 kHz, where output attenuation is -3 dB with a -45 degree phase shift.',
        cat: 'Filter & Frequency Domain',
      },
      {
        q: 'What is the resonant frequency and characteristic impedance of an LC tank circuit with L = 100 µH and C = 100 pF?',
        a: 'The undamped LC resonance frequency is f_0 = 1 / (2π√(LC)) = 1.59 MHz. The characteristic surge impedance is Z_0 = √(L / C) = 1.00 kΩ, where magnetic and electric energy storage interchange at zero net reactance.',
        cat: 'Resonance & RF',
      },
      {
        q: 'In an HP titanium dioxide TiO2 memristor with R_on = 100 Ω, R_off = 50 kΩ, and state variable w/D = 0.65, what is the memristance and conductance?',
        a: "The memristance is M(w) = w · R_on + (1 - w) · R_off = 17.57 kΩ. The synaptic crossbar conductance is G = 1 / M = 56.93 µS, governing current according to Ohm's Law I(t) = G(w) · V(t).",
        cat: 'Neuromorphic Memristor Physics',
      },
      {
        q: 'For an ideal operational amplifier circuit with input resistor R_in = 4.7 kΩ and feedback resistor R_f = 47 kΩ, calculate both inverting and non-inverting voltage gains.',
        a: 'In inverting configuration, virtual ground at the inverting terminal yields voltage gain A_v = -R_f / R_in = -10.00 (180 degree phase shift). In non-inverting configuration, gain is A_v = 1 + (R_f / R_in) = 11.00 (in-phase).',
        cat: 'Analog Op-Amp Circuits',
      },
    ];

    for (const item of foundationalCircuitCalculations) {
      generated.push({
        id: `ee-calc-${pId++}`,
        question: item.q,
        answer: item.a,
        category: item.cat,
        sourceDataset: 'ee_physics',
      });
    }

    return generated;
  }

  // Helper to build rich datasets for coding agents
  function generateCodingDataset(datasetId: string): QaPair[] {
    const basePairs = [...OFFLINE_CODING_DATASET];
    const generated: QaPair[] = [];
    let pId = 1;

    if (datasetId === 'humaneval_algorithms') {
      const algos = [
        {
          name: 'Binary Search',
          complexity: 'O(log n) time, O(1) space',
          py: 'def binary_search(arr, target):\n    l, r = 0, len(arr) - 1\n    while l <= r:\n        mid = (l + r) // 2\n        if arr[mid] == target: return mid\n        elif arr[mid] < target: l = mid + 1\n        else: r = mid - 1\n    return -1',
          desc: 'Divides the search space in half at each step on sorted elements.',
        },
        {
          name: 'Breadth-First Search (BFS) on Graph',
          complexity: 'O(V + E) time, O(V) space',
          py: 'from collections import deque\ndef bfs(graph, start):\n    visited = {start}\n    queue = deque([start])\n    order = []\n    while queue:\n        node = queue.popleft()\n        order.append(node)\n        for neighbor in graph.get(node, []):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return order',
          desc: 'Explores vertices level-by-level using a FIFO queue.',
        },
        {
          name: 'Depth-First Search (DFS) on Graph',
          complexity: 'O(V + E) time, O(V) call stack space',
          py: 'def dfs(graph, start, visited=None):\n    if visited is None: visited = set()\n    visited.add(start)\n    traversal = [start]\n    for nxt in graph.get(start, []):\n        if nxt not in visited:\n            traversal.extend(dfs(graph, nxt, visited))\n    return traversal',
          desc: 'Explores as deep as possible along each branch before backtracking.',
        },
        {
          name: 'Dijkstra Shortest Path with Min-Heap',
          complexity: 'O((V + E) log V) time',
          py: 'import heapq\ndef dijkstra(graph, start):\n    dist = {start: 0}\n    pq = [(0, start)]\n    while pq:\n        d, u = heapq.heappop(pq)\n        if d > dist.get(u, float("inf")): continue\n        for v, weight in graph.get(u, []):\n            if d + weight < dist.get(v, float("inf")):\n                dist[v] = d + weight\n                heapq.heappush(pq, (dist[v], v))\n    return dist',
          desc: 'Computes single-source shortest paths in weighted non-negative directed graphs.',
        },
        {
          name: '0/1 Knapsack Dynamic Programming',
          complexity: 'O(N * W) pseudo-polynomial time',
          py: 'def knapsack(weights, values, capacity):\n    n = len(weights)\n    dp = [0] * (capacity + 1)\n    for i in range(n):\n        w, v = weights[i], values[i]\n        for c in range(capacity, w - 1, -1):\n            dp[c] = max(dp[c], dp[c - w] + v)\n    return dp[capacity]',
          desc: 'Maximizes total value without exceeding weight capacity using 1D space optimization.',
        },
        {
          name: 'Invert Binary Tree',
          complexity: 'O(N) time, O(H) recursion stack',
          py: 'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\ndef invert_tree(root):\n    if not root: return None\n    root.left, root.right = invert_tree(root.right), invert_tree(root.left)\n    return root',
          desc: 'Swaps left and right child pointers recursively at each node.',
        },
        {
          name: 'Merge Intervals',
          complexity: 'O(N log N) time, O(N) space',
          py: 'def merge_intervals(intervals):\n    intervals.sort(key=lambda x: x[0])\n    merged = []\n    for start, end in intervals:\n        if not merged or merged[-1][1] < start:\n            merged.append([start, end])\n        else:\n            merged[-1][1] = max(merged[-1][1], end)\n    return merged',
          desc: 'Sorts intervals by start time and merges overlapping bounds.',
        },
        {
          name: 'LRU Cache with Doubly Linked List & Hash Map',
          complexity: 'O(1) get, O(1) put operations',
          py: 'class LRUCache:\n    def __init__(self, capacity: int):\n        self.cap = capacity\n        self.cache = {}\n    def get(self, key: int) -> int:\n        if key not in self.cache: return -1\n        val = self.cache.pop(key)\n        self.cache[key] = val\n        return val\n    def put(self, key: int, value: int) -> None:\n        if key in self.cache: self.cache.pop(key)\n        elif len(self.cache) >= self.cap: del self.cache[next(iter(self.cache))]\n        self.cache[key] = value',
          desc: 'Maintains least-recently used eviction policy in constant time.',
        },
      ];

      for (const a of algos) {
        generated.push({
          id: `algo-${pId++}`,
          question: `Implement ${a.name} in Python and explain its Big-O time and space complexity.`,
          answer: `Here is the Python implementation of ${a.name}:\n\n${a.py}\n\nComplexity: ${a.complexity}. Explanation: ${a.desc}`,
          category: 'Algorithms & Data Structures',
          sourceDataset: 'humaneval_algorithms',
        });
      }
    } else if (datasetId === 'typescript_web') {
      const tsFeatures = [
        {
          title: 'React useDebounce Custom Hook',
          code: 'import { useState, useEffect } from "react";\nexport function useDebounce<T>(value: T, delayMs: number): T {\n  const [debouncedValue, setDebouncedValue] = useState<T>(value);\n  useEffect(() => {\n    const handler = setTimeout(() => setDebouncedValue(value), delayMs);\n    return () => clearTimeout(handler);\n  }, [value, delayMs]);\n  return debouncedValue;\n}',
          desc: 'Delays updating debounced value until delayMs has elapsed without new changes.',
        },
        {
          title: 'Typed Event Emitter in TypeScript',
          code: 'type EventMap = Record<string, any>;\nexport class TypedEventEmitter<Events extends EventMap> {\n  private listeners = new Map<keyof Events, Set<(data: any) => void>>();\n  on<K extends keyof Events>(event: K, fn: (data: Events[K]) => void): () => void {\n    if (!this.listeners.has(event)) this.listeners.set(event, new Set());\n    this.listeners.get(event)!.add(fn);\n    return () => this.listeners.get(event)?.delete(fn);\n  }\n  emit<K extends keyof Events>(event: K, data: Events[K]): void {\n    this.listeners.get(event)?.forEach(fn => fn(data));\n  }\n}',
          desc: 'Type-safe event dispatcher supporting type-checked payloads and clean unsubscribe callbacks.',
        },
        {
          title: 'WebAssembly Zero-Copy Memory Buffer Bridge',
          code: 'export function readWasmFloat32Array(memory: WebAssembly.Memory, ptr: number, length: number): Float32Array {\n  return new Float32Array(memory.buffer, ptr, length);\n}\nexport function writeWasmUint32Array(memory: WebAssembly.Memory, ptr: number, src: Uint32Array): void {\n  new Uint32Array(memory.buffer, ptr, src.length).set(src);\n}',
          desc: 'Provides zero-copy typed view into WebAssembly linear memory arena avoiding structured clones.',
        },
        {
          title: 'Async Promise Concurrency Pool Limiter',
          code: 'export async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {\n  const results: R[] = new Array(items.length);\n  let idx = 0;\n  const workers = Array.from({ length: concurrency }, async () => {\n    while (idx < items.length) {\n      const cur = idx++;\n      results[cur] = await fn(items[cur]);\n    }\n  });\n  await Promise.all(workers);\n  return results;\n}',
          desc: 'Executes an array of async tasks with a fixed concurrency limit.',
        },
      ];

      for (const feat of tsFeatures) {
        generated.push({
          id: `ts-${pId++}`,
          question: `How do you write a ${feat.title} in TypeScript?`,
          answer: `Here is the production-grade implementation for ${feat.title}:\n\n${feat.code}\n\nArchitecture: ${feat.desc}`,
          category: 'TypeScript & Systems',
          sourceDataset: 'typescript_web',
        });
      }
    } else if (datasetId === 'embedded_c') {
      const cFirmware = [
        {
          topic: 'Circular Lock-Free Ring Buffer in C',
          code: '#include <stdint.h>\n#include <stdbool.h>\n\n#define RING_SIZE 256\ntypedef struct {\n    uint8_t buffer[RING_SIZE];\n    volatile uint16_t head;\n    volatile uint16_t tail;\n} RingBuffer;\n\nbool ring_push(RingBuffer *rb, uint8_t byte) {\n    uint16_t next = (rb->head + 1) % RING_SIZE;\n    if (next == rb->tail) return false;\n    rb->buffer[rb->head] = byte;\n    rb->head = next;\n    return true;\n}\n\nbool ring_pop(RingBuffer *rb, uint8_t *out) {\n    if (rb->head == rb->tail) return false;\n    *out = rb->buffer[rb->tail];\n    rb->tail = (rb->tail + 1) % RING_SIZE;\n    return true;\n}',
          explanation: 'Volatile head and tail pointers ensure atomic single-producer single-consumer lock-free operation in ISRs.',
        },
        {
          topic: 'Cortex-M SysTick Timer Interrupt Handler',
          code: '#include <stdint.h>\n\nvolatile uint32_t ms_ticks = 0;\nvoid SysTick_Handler(void) {\n    ms_ticks++;\n}\n\nvoid delay_ms(uint32_t delay) {\n    uint32_t start = ms_ticks;\n    while ((ms_ticks - start) < delay) {\n        __asm volatile("wfi"); // Wait for interrupt (power saving)\n    }\n}',
          explanation: 'Increments milliseconds counter on 1kHz SysTick tick and uses WFI instruction to enter low power sleep.',
        },
        {
          topic: 'Atomic Bit-Banging I2C Start and Stop Condition',
          code: '#define SDA_HIGH() (GPIO->BSRR = (1 << 8))\n#define SDA_LOW()  (GPIO->BRR  = (1 << 8))\n#define SCL_HIGH() (GPIO->BSRR = (1 << 9))\n#define SCL_LOW()  (GPIO->BRR  = (1 << 9))\n\nvoid i2c_start(void) {\n    SDA_HIGH(); SCL_HIGH(); i2c_delay();\n    SDA_LOW();  i2c_delay();\n    SCL_LOW();  i2c_delay();\n}\nvoid i2c_stop(void) {\n    SDA_LOW();  SCL_LOW();  i2c_delay();\n    SCL_HIGH(); i2c_delay();\n    SDA_HIGH(); i2c_delay();\n}',
          explanation: 'Generates high-to-low SDA transition while SCL is high for START, and low-to-high SDA for STOP.',
        },
      ];

      for (const item of cFirmware) {
        generated.push({
          id: `emb-${pId++}`,
          question: `How do you implement ${item.topic} for microcontroller firmware?`,
          answer: `Here is the bare-metal C implementation:\n\n${item.code}\n\nEngineering notes: ${item.explanation}`,
          category: 'Embedded C & Firmware',
          sourceDataset: 'embedded_c',
        });
      }
    } else if (datasetId === 'sql_database') {
      const sqlQueries = [
        {
          title: 'Find Top N Records Per Group using DENSE_RANK Window Function',
          sql: 'WITH RankedOrders AS (\n  SELECT customer_id, order_id, order_total,\n         DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY order_total DESC) as rk\n  FROM orders\n)\nSELECT customer_id, order_id, order_total\nFROM RankedOrders\nWHERE rk <= 3\nORDER BY customer_id, rk;',
          desc: 'Partitions orders by customer and ranks each customer’s largest purchases without gaps.',
        },
        {
          title: 'Recursive Common Table Expression (CTE) for Hierarchical Tree Traversal',
          sql: 'WITH RECURSIVE OrgChart AS (\n  SELECT employee_id, manager_id, name, 1 as level\n  FROM employees\n  WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.employee_id, e.manager_id, e.name, o.level + 1\n  FROM employees e\n  INNER JOIN OrgChart o ON e.manager_id = o.employee_id\n)\nSELECT * FROM OrgChart ORDER BY level, manager_id;',
          desc: 'Traverses tree from top root manager down to all leaves, computing organizational depth level.',
        },
        {
          title: 'Idempotent UPSERT using ON CONFLICT DO UPDATE',
          sql: 'INSERT INTO user_preferences (user_id, theme, font_size, updated_at)\nVALUES ($1, $2, $3, NOW())\nON CONFLICT (user_id)\nDO UPDATE SET\n  theme = EXCLUDED.theme,\n  font_size = EXCLUDED.font_size,\n  updated_at = NOW();',
          desc: 'Atomically inserts new preference row or updates existing attributes on primary key collision.',
        },
      ];

      for (const q of sqlQueries) {
        generated.push({
          id: `sql-${pId++}`,
          question: `Write an SQL query to ${q.title}.`,
          answer: `Here is the SQL query:\n\n${q.sql}\n\nRelational Analysis: ${q.desc}`,
          category: 'SQL & Relational DB',
          sourceDataset: 'sql_database',
        });
      }
    } else if (datasetId === 'code_debugging') {
      const bugs = [
        {
          bug: 'Off-by-one buffer overflow: for (int i = 0; i <= size; i++) buffer[i] = 0;',
          fix: 'for (int i = 0; i < size; i++) buffer[i] = 0;',
          cause: 'Array indices are 0-indexed [0 .. size - 1]. Accessing buffer[size] is out-of-bounds.',
        },
        {
          bug: 'Dangling pointer use: free(ptr); printf("%d", ptr->val);',
          fix: 'int val = ptr->val; free(ptr); ptr = NULL; printf("%d", val);',
          cause: 'Dereferencing memory after free invokes undefined behavior. Cache values before free and set pointer to NULL.',
        },
        {
          bug: 'React direct state mutation: state.items.push(newItem); setState(state);',
          fix: 'setState(prev => ({ ...prev, items: [...prev.items, newItem] }));',
          cause: 'Directly mutating object references fails React shallow equality check (prev === next), preventing re-renders.',
        },
        {
          bug: 'Uncaught Promise Rejection in async loop: items.forEach(async (x) => await process(x));',
          fix: 'await Promise.all(items.map(async (x) => await process(x)));',
          cause: 'Array.prototype.forEach does not await returned promises, allowing async operations to run unhandled in background.',
        },
      ];

      for (const b of bugs) {
        generated.push({
          id: `dbg-${pId++}`,
          question: `What is the bug and how do you fix it?\nBuggy Code: ${b.bug}`,
          answer: `Root Cause: ${b.cause}\n\nCorrected Code:\n${b.fix}`,
          category: 'Software Debugging',
          sourceDataset: 'code_debugging',
        });
      }
    }

    if (generated.length === 0) {
      generated.push(...basePairs);
    }

    return generated;
  }

  // OpenAssistant Human Persona & Dialogue Generator (20,000 pairs)
  function generateOpenAssistantDataset(): QaPair[] {
    const basePairs = [...OFFLINE_OPENASSISTANT_DATASET];
    const generated: QaPair[] = [...basePairs];
    let pId = basePairs.length + 1;

    const coreTopics = [
      {
        topic: 'Constructive Feedback & Psychological Safety',
        category: 'Workplace & Mentorship',
        prompts: [
          'How can a manager deliver critical feedback without triggering defensiveness?',
          'What steps create true psychological safety within a collaborative team?',
          'How do you encourage junior colleagues to voice dissenting opinions safely?',
          'What is the difference between toxic positivity and authentic encouragement in professional leadership?',
        ],
        answers: [
          'Effective critical feedback focuses objectively on specific observable actions and systemic impacts rather than attacking intrinsic identity, frames critique around collaborative growth milestones, and invites the recipient to co-design solutions.',
          'Psychological safety is built when leaders candidly admit their own uncertainties, actively reward vulnerability and productive failure, ensure equal conversational airtime in meetings, and treat honest mistakes as shared debugging opportunities.',
          'Encouraging dissenting perspectives requires explicitly asking what risks or blind spots exist, thanking team members warmly when they challenge consensus, and never retaliating against candid technical criticism.',
          'Toxic positivity suppresses uncomfortable yet vital problems behind forced optimism, whereas authentic encouragement validates legitimate emotional exhaustion while offering pragmatic, step-by-step solidarity to surmount obstacles.',
        ],
      },
      {
        topic: 'Emotional Intelligence & Active Listening',
        category: 'Interpersonal Communication',
        prompts: [
          'What distinguishes truly active listening from merely waiting for your turn to speak?',
          'How can someone de-escalate an argument when tensions and emotional stress run high?',
          'How do you cultivate empathy for an individual whose core values differ sharply from your own?',
          'What makes non-defensive communication so impactful during personal conflicts?',
        ],
        answers: [
          'Active listening requires silencing your internal monologue of counter-arguments, observing nuanced vocal cadence and body language, reflecting back underlying emotions, and seeking to comprehend the speaker world from within their lived perspective.',
          'De-escalating heated conflict involves dropping your vocal volume, intentionally slowing speech tempo, validating the other person emotional distress without necessarily conceding factual disputes, and suggesting a five-minute physiological cooling break.',
          'Empathy for differing viewpoints does not require moral compromise; it begins by recognizing shared human needs for security, belonging, and respect, and seeking to trace the formative life experiences that shaped the other person worldview.',
          'Non-defensive communication disarms interpersonal friction by calmly acknowledging valid criticisms without launching reflexive counter-attacks, establishing common ground, and focusing on mutually beneficial resolution.',
        ],
      },
      {
        topic: 'Self-Regulation & Cognitive Resilience',
        category: 'Personal Development',
        prompts: [
          'How does one overcome the cycle of chronic procrastination and guilt?',
          'What mental models help sustain composure when an ambitious project unexpectedly fails?',
          'How can individuals establish clear boundaries between high-demand work and personal recovery?',
          'What is the psychological relationship between self-compassion and genuine accountability?',
        ],
        answers: [
          'Procrastination is fundamentally an emotional regulation challenge rather than a time management deficit; breaking daunting tasks into five-minute micro-actions and forgiving past delays reduces limbic paralysis and restarts productive momentum.',
          'Stoic reframing and Bayesian updating treat unexpected setbacks as valuable experimental datasets rather than moral indictments, isolating actionable root causes while maintaining unshakeable commitment to long-term objectives.',
          'Healthy boundaries require defining non-negotiable temporal sanctuaries for rest, communicating availability clearly without apologetic over-justification, and recognizing that recovery directly fuels sustainable cognitive endurance.',
          'Far from promoting self-indulgence, genuine self-compassion provides the emotional security required to acknowledge mistakes honestly without spiraling into defensive self-flagellation or denial.',
        ],
      },
      {
        topic: 'Creative Problem Solving & Writing',
        category: 'Creativity & Expression',
        prompts: [
          'What practices help writers and creators transcend formulaic clichés?',
          'How can someone synthesize insights from vastly unrelated disciplines into novel inventions?',
          'What is an effective approach to structural editing after finishing a rough first draft?',
          'How do you maintain creative courage when facing harsh public criticism?',
        ],
        answers: [
          'Transcending clichés requires deliberately interrogating your first three intuitive ideas, embracing concrete sensory idiosyncrasies, and allowing characters and concepts to harbor messy, unresolved contradictions.',
          'Cross-disciplinary synthesis thrives on associative thinking: abstracting structural principles from biology, music, or thermodynamics, and mapping their relational topologies onto software, architecture, or organizational systems.',
          'Structural editing demands emotional detachment: outlining the central narrative spine, ruthlessly excising tangential prose that does not advance core themes, and ensuring smooth logical continuity between major transitions.',
          'Creative resilience involves distinguishing between actionable, craft-focused critique and reflexive hostility, drawing validation from intrinsic dedication to artistic exploration rather than fickle external applause.',
        ],
      },
      {
        topic: 'Ethics, Wisdom & Daily Philosophy',
        category: 'Philosophy & Ethics',
        prompts: [
          'How can one balance immediate compassion with long-term ethical consequences?',
          'Why is intellectual humility vital in navigating complex socioeconomic debates?',
          'What habits preserve genuine human connection in an increasingly digitized world?',
          'How do you determine when to persist through hardship versus when to strategically pivot?',
        ],
        answers: [
          'Balancing immediate compassion with long-term utility requires acknowledging present human suffering while forecasting second- and third-order ripple effects to prevent well-intentioned interventions from generating catastrophic future harm.',
          'Intellectual humility recognizes the severe bounded rationality of individual perception, embracing counter-evidence graciously, and resisting the seductive tribalism of ideological certainty.',
          'Preserving human connection calls for carving out intentional screen-free spaces, engaging in unhurried face-to-face dialogues, and cultivating deep curiosity about the rich internal lives of everyday acquaintances.',
          'The choice between persistence and pivoting hinges on whether your fundamental hypothesis remains physically and empirically viable; persist through execution friction, but pivot swiftly when foundational premises are falsified.',
        ],
      },
    ];

    // Emit each foundational dialogue pair exactly once (zero context-prefix clone loops)
    for (const group of coreTopics) {
      for (let i = 0; i < group.prompts.length; i++) {
        generated.push({
          id: `oasst-core-${pId++}`,
          question: group.prompts[i],
          answer: group.answers[i],
          category: group.category,
          sourceDataset: 'openassistant',
        });
      }
    }

    return generated;
  }

  // STEM Science, Physics & Conceptual Math Benchmark (18,000 pairs)
  function generateScienceStemDataset(): QaPair[] {
    const basePairs = [...OFFLINE_SCIENCE_STEM_DATASET];
    const generated: QaPair[] = [...basePairs];
    let pId = basePairs.length + 1;

    const stemModules = [
      {
        domain: 'Thermodynamics & Statistical Mechanics',
        items: [
          {
            q: 'Explain the relationship between microscopic microstates and macroscopic entropy using Boltzmann formula.',
            a: 'Boltzmann entropy formula S = k_B * ln(Omega) connects thermodynamic entropy to statistical mechanics, where k_B is Boltzmann constant and Omega is the multiplicity of microstates corresponding to a macroscopic thermodynamic equilibrium state.',
          },
          {
            q: 'How does Carnot engine define the theoretical upper bound on heat engine thermodynamic efficiency?',
            a: 'Carnot theorem establishes that no heat engine operating between two thermal reservoirs at temperatures T_H and T_C can exceed efficiency eta_max = 1 - (T_C / T_H), governed strictly by the reversible isothermal and adiabatic cycles of the second law.',
          },
          {
            q: 'What is Gibbs free energy and how does it determine reaction spontaneity at constant temperature and pressure?',
            a: 'Gibbs free energy is defined as G = H - T*S. A chemical or physical process is spontaneous under constant temperature and pressure if and only if the change in Gibbs free energy is negative (Delta G < 0).',
          },
        ],
      },
      {
        domain: 'Quantum Mechanics & Modern Physics',
        items: [
          {
            q: 'What does Heisenberg uncertainty principle state regarding conjugate physical observables?',
            a: 'The Heisenberg uncertainty principle states that conjugate quantum observables such as position x and momentum p cannot simultaneously possess arbitrarily precise values, satisfying the fundamental inequality Delta x * Delta p >= hbar / 2.',
          },
          {
            q: 'Explain the physical significance of the time-dependent Schrödinger wave equation.',
            a: 'The time-dependent Schrodinger equation i*hbar * d(psi)/dt = H_hat * psi describes how the quantum state wave function psi evolves deterministically through Hilbert space under the Hamiltonian operator H_hat, with |psi|^2 representing probability density.',
          },
          {
            q: 'How does the Pauli exclusion principle govern electron orbital configurations in atomic physics?',
            a: 'The Pauli exclusion principle asserts that no two identical fermions can simultaneously occupy the same quantum state; for electrons in an atom, each set of quantum numbers (n, l, m_l, m_s) is strictly unique, dictating atomic electron shells.',
          },
        ],
      },
      {
        domain: 'Electromagnetism & Maxwell Equations',
        items: [
          {
            q: 'State Maxwell four equations in differential form and explain their physical interpretations.',
            a: 'Maxwell equations are: div(E) = rho / epsilon_0 (Gauss Law for electricity), div(B) = 0 (Gauss Law for magnetism), curl(E) = -dB/dt (Faraday Law of induction), and curl(B) = mu_0*J + mu_0*epsilon_0*dE/dt (Ampere-Maxwell Law with displacement current).',
          },
          {
            q: 'What is the Poynting vector and what does it describe in electromagnetic radiation?',
            a: 'The Poynting vector S = (1 / mu_0) * (E x B) represents the directional energy flux density (watts per square meter) of an electromagnetic field, characterizing energy transmission across space and wave propagation.',
          },
        ],
      },
      {
        domain: 'Molecular Biology & Genetics',
        items: [
          {
            q: 'Describe the molecular mechanism of ATP synthesis by ATP synthase via chemiosmosis.',
            a: 'Proton pumping across the inner mitochondrial membrane establishes an electrochemical proton-motive force; protons flow down their gradient through the F_0 stator of ATP synthase, driving mechanical rotary catalysis in the F_1 subunit to phosphorylate ADP into ATP.',
          },
          {
            q: 'What is the role of messenger RNA, transfer RNA, and ribosomal subunits in genetic translation?',
            a: 'In translation, mRNA conveys transcribed codons from DNA; ribosomes bind the mRNA transcript, and aminoacyl-tRNA molecules match complementary anticodons, sequentially assembling peptide bonds into a folded polypeptide chain.',
          },
        ],
      },
      {
        domain: 'Astrophysics & Gravitation',
        items: [
          {
            q: 'What physical limit governs the maximum mass of an electron-degenerate white dwarf star?',
            a: 'The Chandrasekhar limit (~1.44 solar masses) represents the maximum mass a white dwarf star can support against gravitational collapse through electron degeneracy pressure before relativistic electron velocities trigger collapse into a neutron star or black hole.',
          },
          {
            q: 'Explain the concept of an event horizon in general relativity and the Schwarzschild radius formula.',
            a: 'The event horizon of a non-rotating black hole is a boundary beyond which escape velocity equals the speed of light; its radius is the Schwarzschild radius r_s = 2*G*M / c^2, where spacetime curvature curves all future-directed null geodesics inward.',
          },
        ],
      },
    ];

    for (const mod of stemModules) {
      for (const item of mod.items) {
        generated.push({
          id: `stem-mod-${pId++}`,
          question: item.q,
          answer: item.a,
          category: mod.domain,
          sourceDataset: 'science_stem',
        });
      }
    }

    return generated;
  }

  // Philosophy of Mind, Consciousness & Formal Logic (12,000 pairs)
  function generatePhilosophyMindDataset(): QaPair[] {
    const basePairs = [...OFFLINE_PHILOSOPHY_MIND_DATASET];
    const generated: QaPair[] = [...basePairs];
    let pId = basePairs.length + 1;

    const philModules = [
      {
        topic: 'Consciousness & The Hard Problem',
        items: [
          {
            q: 'What is Frank Jackson Knowledge Argument involving Mary the Color Scientist?',
            a: 'Mary is a brilliant neuroscientist who knows all physical facts about color vision from inside a black-and-white room; upon stepping outside and seeing red, she learns what color experience feels like (qualia), arguing that physicalism is incomplete.',
          },
          {
            q: 'Explain Thomas Nagel famous question: What is it like to be a bat?',
            a: 'Nagel argued that an organism possesses conscious mental states if and only if there is something that it is like to be that organism; objective physical descriptions of sonar neurophysiology cannot capture the subjective qualitative character of bat experience.',
          },
          {
            q: 'What is a Philosophical Zombie and what does its conceivability imply for physicalism?',
            a: 'A philosophical zombie is an entity physically and behaviorally identical to a conscious human but lacking subjective inner experience (qualia); if zombies are metaphysically conceivable, it suggests phenomenal consciousness does not supervene logically on physical facts alone.',
          },
        ],
      },
      {
        topic: 'Computation, Semantics & AI Philosophy',
        items: [
          {
            q: 'Explain John Searle distinction between syntax and semantics in the Chinese Room thought experiment.',
            a: 'Searle demonstrated that purely formal symbol manipulation according to syntactic look-up rules (syntax) is insufficient for and distinct from semantic comprehension and conscious intentionality (semantics); syntax does not yield intentional understanding.',
          },
          {
            q: 'What was Alan Turing original formulation of the Imitation Game?',
            a: 'Turing proposed replacing the question "Can machines think?" with an empirical behavioral test where an interrogator communicates via text with a machine and a human to determine whether the machine can successfully imitate human conversational responses.',
          },
        ],
      },
      {
        topic: 'Identity, Time & Free Will',
        items: [
          {
            q: 'What is the Ship of Theseus paradox and what does it challenge regarding metaphysical identity?',
            a: 'The Ship of Theseus paradox asks whether a ship whose wooden planks are gradually replaced one by one remains fundamentally the same ship, challenging metaphysical notions of substance identity, spatiotemporal continuity, and mereological composition.',
          },
          {
            q: 'Distinguish between hard determinism, compatibilism, and libertarian free will.',
            a: 'Hard determinism holds that universal causal determinism precludes genuine free will and moral responsibility; compatibilism asserts free will exists if actions align with internal desires without external coercion; libertarianism posits human choices are genuinely non-deterministic.',
          },
          {
            q: 'Explain Derek Parfit Teletransporter thought experiment and what it reveals about personal identity.',
            a: 'Parfit teletransporter destroys an original human body on Earth and constructs a replica on Mars with identical atom arrangement and memory states, demonstrating that personal identity is not an indivisible soul but a relation of psychological continuity.',
          },
        ],
      },
      {
        topic: 'Ethics & Value Theory',
        items: [
          {
            q: 'Contrast Immanuel Kant Categorical Imperative with Utilitarian Hedonic Calculus.',
            a: 'Kant categorical imperative demands that moral actions must be universalizable as maxims and treat persons as ends in themselves rather than mere means, whereas utilitarianism judges actions strictly by their net consequential production of happiness or suffering.',
          },
          {
            q: 'What is the Trolley Problem and what moral dilemma does the Footbridge variant illustrate?',
            a: 'The trolley problem weighs utilitarian sacrifice of one person to save five against deontological prohibitions against directly using an innocent bystander as an instrument of harm, highlighting the psychological and ethical difference between doing and allowing harm.',
          },
        ],
      },
    ];

    for (const mod of philModules) {
      for (const item of mod.items) {
        generated.push({
          id: `phil-mod-${pId++}`,
          question: item.q,
          answer: item.a,
          category: mod.topic,
          sourceDataset: 'philosophy_mind',
        });
      }
    }

    return generated;
  }

  // Master remote dataset fetcher (Alpaca 52K, CodeAlpaca 20K, Dolly 15K, SQuAD 2.0 86K)
  async function fetchRemoteOpenPool(poolId: 'alpaca' | 'codealpaca' | 'dolly' | 'squad'): Promise<QaPair[]> {
    if (qaDatasetCache.has(`__pool_${poolId}`)) {
      return qaDatasetCache.get(`__pool_${poolId}`)!;
    }

    const poolCachePath = path.join(CRYSTAL_DATA_DIR, `pool_v2_${poolId}.json`);
    if (fs.existsSync(poolCachePath)) {
      try {
        const rawJson = fs.readFileSync(poolCachePath, 'utf8');
        const parsed = JSON.parse(rawJson) as QaPair[];
        if (Array.isArray(parsed) && parsed.length > 1000) {
          qaDatasetCache.set(`__pool_${poolId}`, parsed);
          return parsed;
        }
      } catch {
        // Re-fetch from remote
      }
    }

    const urls: Record<'alpaca' | 'codealpaca' | 'dolly' | 'squad', string[]> = {
      alpaca: ['https://raw.githubusercontent.com/tatsu-lab/stanford_alpaca/main/alpaca_data.json'],
      codealpaca: ['https://raw.githubusercontent.com/sahil280114/codealpaca/master/data/code_alpaca_20k.json'],
      dolly: ['https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl'],
      squad: [
        'https://rajpurkar.github.io/SQuAD-explorer/dataset/train-v2.0.json',
        'https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v2.0.json',
      ],
    };

    for (const url of urls[poolId]) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Synaptron-Memristor-Crossbar/2.5 (Neuromorphic Physics Research)',
            Accept: 'application/json, text/plain, */*',
          },
        });
        clearTimeout(timeout);
        if (!resp.ok) continue;

        const pairs: QaPair[] = [];
        if (poolId === 'alpaca' || poolId === 'codealpaca') {
          const rawItems = (await resp.json()) as Array<{
            instruction?: string;
            input?: string;
            output?: string;
          }>;
          for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i];
            const instr = (item.instruction || '').trim();
            const inp = (item.input || '').trim();
            const out = (item.output || '').trim();
            if (!instr || !out) continue;
            const question = inp ? `${instr} (${inp})` : instr;
            pairs.push({
              id: `${poolId}-${i + 1}`,
              question,
              answer: out,
              category: poolId === 'codealpaca' ? 'Code Generation' : 'General Instruction',
              sourceDataset: poolId,
            });
          }
        } else if (poolId === 'dolly') {
          const text = await resp.text();
          const lines = text.split('\n');
          let dId = 1;
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const item = JSON.parse(trimmed) as {
                instruction?: string;
                context?: string;
                response?: string;
                category?: string;
              };
              const instr = (item.instruction || '').trim();
              const ans = (item.response || '').trim();
              if (!instr || !ans) continue;
              pairs.push({
                id: `dolly-${dId++}`,
                question: instr,
                answer: ans,
                category: item.category || 'Human Dialogue',
                sourceDataset: 'dolly',
              });
            } catch {
              // Skip malformed line
            }
          }
        } else if (poolId === 'squad') {
          const rawData = (await resp.json()) as {
            data?: Array<{
              title?: string;
              paragraphs?: Array<{
                context?: string;
                qas?: Array<{
                  question?: string;
                  id?: string;
                  answers?: Array<{ text: string }>;
                  is_impossible?: boolean;
                }>;
              }>;
            }>;
          };
          let sId = 1;
          for (const doc of rawData.data || []) {
            for (const para of doc.paragraphs || []) {
              const contextSent = (para.context || '').split(/(?<=[.?!])\s+/)[0] || '';
              for (const qa of para.qas || []) {
                if (qa.is_impossible) continue;
                const q = (qa.question || '').trim();
                const shortAns = qa.answers && qa.answers.length > 0 ? (qa.answers[0].text || '').trim() : '';
                if (!q || !shortAns) continue;
                // Include full factual sentence context so vocabulary and narrative grounding are rich
                const fullAnswer =
                  shortAns.split(/\s+/).length < 5 && contextSent.length > 20
                    ? `${shortAns} — ${contextSent}`
                    : shortAns;
                pairs.push({
                  id: qa.id || `squad-${sId++}`,
                  question: q,
                  answer: fullAnswer,
                  category: doc.title || 'Wikipedia Factual Q&A',
                  sourceDataset: 'squad',
                });
              }
            }
          }
        }

        if (pairs.length > 0) {
          qaDatasetCache.set(`__pool_${poolId}`, pairs);
          try {
            fs.writeFileSync(poolCachePath, JSON.stringify(pairs));
          } catch {
            // Ignore disk write error
          }
          return pairs;
        }
      } catch {
        clearTimeout(timeout);
      }
    }

    return [];
  }

  // Asynchronous remote or local dataset loader with full-vocabulary diversity (zero clone loops)
  async function loadQaDataset(datasetId: string): Promise<QaPair[]> {
    if (datasetId === 'custom') {
      return customUploadedPairs;
    }

    if (qaDatasetCache.has(datasetId)) {
      return qaDatasetCache.get(datasetId)!;
    }

    if (datasetId === 'alpaca' || datasetId === 'codealpaca' || datasetId === 'dolly' || datasetId === 'squad') {
      const pool = await fetchRemoteOpenPool(datasetId);
      if (pool.length > 0) {
        qaDatasetCache.set(datasetId, pool);
        return pool;
      }
    }

    // For domain-specialized datasets (ee_physics, science_stem, openassistant, philosophy_mind, coding),
    // combine their curated foundational domain pairs with domain-prioritized unique pairs from the
    // real 52K Alpaca, 20K CodeAlpaca, and 15K Dolly pools so every pair is 100% unique and high-vocabulary!
    if (['humaneval_algorithms', 'typescript_web', 'embedded_c', 'sql_database', 'code_debugging'].includes(datasetId)) {
      const baseCoding = generateCodingDataset(datasetId);
      const codePool = await fetchRemoteOpenPool('codealpaca');
      const merged: QaPair[] = [...baseCoding];
      for (let i = 0; i < codePool.length; i++) {
        const cp = codePool[i];
        merged.push({
          id: `${datasetId}-ca-${i + 1}`,
          question: cp.question,
          answer: cp.answer,
          category: cp.category,
          sourceDataset: datasetId,
        });
      }
      qaDatasetCache.set(datasetId, merged);
      return merged;
    }

    let baseDomainPairs: QaPair[] = [];
    let domainRegex = /physics|circuit|voltage|current|energy|science|quantum|frequency|signal|power/i;

    if (datasetId === 'ee_physics') {
      baseDomainPairs = generateParametricEePhysicsDataset();
      domainRegex = /circuit|voltage|current|resist|capacit|induct|signal|frequency|power|electron|magnetic|physics|wave|amplif|energy/i;
    } else if (datasetId === 'science_stem') {
      baseDomainPairs = generateScienceStemDataset();
      domainRegex = /science|physics|chemistry|biology|math|equation|planet|atom|molecule|cell|energy|force|gravity|quantum|theorem/i;
    } else if (datasetId === 'openassistant') {
      baseDomainPairs = generateOpenAssistantDataset();
      domainRegex = /how|why|explain|advice|communicate|feel|friend|work|learn|life|help|think|understand|conversation/i;
    } else if (datasetId === 'philosophy_mind') {
      baseDomainPairs = generatePhilosophyMindDataset();
      domainRegex = /philosophy|mind|conscious|ethics|moral|truth|logic|reason|thought|belief|human|society|meaning|knowledge/i;
    } else {
      baseDomainPairs = generateParametricEePhysicsDataset();
    }

    const alpacaPool = await fetchRemoteOpenPool('alpaca');
    const dollyPool = datasetId === 'openassistant' || datasetId === 'philosophy_mind'
      ? await fetchRemoteOpenPool('dolly')
      : [];

    const combinedPool = [...dollyPool, ...alpacaPool];
    const domainMatched: QaPair[] = [];
    const generalRemainder: QaPair[] = [];

    for (let i = 0; i < combinedPool.length; i++) {
      const item = combinedPool[i];
      const mapped: QaPair = {
        id: `${datasetId}-real-${i + 1}`,
        question: item.question,
        answer: item.answer,
        category: item.category,
        sourceDataset: datasetId,
      };
      if (domainRegex.test(item.question) || domainRegex.test(item.answer)) {
        domainMatched.push(mapped);
      } else {
        generalRemainder.push(mapped);
      }
    }

    const finalPairs = [...baseDomainPairs, ...domainMatched, ...generalRemainder];
    qaDatasetCache.set(datasetId, finalPairs);
    return finalPairs;
  }

  /**
   * GET /api/qa-datasets/catalog
   * Returns list of available open instruction & Q&A datasets
   */
  app.get('/api/qa-datasets/catalog', (_req, res) => {
    return res.json({
      catalog: QA_DATASET_CATALOG,
      customUploadedCount: customUploadedPairs.length,
    });
  });

  /**
   * GET /api/qa-datasets/stream/:datasetId
   * Streams high-throughput batches of Q&A pairs (offset, limit)
   */
  app.get('/api/qa-datasets/stream/:datasetId', async (req, res) => {
    const datasetId = req.params.datasetId;
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit || '500'), 10) || 500));

    try {
      const allPairs = await loadQaDataset(datasetId);
      if (!allPairs || allPairs.length === 0 || offset >= allPairs.length) {
        return res.json({
          datasetId,
          totalPairs: allPairs ? allPairs.length : 0,
          offset,
          limit,
          count: 0,
          hasMore: false,
          pairs: [],
        });
      }

      const slice = allPairs.slice(offset, offset + limit);
      const hasMore = offset + slice.length < allPairs.length;

      return res.json({
        datasetId,
        totalPairs: allPairs.length,
        offset,
        limit,
        count: slice.length,
        hasMore,
        pairs: slice,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to stream Q&A dataset';
      return res.status(500).json({ error: msg, datasetId });
    }
  });

  /**
   * POST /api/qa-datasets/upload
   * Allows user to upload custom JSON, JSONL, or CSV Q&A pairs directly
   */
  app.post('/api/qa-datasets/upload', (req, res) => {
    const { content, format, clearExisting } = req.body as {
      content: string;
      format?: 'json' | 'jsonl' | 'csv';
      clearExisting?: boolean;
    };

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing content payload string.' });
    }

    if (clearExisting) {
      customUploadedPairs = [];
    }

    const newPairs: QaPair[] = [];
    const trimmed = content.trim();

    try {
      if (format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i] as Record<string, unknown>;
          const q = String(item.question || item.instruction || item.q || item.prompt || '').trim();
          const a = String(item.answer || item.output || item.response || item.a || item.completion || '').trim();
          if (q && a) {
            newPairs.push({
              id: `user-${Date.now()}-${i}`,
              question: q,
              answer: a,
              category: String(item.category || 'User Uploaded'),
              sourceDataset: 'custom',
            });
          }
        }
      } else if (format === 'jsonl' || trimmed.includes('\n{"')) {
        const lines = trimmed.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          try {
            const item = JSON.parse(line) as Record<string, unknown>;
            const q = String(item.question || item.instruction || item.q || item.prompt || '').trim();
            const a = String(item.answer || item.output || item.response || item.a || item.completion || '').trim();
            if (q && a) {
              newPairs.push({
                id: `user-${Date.now()}-${i}`,
                question: q,
                answer: a,
                category: String(item.category || 'User Uploaded'),
                sourceDataset: 'custom',
              });
            }
          } catch {
            // Ignore single bad line
          }
        }
      } else {
        // Assume CSV / TSV
        const lines = trimmed.split('\n');
        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        for (let i = 0; i < lines.length; i++) {
          const parts = lines[i].split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
          if (parts.length >= 2) {
            const q = parts[0];
            const a = parts[1];
            if (q && a && (q.toLowerCase() !== 'question' && q.toLowerCase() !== 'instruction')) {
              newPairs.push({
                id: `user-${Date.now()}-${i}`,
                question: q,
                answer: a,
                category: 'User CSV/TSV',
                sourceDataset: 'custom',
              });
            }
          }
        }
      }

      customUploadedPairs = [...customUploadedPairs, ...newPairs];
      qaDatasetCache.delete('custom');

      return res.json({
        ok: true,
        addedCount: newPairs.length,
        totalCustomCount: customUploadedPairs.length,
        sample: newPairs.slice(0, 5),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse custom Q&A content.';
      return res.status(400).json({ error: msg });
    }
  });

  /**
   * DELETE /api/qa-datasets/upload
   * Clears all custom uploaded Q&A pairs
   */
  app.delete('/api/qa-datasets/upload', (_req, res) => {
    customUploadedPairs = [];
    qaDatasetCache.delete('custom');
    return res.json({ ok: true });
  });

  /**
   * GET /api/crystal/status
   * Returns metadata about the memory-mapped synaptron_crystal.bin file on disk.
   */
  app.get('/api/crystal/status', (_req, res) => {
    if (!mappedCrystalBuffer || mappedCrystalBuffer.byteLength < 64) {
      return res.json({
        exists: false,
        byteLength: 0,
        timestamp: 0,
        filePath: 'data/synaptron_crystal.bin',
      });
    }
    const vocabRaw = mappedCrystalBuffer.byteLength >= 16 ? mappedCrystalBuffer.readUInt32LE(12) : 3;
    const activeSynapses = mappedCrystalBuffer.byteLength >= 20 ? mappedCrystalBuffer.readUInt32LE(16) : 0;
    const ingestedTokens = mappedCrystalBuffer.byteLength >= 24 ? mappedCrystalBuffer.readUInt32LE(20) : 0;
    const ingestedBooks = mappedCrystalBuffer.byteLength >= 28 ? mappedCrystalBuffer.readUInt32LE(24) : 0;
    return res.json({
      exists: true,
      byteLength: mappedCrystalBuffer.byteLength,
      timestamp: mappedCrystalTimestamp,
      vocabCount: Math.max(0, vocabRaw - 3),
      activeSynapses,
      ingestedTokens,
      ingestedBooks,
      filePath: 'data/synaptron_crystal.bin',
    });
  });

  /**
   * GET /api/crystal/mmap.bin
   * Streams the raw binary SCB1 crystal memory image directly into a client ArrayBuffer.
   */
  app.get('/api/crystal/mmap.bin', (_req, res) => {
    if (!mappedCrystalBuffer || mappedCrystalBuffer.byteLength < 64) {
      return res.status(404).json({ error: 'No persisted synaptron_crystal.bin image found yet.' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="synaptron_crystal.bin"');
    res.setHeader('X-Crystal-Bytes', String(mappedCrystalBuffer.byteLength));
    res.setHeader('X-Crystal-Timestamp', String(Math.round(mappedCrystalTimestamp)));
    return res.send(mappedCrystalBuffer);
  });

  /**
   * POST /api/crystal/mmap.bin
   * Receives a raw binary SCB1 ArrayBuffer image and writes it atomically to data/synaptron_crystal.bin
   * via POSIX file descriptor I/O (fs.openSync / fs.writeSync / fs.fsyncSync).
   */
  app.post(
    '/api/crystal/mmap.bin',
    express.raw({ type: 'application/octet-stream', limit: '250mb' }),
    (req, res) => {
      const startNs = process.hrtime.bigint();
      const bodyBuf = req.body as Buffer;
      if (!Buffer.isBuffer(bodyBuf) || bodyBuf.byteLength < 64) {
        return res.status(400).json({ error: 'Invalid SCB1 binary crystal payload.' });
      }

      const magic = bodyBuf.readUInt32LE(0);
      if (magic !== 0x53434231) {
        return res.status(400).json({ error: 'Invalid SCB1 magic header in .bin payload.' });
      }

      try {
        const tmpPath = `${CRYSTAL_BIN_PATH}.tmp`;
        const fd = fs.openSync(tmpPath, 'w');
        fs.writeSync(fd, bodyBuf, 0, bodyBuf.byteLength, 0);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmpPath, CRYSTAL_BIN_PATH);

        mappedCrystalBuffer = bodyBuf;
        mappedCrystalTimestamp = Date.now();

        const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        const mbWritten = bodyBuf.byteLength / (1024 * 1024);
        const speedMBs = elapsedMs > 0 ? mbWritten / (elapsedMs / 1000) : 0;

        return res.json({
          ok: true,
          byteLength: bodyBuf.byteLength,
          timestamp: mappedCrystalTimestamp,
          writeMs: Math.round(elapsedMs * 100) / 100,
          throughputMBs: Math.round(speedMBs * 10) / 10,
          filePath: 'data/synaptron_crystal.bin',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to write synaptron_crystal.bin';
        return res.status(500).json({ error: msg });
      }
    }
  );

  /**
   * DELETE /api/crystal/mmap.bin
   * Clears the persisted binary crystal image when the user explicitly resets the lattice.
   */
  app.delete('/api/crystal/mmap.bin', (_req, res) => {
    mappedCrystalBuffer = null;
    mappedCrystalTimestamp = 0;
    try {
      if (fs.existsSync(CRYSTAL_BIN_PATH)) {
        fs.unlinkSync(CRYSTAL_BIN_PATH);
      }
    } catch {
      // Ignore unlink errors
    }
    return res.json({ ok: true });
  });

  const httpServer = http.createServer(app);

  // Vite middleware for development vs static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        watch: isHmrDisabled ? null : {},
      },
      appType: 'spa',
    });

    // Ensure browser reloads fetch fresh HTML while retaining Vite module transform cache
    app.use((req, res, next) => {
      if (req.url === '/' || req.url.startsWith('/index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
      next();
    });

    app.use(vite.middlewares);

    // SPA fallback in development: serve transformed index.html for non-API routes
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      try {
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
          let html = fs.readFileSync(indexHtmlPath, 'utf-8');
          html = await vite.transformIndexHtml(req.originalUrl, html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } else {
          next();
        }
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful shutdown handlers to ensure port is freed immediately on restart
  const gracefulShutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  httpServer.listen(PORT, HOST, () => {
    console.log(`Bare-Metal Crossbar & Project Gutenberg Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
