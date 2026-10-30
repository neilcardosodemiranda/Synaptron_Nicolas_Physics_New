/**
 * Algorithmic & Combinatorial Wave Intelligence Module (M87R Open-Gate Architecture)
 *
 * Implements deterministic mathematical, combinatorial, and wave-symmetry operations:
 * 1. Anagram State-Vector Permutation & Parity Verification: C(w) = {(c, n_c)}
 * 2. Discrete Time-Reversal Operator: T(s) = s[|s|-1 ... 0]
 * 3. Palindrome Phase-Symmetry Verification: ||s - T(s)|| = 0
 * 4. Fermionic Particle & Character Mass Counting
 * 5. Symbolic Arithmetic & Operator Evaluation (Shunting-Yard / Recursive Descent, Zero eval)
 */

import { AlgorithmicComputationReport } from '../types/physics';
import { STABLE_LEXICON, getLetterParticleProperties } from '../utils/dictionary';
import { CORPORE_DOCUMENTS } from '../data/dialogueCorpus';

// Canonical English lexicon supplement for permutation & anagram parity buckets
// Combined dynamically at runtime with all active CSR crystal somas and Gutenberg vocabularies
const BASE_COMBINATORIAL_LEXICON: string[] = [
  'enlist', 'listen', 'silent', 'tinsel', 'inlets',
  'earth', 'heart', 'hater', 'rathe',
  'cinema', 'iceman', 'anemic',
  'racecar', 'level', 'radar', 'rotor', 'civic', 'kayak', 'madam', 'refer', 'tenet', 'solos',
  'stressed', 'desserts',
  'triangle', 'integral', 'altering', 'relating', 'alerting',
  'angel', 'angle', 'glean',
  'evil', 'live', 'veil', 'vile',
  'stop', 'spot', 'pots', 'tops', 'post', 'opts',
  'time', 'item', 'mite', 'emit',
  'star', 'rats', 'arts', 'tars',
  'stone', 'tones', 'notes', 'onset',
  'care', 'race', 'acre',
  'spare', 'pears', 'reaps', 'parse', 'spear',
  'least', 'slate', 'stale', 'steal', 'tales', 'tesla',
  'loop', 'polo', 'pool',
  'flow', 'wolf', 'fowl',
  'part', 'trap', 'rapt', 'tarp',
  'master', 'stream', 'tamers',
  'danger', 'garden', 'ranged', 'gander',
  'rescue', 'secure',
  'player', 'parley', 'replay', 'pearly',
  'teacher', 'cheater', 'hectare',
  'listen', 'nicolas', 'computer', 'frankenstein', 'quantum', 'neuron', 'synapse',
];

export class AlgorithmicIntelligenceModule {
  private anagramBuckets: Map<string, Set<string>> = new Map();
  private indexedWordCount = 0;

  constructor() {
    this.seedBaseLexicon();
  }

