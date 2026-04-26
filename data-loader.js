/**
 * JLPT SAMURAI — Data Loader
 * Fetches and parses all .txt files from /VOCAB/ and /Kanji/ folders
 * Exports: window.SAMURAI_DATA = { vocab: {1:[...], 2:[...]}, kanji: [...] }
 */

(function () {
  'use strict';

  /* ── File manifest ─────────────────────────────────────── */
  const VOCAB_FILES = [
    { path: 'VOCAB/N5/lesson1.txt', lesson: 1, format: 'csv' },
    { path: 'VOCAB/N5/lesson2.txt', lesson: 2, format: 'csv' },
    { path: 'VOCAB/N5/lesson3.txt', lesson: 3, format: 'csv' },
    { path: 'VOCAB/N5/lesson4.txt', lesson: 4, format: 'dash' },
    { path: 'VOCAB/N5/lesson5.txt', lesson: 5, format: 'dash' },
    { path: 'VOCAB/N5/Lesson6_Vocabulary.txt', lesson: 6, format: 'pipe' },
    { path: 'VOCAB/N5/Lesson_7_Vocabulary.txt', lesson: 7, format: 'pipe' },
    { path: 'VOCAB/N5/lesson8.txt', lesson: 8, format: 'dash' },
    { path: 'VOCAB/N5/lesson9.txt', lesson: 9, format: 'dash' },
    { path: 'VOCAB/N5/Lesson_10_Vocabulary.txt', lesson: 10, format: 'pipe' },
    { path: 'VOCAB/N5/L11_Anki.txt', lesson: 11, format: 'anki' },
    { path: 'VOCAB/N5/L12_Anki_FULL.txt', lesson: 12, format: 'anki' },
    { path: 'VOCAB/N5/L13_Anki_FULL.txt', lesson: 13, format: 'anki' },
    { path: 'VOCAB/N5/L14_Anki-1.txt', lesson: 14, format: 'anki' },
    { path: 'VOCAB/N5/L15_Anki-1.txt', lesson: 15, format: 'anki' },
  ];

  const KANJI_FILE = 'Kanji/Kanji n5/JLPT_N5_Kanji_Purno according to the deck.txt';

  /* ── Helpers ────────────────────────────────────────────── */

  /** Strip HTML tags */
  function stripHTML(s) {
    const d = document.createElement('div');
    d.innerHTML = s;
    return d.textContent || d.innerText || '';
  }

  /** Safe localStorage read */
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /** Bengali digit → number */
  function bnToNum(s) {
    const map = { '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9 };
    let n = '';
    for (const c of s) n += (map[c] !== undefined ? map[c] : c);
    return parseInt(n, 10) || 0;
  }

  /* ── CSV Parser (lesson1-5, 8, 9) ─────────────────────── */
  function parseCSV(text, lessonId) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const words = [];
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle quoted fields (some have commas in meaning)
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '"') { inQuotes = !inQuotes; continue; }
        if (line[c] === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
        current += line[c];
      }
      parts.push(current.trim());

      if (parts.length >= 3) {
        const num = bnToNum(parts[0]);
        words.push({
          id: num || i,
          jp: parts[1],
          roma: '',  // CSV files don't have romaji
          bn: parts[2],
          example: '',
          mnemonic: '',
          lessonId: lessonId,
          rating: lsGet(`samurai_rating_${lessonId}_${i - 1}`),
          ratingDate: lsGet(`samurai_rating_date_${lessonId}_${i - 1}`),
          masteryLevel: lsGet(`samurai_mastery_${lessonId}_${i - 1}`) || 'unseen',
          quizWrong: parseInt(lsGet(`samurai_qwrong_${lessonId}_${i - 1}`)) || 0,
        });
      }
    }
    return words;
  }

  /* ── Pipe/Table Parser (lesson 6, 7, 10) ──────────────── */
  function parsePipe(text, lessonId) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const words = [];
    let idx = 0;
    for (const line of lines) {
      // Skip header/separator/title lines
      if (/^(LESSON|={2,}|#|Sl\.|---|\s*$)/.test(line)) continue;
      // Match: number | Japanese | Bangla
      const pipeMatch = line.match(/^\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
      if (pipeMatch) {
        const num = parseInt(pipeMatch[1]);
        let jp = pipeMatch[2].trim();
        let bn = pipeMatch[3].trim();
        // Some have extra annotations like (N5 Listening) — keep them in bn
        words.push({
          id: num,
          jp: jp,
          roma: '',
          bn: bn,
          example: '',
          mnemonic: '',
          lessonId: lessonId,
          rating: lsGet(`samurai_rating_${lessonId}_${idx}`),
          ratingDate: lsGet(`samurai_rating_date_${lessonId}_${idx}`),
          masteryLevel: lsGet(`samurai_mastery_${lessonId}_${idx}`) || 'unseen',
          quizWrong: parseInt(lsGet(`samurai_qwrong_${lessonId}_${idx}`)) || 0,
        });
        idx++;
      }
    }
    return words;
  }

  /* ── Anki Parser (L11-L15) ────────────────────────────── */
  function parseAnki(text, lessonId) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const words = [];
    let idx = 0;
    for (const line of lines) {
      // Skip Anki metadata lines
      if (line.startsWith('#')) continue;
      if (!line.includes('\t')) continue;

      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const front = parts[0].trim(); // Japanese word
      const back = parts[1];        // HTML with meaning, romaji, example, mnemonic

      // Extract romaji from <span style="color:#aaa;font-style:italic;">romaji</span>
      const romaMatch = back.match(/font-style:\s*italic[^>]*>([^<]+)</);
      const roma = romaMatch ? romaMatch[1].trim() : '';

      // Extract Bangla meaning from first <b> with color
      const bnMatch = back.match(/color:#e8b86d[^>]*>([^<]+)/);
      const bn = bnMatch ? bnMatch[1].trim() : stripHTML(back).substring(0, 50);

      // Extract example
      const exMatch = back.match(/📖\s*Example:<\/b>\s*([^<]+)/);
      const example = exMatch ? exMatch[1].trim() : '';

      // Extract mnemonic
      const mnMatch = back.match(/🧠\s*Mnemonic:<\/b>\s*([\s\S]*?)(?=<br|$)/);
      let mnemonic = mnMatch ? stripHTML(mnMatch[1]).trim() : '';

      words.push({
        id: idx + 1,
        jp: front,
        roma: roma,
        bn: bn,
        example: example,
        mnemonic: mnemonic,
        lessonId: lessonId,
        rating: lsGet(`samurai_rating_${lessonId}_${idx}`),
        ratingDate: lsGet(`samurai_rating_date_${lessonId}_${idx}`),
        masteryLevel: lsGet(`samurai_mastery_${lessonId}_${idx}`) || 'unseen',
        quizWrong: parseInt(lsGet(`samurai_qwrong_${lessonId}_${idx}`)) || 0,
      });
      idx++;
    }
    return words;
  }

  /* ── Dash List Parser (1. Word — Meaning) ─────────────────────── */
  function parseDash(text, lessonId) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const words = [];
    const regex = /^\d+\.\s*(.+?)\s*[—\-]\s*(.+)$/;

    let idx = 0;
    for (const line of lines) {
      if (line.includes('LESSON')) continue;
      const match = line.match(regex);
      if (match) {
        words.push({
          id: idx + 1,
          jp: match[1].trim(),
          roma: '', // Not provided
          bn: match[2].trim(),
          lessonId: lessonId,
          rating: lsGet(`samurai_rating_${lessonId}_${idx}`),
          ratingDate: lsGet(`samurai_rating_date_${lessonId}_${idx}`),
          masteryLevel: lsGet(`samurai_mastery_${lessonId}_${idx}`) || 'unseen',
          quizWrong: parseInt(lsGet(`samurai_qwrong_${lessonId}_${idx}`)) || 0,
        });
        idx++;
      }
    }
    return words;
  }

  /* ── Kanji Parser ──────────────────────────────────────── */
  function parseKanji(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const kanjiList = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('\t')) continue;

      const parts = line.split('\t');
      const back = parts.length > 1 ? parts[1] : parts[0];

      // Extract kanji character from front
      const kanjiMatch = parts[0].match(/>([^<]{1})</);
      const kanji = kanjiMatch ? kanjiMatch[1] : '';
      if (!kanji) continue;

      // Hiragana / Katakana reading
      const readingMatch = back.match(/Hiragana\s*\/\s*Katakana\s*:\s*([^<]+)/);
      const reading = readingMatch ? readingMatch[1].trim() : '';

      // Pronunciation (romaji)
      const pronMatch = back.match(/Pronunciation\s*:\s*([^<]+)/);
      const pron = pronMatch ? pronMatch[1].trim() : '';

      // English meaning
      const engMatch = back.match(/English\s*:\s*([^<]+)/);
      const eng = engMatch ? engMatch[1].trim() : '';

      // Bangla meaning
      const bnMatch = back.match(/বাংলা\s*:\s*([^<]+)/);
      const bn = bnMatch ? bnMatch[1].trim() : '';

      // Example sentence (Japanese)
      const exJpMatch = back.match(/📝\s*([^<]+)/);
      const exJp = exJpMatch ? exJpMatch[1].trim() : '';

      // Example English
      const exEngParts = back.match(/color:#444[^>]*>([^<]+)/g);
      const exEng = exEngParts && exEngParts[0] ? stripHTML(exEngParts[0]).trim() : '';
      const exBn = exEngParts && exEngParts[1] ? stripHTML(exEngParts[1]).trim() : '';

      kanjiList.push({
        id: i + 1,
        kanji: kanji,
        reading: reading,      // Combined on/kun
        on: reading,           // For display
        kun: reading,          // Same field in this dataset
        roma: pron,
        eng: eng,
        bn: bn,
        exJp: exJp,
        exEng: exEng,
        exBn: exBn,
        strokes: 0,           // Not in data — will estimate
        rating: lsGet(`samurai_kanji_rating_${i}`),
        ratingDate: lsGet(`samurai_kanji_rating_date_${i}`),
        masteryLevel: lsGet(`samurai_kanji_mastery_${i}`) || 'unseen',
      });
    }
    return kanjiList;
  }

  /* ── Main Loader ───────────────────────────────────────── */
  async function loadAll() {
    const vocab = {};
    let totalWords = 0;

    // Load all vocab files
    const vocabPromises = VOCAB_FILES.map(async (f) => {
      try {
        const resp = await fetch(f.path);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        let words;
        switch (f.format) {
          case 'csv': words = parseCSV(text, f.lesson); break;
          case 'pipe': words = parsePipe(text, f.lesson); break;
          case 'anki': words = parseAnki(text, f.lesson); break;
          case 'dash': words = parseDash(text, f.lesson); break;
          default: words = [];
        }
        vocab[f.lesson] = words;
        totalWords += words.length;
      } catch (e) {
        console.warn(`JLPT Samurai: Failed to load ${f.path}:`, e.message);
        vocab[f.lesson] = [];
      }
    });

    // Load kanji file
    let kanjiList = [];
    const kanjiPromise = (async () => {
      try {
        const resp = await fetch(KANJI_FILE);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        kanjiList = parseKanji(text);
      } catch (e) {
        console.warn('JLPT Samurai: Failed to load kanji:', e.message);
      }
    })();

    await Promise.all([...vocabPromises, kanjiPromise]);

    const lessonCount = Object.keys(vocab).filter(k => vocab[k].length > 0).length;

    console.log(
      `%c⚔️ JLPT Samurai: Loaded ${totalWords} vocab words across ${lessonCount} lessons, ${kanjiList.length} kanji`,
      'color:#cc2200;font-weight:bold;font-size:14px'
    );

    return { vocab, kanji: kanjiList };
  }

  /* ── Export ─────────────────────────────────────────────── */
  window.SAMURAI_DATA = null;
  window.SAMURAI_READY = false;

  window.loadSamuraiData = async function () {
    if (window.SAMURAI_DATA) return window.SAMURAI_DATA;
    window.SAMURAI_DATA = await loadAll();
    window.SAMURAI_READY = true;
    // Dispatch event so pages know data is ready
    window.dispatchEvent(new CustomEvent('samurai-data-ready'));
    return window.SAMURAI_DATA;
  };

})();