  private seedBaseLexicon(): void {
    for (const w of BASE_COMBINATORIAL_LEXICON) {
      this.indexWord(w);
    }
    STABLE_LEXICON.forEach((w) => this.indexWord(w));
    for (const doc of CORPORE_DOCUMENTS) {
      const words = doc.content
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && w.length <= 18);
      for (const w of words) {
        this.indexWord(w);
      }
    }
  }

  /**
   * Computes canonical sorted character distribution signature \sigma(w)
   */
  public computeSignature(word: string): string {
    return word
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .split('')
      .sort()
      .join('');
  }

  /**
   * Computes explicit letter distribution vector C(w) = {(c, n_c)}
   */
  public computeLetterDistribution(word: string): Record<string, number> {
    const dist: Record<string, number> = {};
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const ch of clean) {
      dist[ch] = (dist[ch] || 0) + 1;
    }
    return dist;
  }

  /**
   * Indexes a word into its canonical character-distribution bucket
   */
  public indexWord(rawWord: string): void {
    const w = rawWord.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length < 2 || w.length > 20) return;
    const sig = this.computeSignature(w);
    if (!sig) return;
    let bucket = this.anagramBuckets.get(sig);
    if (!bucket) {
      bucket = new Set<string>();
      this.anagramBuckets.set(sig, bucket);
    }
    if (!bucket.has(w)) {
      bucket.add(w);
      this.indexedWordCount++;
    }
  }

  /**
   * Synchronizes with active CSR crystal vocabulary so all ingested Gutenberg books
   * and Q&A tokens participate in anagram permutation solving.
   */
  public syncCrystalVocabulary(crystalWords: Iterable<string>): void {
    for (const w of crystalWords) {
      this.indexWord(w);
    }
  }

  /**
   * Evaluates whether an incoming query wave represents a deterministic algorithmic,
   * combinatorial, time-reversal, particle-counting, or mathematical task.
   * Returns null if the query should proceed through standard crystal resonance.
   */
  public evaluateQuery(
    rawQuery: string,
    crystalLexicon?: Iterable<string>
  ): AlgorithmicComputationReport | null {
    const startTime = performance.now();
    const trimmed = rawQuery.trim();
    if (!trimmed) return null;

    if (crystalLexicon) {
      this.syncCrystalVocabulary(crystalLexicon);
    }

    const cleanLower = trimmed.toLowerCase().replace(/[?.!]+$/, '').trim();

    // 1. ANAGRAM PARITY VERIFICATION (2-word comparison: e.g., "is cinema an anagram of iceman?")
    const anagramVerifyMatch = cleanLower.match(
      /(?:is|are)\s+['"“”]?([a-z]+)['"“”]?\s+(?:an\s+anagram\s+of|and\s+['"“”]?([a-z]+)['"“”]?\s+anagrams)(?:\s+['"“”]?([a-z]+)['"“”]?)?/i
    );
    if (anagramVerifyMatch) {
      const wordA = (anagramVerifyMatch[1] || '').toLowerCase();
      const wordB = (anagramVerifyMatch[2] || anagramVerifyMatch[3] || '').toLowerCase();
      if (wordA && wordB) {
        const sigA = this.computeSignature(wordA);
        const sigB = this.computeSignature(wordB);
        const isExactAnagram = sigA.length > 0 && sigA === sigB;
        const distA = this.computeLetterDistribution(wordA);
        const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));

        const computedOutput = isExactAnagram
          ? `[ALGORITHMIC] Yes! '${wordA}' is an exact anagram of '${wordB}' (both share identical letter distributions: {${Object.entries(distA)
              .map(([k, v]) => `${k}:${v}`)
              .join(', ')}}).`
          : `[ALGORITHMIC] No, '${wordA}' is not an anagram of '${wordB}' (character state vectors diverge: '${sigA}' ≠ '${sigB}').`;

        return {
          taskType: 'ANAGRAM_VERIFY',
          targetExpression: `${wordA} ⇄ ${wordB}`,
          computedOutput,
          letterDistributionVector: distA,
          executionLatencyUs: elapsedUs,
          verifiedParity: isExactAnagram,
        };
      }
    }

    // 2. ANAGRAM SOLVING & PERMUTATION SEARCH (e.g., "solve anagram of silent", "anagrams of listen", "what is an anagram of earth")
    const anagramSolveMatch = cleanLower.match(
      /(?:solve\s+anagrams?\s+(?:of|for)|anagrams?\s+(?:of|for)|what\s+(?:is|are)\s+(?:an\s+|the\s+)?anagrams?\s+(?:of|for)|find\s+anagrams?\s+(?:of|for)|permute)\s+['"“”]?([a-z]+)['"“”]?$/i
    );
    if (anagramSolveMatch) {
      const targetWord = anagramSolveMatch[1].toLowerCase();
      const sig = this.computeSignature(targetWord);
      const dist = this.computeLetterDistribution(targetWord);
      const bucket = this.anagramBuckets.get(sig);
      const matches = bucket
        ? Array.from(bucket)
            .filter((w) => w !== targetWord)
            .sort()
        : [];
      const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));

      const computedOutput =
        matches.length > 0
          ? `[ALGORITHMIC] The anagrams of '${targetWord}' are: ${matches.join(', ')}.`
          : `[ALGORITHMIC] No other single-word lexical anagrams found in the active crystal for '${targetWord}' (canonical state vector: '${sig}').`;

      return {
        taskType: 'ANAGRAM_SOLVE',
        targetExpression: targetWord,
        computedOutput,
        letterDistributionVector: dist,
        executionLatencyUs: elapsedUs,
        verifiedParity: matches.length > 0,
      };
    }

    // 3. BIDIRECTIONAL TIME-REVERSAL OPERATOR T: t -> -t (e.g., "reverse the word computer", "say nicolas backwards", "spell quantum backwards")
    const reverseMatch =
      cleanLower.match(
        /^(?:reverse\s+(?:the\s+(?:word|phrase|string)\s+)?|spell\s+|write\s+|read\s+|say\s+)['"“”]?([a-z0-9\s-]+?)['"“”]?(?:\s+(?:backwards?|in\s+reverse))?$/i
      ) &&
      (/\b(?:reverse|backwards?)\b/i.test(cleanLower));

    if (reverseMatch) {
      let target = cleanLower
        .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:reverse\s+(?:the\s+(?:word|phrase|string)\s+)?|spell\s+|write\s+|read\s+|say\s+)/i, '')
        .replace(/\s+(?:backwards?|in\s+reverse)$/i, '')
        .replace(/^['"“”]+|['"“”]+$/g, '')
        .trim();

      if (target.length >= 1) {
        const reversed = Array.from(target).reverse().join('');
        const dist = this.computeLetterDistribution(target);
        const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));
        return {
          taskType: 'TIME_REVERSAL',
          targetExpression: target,
          computedOutput: `[ALGORITHMIC] '${target}' backwards is: '${reversed}'.`,
          letterDistributionVector: dist,
          executionLatencyUs: elapsedUs,
          verifiedParity: true,
        };
      }
    }

    // 4. PALINDROME PHASE-SYMMETRY VERIFICATION (e.g., "is racecar a palindrome?")
    const palindromeMatch = cleanLower.match(
      /(?:is|check\s+if)\s+['"“”]?([a-z0-9\s]+?)['"“”]?\s+a\s+palindrome/i
    );
    if (palindromeMatch) {
      const rawTarget = palindromeMatch[1].trim();
      const norm = rawTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
      const rev = Array.from(norm).reverse().join('');
      const isPal = norm.length > 0 && norm === rev;
      const dist = this.computeLetterDistribution(rawTarget);
      const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));

      const computedOutput = isPal
        ? `[ALGORITHMIC] Yes, '${rawTarget}' is a palindrome! (Time-reversal symmetry T('${norm}') = '${rev}' holds with zero phase error).`
        : `[ALGORITHMIC] No, '${rawTarget}' is not a palindrome ('${norm}' backwards is '${rev}').`;

      return {
        taskType: 'PALINDROME_CHECK',
        targetExpression: rawTarget,
        computedOutput,
        letterDistributionVector: dist,
        executionLatencyUs: elapsedUs,
        verifiedParity: isPal,
      };
    }

    // 5. FERMIONIC PARTICLE / LETTER COUNTING (e.g., "count letters in frankenstein", "how many letters in frankenstein")
    const countMatch = cleanLower.match(
      /(?:how\s+many\s+(?:letters|characters)\s+(?:are\s+)?(?:in|does)\s+(?:the\s+word\s+)?|count\s+(?:the\s+)?(?:letters|characters)\s+in\s+(?:the\s+word\s+)?)['"“”]?([a-z0-9\s-]+?)['"“”]?(?:\s+have)?$/i
    );
    if (countMatch) {
      const target = countMatch[1].trim().replace(/^['"“”]+|['"“”]+$/g, '');
      const lettersOnly = target.replace(/[^a-zA-Z]/g, '');
      let vowels = 0;
      let consonants = 0;
      let totalMass = 0;
      for (const ch of lettersOnly) {
        if ('aeiouyAEIOUY'.includes(ch)) vowels++;
        else consonants++;
        totalMass += getLetterParticleProperties(ch, false).mass;
      }
      const dist = this.computeLetterDistribution(target);
      const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));

      return {
        taskType: 'PARTICLE_COUNT',
        targetExpression: target,
        computedOutput: `[ALGORITHMIC] There are exactly ${lettersOnly.length} letters in '${target}' (${vowels} vowel leptons, ${consonants} consonant quarks, rest mass Σm = ${totalMass.toFixed(1)}).`,
        letterDistributionVector: dist,
        executionLatencyUs: elapsedUs,
        verifiedParity: true,
      };
    }

    // 6. DETERMINISTIC ARITHMETIC & LOGIC EVALUATION (e.g., "calculate 12 * 12 + 6", "what is 12 * 12 + 6")
    const mathMatch = cleanLower.match(
      /^(?:calculate|compute|solve|evaluate|what\s+is)\s+([0-9\s+\-*/%^().]+)$/i
    ) || (/^[0-9\s+\-*/%^().]+$/.test(cleanLower) && /[+\-*/%^]/.test(cleanLower) && /\d/.test(cleanLower) ? [cleanLower, cleanLower] : null);

    if (mathMatch) {
      const expr = mathMatch[1].trim();
      const val = this.evaluateArithmeticExpression(expr);
      if (val !== null && Number.isFinite(val)) {
        const formatted = Number.isInteger(val) ? String(val) : String(Math.round(val * 1e6) / 1e6);
        const elapsedUs = Math.max(1, Math.round((performance.now() - startTime) * 1000));
        return {
          taskType: 'ARITHMETIC_EVAL',
          targetExpression: expr,
          computedOutput: `[ALGORITHMIC] ${expr} = ${formatted}.`,
          executionLatencyUs: elapsedUs,
          verifiedParity: true,
        };
      }
    }

    return null;
  }

  /**
   * Safe deterministic Shunting-Yard arithmetic expression evaluator (Zero eval)
   */
  public evaluateArithmeticExpression(expr: string): number | null {
    const clean = expr.replace(/\*\*/g, '^').replace(/\s+/g, '');
    if (!clean || /[^0-9+\-*/%^().]/.test(clean)) return null;

    const tokens: string[] = [];
    let i = 0;
    while (i < clean.length) {
      const ch = clean[i];
      if (
        (ch >= '0' && ch <= '9') ||
        ch === '.' ||
        (ch === '-' && (i === 0 || '(+-*/%^'.includes(clean[i - 1])))
      ) {
        let numStr = ch;
        i++;
        while (i < clean.length && ((clean[i] >= '0' && clean[i] <= '9') || clean[i] === '.')) {
          numStr += clean[i];
          i++;
        }
        if (numStr === '-' || numStr === '.') return null;
        tokens.push(numStr);
      } else if ('+-*/%^()'.includes(ch)) {
        tokens.push(ch);
        i++;
      } else {
        return null;
      }
    }

    const precedence: Record<string, number> = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
      '%': 2,
      '^': 3,
    };
    const rightAssociative = new Set(['^']);

    const outputQueue: Array<number | string> = [];
    const opStack: string[] = [];

    for (const tok of tokens) {
      if (!Number.isNaN(Number(tok))) {
        outputQueue.push(Number(tok));
      } else if (tok in precedence) {
        while (
          opStack.length > 0 &&
          opStack[opStack.length - 1] in precedence &&
          ((rightAssociative.has(tok) && precedence[tok] < precedence[opStack[opStack.length - 1]]) ||
            (!rightAssociative.has(tok) && precedence[tok] <= precedence[opStack[opStack.length - 1]]))
        ) {
          outputQueue.push(opStack.pop()!);
        }
        opStack.push(tok);
      } else if (tok === '(') {
        opStack.push(tok);
      } else if (tok === ')') {
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          outputQueue.push(opStack.pop()!);
        }
        if (opStack.length === 0) return null;
        opStack.pop();
      }
    }

    while (opStack.length > 0) {
      const op = opStack.pop()!;
      if (op === '(' || op === ')') return null;
      outputQueue.push(op);
    }

    const evalStack: number[] = [];
    for (const item of outputQueue) {
      if (typeof item === 'number') {
        evalStack.push(item);
      } else {
        if (evalStack.length < 2) return null;
        const b = evalStack.pop()!;
        const a = evalStack.pop()!;
        switch (item) {
          case '+':
            evalStack.push(a + b);
            break;
          case '-':
            evalStack.push(a - b);
            break;
          case '*':
            evalStack.push(a * b);
            break;
          case '/':
            if (b === 0) return null;
            evalStack.push(a / b);
            break;
          case '%':
            if (b === 0) return null;
            evalStack.push(a % b);
            break;
          case '^':
            evalStack.push(Math.pow(a, b));
            break;
          default:
            return null;
        }
      }
    }

    return evalStack.length === 1 ? evalStack[0] : null;
  }
}

export const algorithmicIntelligence = new AlgorithmicIntelligenceModule();
