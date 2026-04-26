/**
 * JLPT SAMURAI — Core Application Engine (app.js)
 * Audio, localStorage, animations, quiz, flashcards, spaced repetition
 */
(function(){
'use strict';

/* ═══ SAKURA PETAL ANIMATION ═══ */
window.initSakura = function(canvasId){
  const c = document.getElementById(canvasId || 'sakura-canvas');
  if(!c) return;
  const ctx = c.getContext('2d');
  let W, H;
  function resize(){ W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);

  const petals = [];
  for(let i=0; i<45; i++){
    petals.push({
      x: Math.random()*W, y: Math.random()*H - H,
      s: Math.random()*8+4, // size
      r: Math.random()*Math.PI*2,
      vx: Math.random()*1 - 0.5,
      vy: Math.random()*1.5 + 0.5,
      vr: (Math.random()-0.5)*0.03,
      o: Math.random()*0.4 + 0.1
    });
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    for(const p of petals){
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = p.o;
      ctx.fillStyle = '#cc2200';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.s, p.s*0.5, 0, 0, Math.PI*2);
      ctx.fill();
      // Second smaller petal for realism
      ctx.fillStyle = '#ff4444';
      ctx.globalAlpha = p.o * 0.5;
      ctx.beginPath();
      ctx.ellipse(p.s*0.3, 0, p.s*0.6, p.s*0.3, 0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      p.x += p.vx + Math.sin(p.y*0.01)*0.3;
      p.y += p.vy;
      p.r += p.vr;
      // Fade near bottom
      if(p.y > H*0.85) p.o = Math.max(0, p.o - 0.005);
      if(p.y > H+20){ p.y = -20; p.x = Math.random()*W; p.o = Math.random()*0.4+0.1; }
    }
    requestAnimationFrame(draw);
  }
  draw();
};

/* ═══ AUDIO SYSTEM ═══ */
let lastBtn=null, voicesLoaded=false, jaVoice=null;
function loadVoices(){
  if(voicesLoaded) return;
  const all = window.speechSynthesis?.getVoices()||[];
  if(!all.length) return;
  voicesLoaded = true;
  jaVoice = all.find(v=>v.lang==='ja-JP'&&v.name.toLowerCase().includes('google'))
    || all.find(v=>v.lang==='ja-JP'||v.lang.startsWith('ja')) || null;
}
if(window.speechSynthesis){ window.speechSynthesis.onvoiceschanged=loadVoices; loadVoices(); }

window.speak = function(text, btnEl){
  if(lastBtn){ lastBtn.classList.remove('playing'); lastBtn=null; }
  if(btnEl){ lastBtn=btnEl; btnEl.classList.add('playing'); }
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); loadVoices();
  const u = new SpeechSynthesisUtterance(text);
  u.lang='ja-JP'; u.rate=0.8; u.pitch=1; u.volume=1;
  if(jaVoice) u.voice = jaVoice;
  u.onend = u.onerror = ()=>{ if(btnEl) btnEl.classList.remove('playing'); if(lastBtn===btnEl) lastBtn=null; };
  window.speechSynthesis.speak(u);
};

/* ═══ FIREBASE CLOUD SYNC ═══ */
const FIREBASE_VERSION = "8.10.1";
window.initFirebase = function(callback) {
  if (window.firebase) { if(callback) callback(); return; }
  const s1 = document.createElement('script');
  s1.src = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
  document.head.appendChild(s1);
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;
    document.head.appendChild(s2);
    s2.onload = () => {
      const s3 = document.createElement('script');
      s3.src = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;
      document.head.appendChild(s3);
      s3.onload = () => {
        firebase.initializeApp({
          apiKey: "AIzaSyCO9zaTee5V4a3CIQ9RYDPnm8DZKSLuLLo",
          authDomain: "jlpt-samurai.firebaseapp.com",
          projectId: "jlpt-samurai",
          storageBucket: "jlpt-samurai.firebasestorage.app",
          messagingSenderId: "166726653148",
          appId: "1:166726653148:web:84fda6e81c9c11c67f5019"
        });
        window.db = firebase.firestore();
        
        // Listen to auth state
        firebase.auth().onAuthStateChanged(user => {
          if(!user && !window.location.href.includes('auth.html')){
            localStorage.removeItem('samurai_active_user');
            window.location.href = 'auth.html';
          }
        });
        
        if (callback) callback();
      }
    }
  }
};

/* ═══ AUTHENTICATION & LOCALSTORAGE HELPERS ═══ */
window.CURRENT_USER = localStorage.getItem('samurai_active_user');
if (!window.CURRENT_USER && !window.location.href.includes('auth.html')) {
  window.location.href = 'auth.html';
}

// Fetch cloud data automatically if logged in
if (window.CURRENT_USER && !window.location.href.includes('auth.html')) {
  initFirebase(() => {
    window.db.collection('samurai_users').doc(window.CURRENT_USER).get().then(doc => {
      if (doc.exists) {
        const data = doc.data();
        const prefix = window.CURRENT_USER + '_';
        for (const k in data) {
          localStorage.setItem(prefix + k, data[k]);
        }
        window.dispatchEvent(new CustomEvent('samurai-cloud-synced'));
      }
    }).catch(console.error);
  });
}

window.logout = function() {
  if(window.firebase) firebase.auth().signOut();
  localStorage.removeItem('samurai_active_user');
  window.location.href = 'auth.html';
};

let syncTimeout = null;
window.debouncedSync = function() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    if (!window.CURRENT_USER || !window.db) return;
    const prefix = window.CURRENT_USER + '_';
    const data = {};
    let xp = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(prefix)) {
        const keyName = k.substring(prefix.length);
        const val = localStorage.getItem(k);
        data[keyName] = val;
        
        // Calculate XP
        if (keyName.includes('mastery')) {
          if (val === 'learned') xp += 10;
          if (val === 'mastered') xp += 25;
        }
      }
    }
    const streak = parseInt(data['streak']) || 0;
    xp += streak * 50; // Bonus for streaks
    
    data.xp = xp;
    data.username = localStorage.getItem('samurai_username') || localStorage.getItem('samurai_active_email').split('@')[0];
    
    window.db.collection('samurai_users').doc(window.CURRENT_USER).set(data, {merge: true}).catch(console.error);
  }, 2000);
};

window.lsSet = function(k,v){ try{ localStorage.setItem(window.CURRENT_USER + '_' + k,v); debouncedSync(); }catch(e){} };
window.lsGet = function(k){ try{ return localStorage.getItem(window.CURRENT_USER + '_' + k); }catch(e){ return null; } };
window.lsGetJSON = function(k){ try{ return JSON.parse(localStorage.getItem(window.CURRENT_USER + '_' + k)); }catch(e){ return null; } };
window.lsSetJSON = function(k,v){ try{ localStorage.setItem(window.CURRENT_USER + '_' + k,JSON.stringify(v)); debouncedSync(); }catch(e){} };

/* ═══ RATING & MASTERY SYSTEM ═══ */
// Mastery levels: unseen → seen → reviewed → learned → mastered
const MASTERY = { unseen:'⚪', seen:'🔴', reviewed:'🟡', learned:'🟢', mastered:'⭐' };
window.MASTERY_ICONS = MASTERY;

window.saveRating = function(type, lessonId, wordIdx, rating){
  const prefix = type==='kanji' ? 'samurai_kanji' : `samurai`;
  const key = type==='kanji' ? `${prefix}_rating_${wordIdx}` : `${prefix}_rating_${lessonId}_${wordIdx}`;
  lsSet(key, rating);
  lsSet(key+'_date', new Date().toISOString());

  // Update mastery
  const mKey = type==='kanji' ? `${prefix}_mastery_${wordIdx}` : `${prefix}_mastery_${lessonId}_${wordIdx}`;
  const cur = lsGet(mKey) || 'unseen';
  let next = cur;
  if(rating==='easy') next = 'mastered';
  else if(rating==='good'){
    if(cur==='unseen'||cur==='seen') next = 'reviewed';
    else if(cur==='reviewed') next = 'learned';
    else next = cur;
  } else if(rating==='hard'||rating==='again'){
    next = 'seen';
  }
  lsSet(mKey, next);

  // Spaced repetition: save next review date
  const dKey = type==='kanji' ? `${prefix}_due_${wordIdx}` : `${prefix}_due_${lessonId}_${wordIdx}`;
  const now = new Date();
  let days = 0;
  if(rating==='again') days = 0; // same session
  else if(rating==='hard') days = 1;
  else if(rating==='good') days = 3;
  else if(rating==='easy') days = 7;
  const due = new Date(now.getTime() + days*86400000);
  lsSet(dKey, due.toISOString().split('T')[0]);

  updateStreak();
};

window.getWordMastery = function(type, lessonId, wordIdx){
  const k = type==='kanji' ? `samurai_kanji_mastery_${wordIdx}` : `samurai_mastery_${lessonId}_${wordIdx}`;
  return lsGet(k) || 'unseen';
};

window.getWordRating = function(type, lessonId, wordIdx){
  const k = type==='kanji' ? `samurai_kanji_rating_${wordIdx}` : `samurai_rating_${lessonId}_${wordIdx}`;
  return lsGet(k);
};

window.isDueToday = function(type, lessonId, wordIdx){
  const k = type==='kanji' ? `samurai_kanji_due_${wordIdx}` : `samurai_due_${lessonId}_${wordIdx}`;
  const due = lsGet(k);
  if(!due) return true; // unseen = due
  return due <= new Date().toISOString().split('T')[0];
};

/* ═══ WEAK WORD DETECTION ═══ */
window.isWeakWord = function(type, lessonId, wordIdx){
  const rating = getWordRating(type, lessonId, wordIdx);
  if(rating==='again'||rating==='hard') return true;
  const qk = type==='kanji' ? `samurai_kanji_qwrong_${wordIdx}` : `samurai_qwrong_${lessonId}_${wordIdx}`;
  return (parseInt(lsGet(qk))||0) >= 1;
};

window.recordQuizWrong = function(type, lessonId, wordIdx){
  const k = type==='kanji' ? `samurai_kanji_qwrong_${wordIdx}` : `samurai_qwrong_${lessonId}_${wordIdx}`;
  lsSet(k, (parseInt(lsGet(k))||0) + 1);
};

window.getWeakWords = function(lessonId){
  const data = window.SAMURAI_DATA;
  if(!data || !data.vocab[lessonId]) return [];
  return data.vocab[lessonId].filter((_,i) => isWeakWord('vocab', lessonId, i));
};

window.getAllWeakWords = function(){
  const data = window.SAMURAI_DATA;
  if(!data) return [];
  const weak = [];
  for(const lid of Object.keys(data.vocab)){
    data.vocab[lid].forEach((w,i) => {
      if(isWeakWord('vocab', lid, i)) weak.push({...w, lessonId: parseInt(lid), wordIdx: i});
    });
  }
  return weak;
};

/* ═══ STREAK SYSTEM ═══ */
window.updateStreak = function(){
  const today = new Date().toISOString().split('T')[0];
  const lastDate = lsGet('samurai_last_study');
  const streak = parseInt(lsGet('samurai_streak')) || 0;
  if(lastDate === today) return; // already counted today
  const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
  if(lastDate === yesterday) lsSet('samurai_streak', streak+1);
  else lsSet('samurai_streak', 1);
  lsSet('samurai_last_study', today);
  // Save study calendar
  const cal = lsGetJSON('samurai_calendar') || {};
  cal[today] = true;
  lsSetJSON('samurai_calendar', cal);
};

/* ═══ DASHBOARD STATS ═══ */
window.getDashboardStats = function(){
  const data = window.SAMURAI_DATA;
  if(!data) return {mastered:0,lessonsComplete:0,kanjiLearned:0,streak:0,needsReview:0};
  let mastered=0, lessonsComplete=0, kanjiLearned=0, needsReview=0;
  for(const lid of Object.keys(data.vocab)){
    let allMastered = true, anyStarted = false;
    data.vocab[lid].forEach((w,i) => {
      const m = getWordMastery('vocab', w.lessonId, w.originalIdx);
      if(m==='mastered'||m==='learned') mastered++;
      if(m!=='unseen') anyStarted = true;
      if(m!=='mastered') allMastered = false;
      if(isWeakWord('vocab', w.lessonId, w.originalIdx)) needsReview++;
    });
    if(anyStarted && allMastered && data.vocab[lid].length > 0) lessonsComplete++;
  }
  data.kanji.forEach((_,i) => {
    const m = getWordMastery('kanji', null, i);
    if(m==='mastered'||m==='learned') kanjiLearned++;
  });
  return { mastered, lessonsComplete, kanjiLearned, streak: parseInt(lsGet('samurai_streak'))||0, needsReview };
};

/* ═══ LESSON STATUS ═══ */
window.getLessonStatus = function(lessonId){
  const data = window.SAMURAI_DATA;
  if(!data || !data.vocab[lessonId] || data.vocab[lessonId].length===0) return {status:'empty',pct:0,total:0,weak:0,due:0};
  const words = data.vocab[lessonId];
  let seen=0, mastered=0, weak=0, due=0;
  words.forEach((w,i)=>{
    const m = getWordMastery('vocab', w.lessonId, w.originalIdx);
    if(m!=='unseen') seen++;
    if(m==='mastered') mastered++;
    if(isWeakWord('vocab', w.lessonId, w.originalIdx)) weak++;
    if(isDueToday('vocab', w.lessonId, w.originalIdx)) due++;
  });
  const pct = Math.round(mastered/words.length*100);
  let status = '🔴';
  if(seen===0) status = '🔴';
  else if(mastered===words.length) status = '🏆';
  else if(lsGet(`samurai_quiz_passed_${lessonId}`)) status = '⚔️';
  else status = '🟡';
  return {status, pct, total: words.length, weak, due, seen, mastered};
};

/* ═══ SLASH ANIMATION ═══ */
window.slashAnimation = function(){
  const el = document.createElement('div');
  el.className = 'slash-overlay';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 400);
};

/* ═══ PAGE LOADER ═══ */
window.hideLoader = function(){
  const l = document.getElementById('page-loader');
  if(l){ setTimeout(()=>{ l.classList.add('hidden'); setTimeout(()=>l.remove(),600); }, 1200); }
};

/* ═══ SESSION TIMER ═══ */
window.startSessionTimer = function(){
  const el = document.createElement('div');
  el.className = 'session-timer';
  el.id = 'session-timer';
  document.body.appendChild(el);
  const start = Date.now();
  const iv = setInterval(()=>{
    const s = Math.floor((Date.now()-start)/1000);
    const m = Math.floor(s/60), sec = s%60;
    el.textContent = `⏱ ${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    if(m===25 && sec===0){
      el.style.color = 'var(--gold)';
      el.textContent += ' — Break?';
    }
  }, 1000);
  return {stop:()=>{clearInterval(iv); el.remove(); return Math.floor((Date.now()-start)/1000);}};
};

/* ═══ COUNTER ANIMATION ═══ */
window.animateCounter = function(el, target, duration){
  duration = duration || 800;
  const start = performance.now();
  const from = 0;
  function tick(now){
    const p = Math.min((now-start)/duration, 1);
    const ease = 1 - Math.pow(1-p, 3); // ease-out cubic
    el.textContent = Math.round(from + (target-from)*ease);
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};

/* ═══ REVIEW CALENDAR ═══ */
window.renderCalendar = function(containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  const cal = lsGetJSON('samurai_calendar') || {};
  let html = '<div class="cal-row">';
  for(let i=6; i>=0; i--){
    const d = new Date(Date.now() - i*86400000);
    const key = d.toISOString().split('T')[0];
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const cls = cal[key] ? 'studied' : 'missed';
    html += `<div class="cal-day ${cls}" title="${key}">${day[0]}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
};

/* ═══ QUIZ ENGINE ═══ */
window.SamuraiQuiz = class {
  constructor(words, opts){
    this.allWords = words;
    this.type = opts.type || 'mixed';
    this.count = opts.count === 'all' ? words.length : parseInt(opts.count) || 20;
    this.pool = opts.pool || 'all';
    this.lessonId = opts.lessonId;
    this.isKanji = opts.isKanji || false;
    this.questions = [];
    this.idx = 0;
    this.score = 0;
    this.wrongs = [];
    this.answered = false;
    this.bestStreak = 0;
    this.curStreak = 0;
    this.startTime = Date.now();
    this._buildQuestions();
  }

  _buildQuestions(){
    let pool = [...this.allWords];
    // Smart weighting: weak words 3x, easy 1x, unseen prioritized
    const weighted = [];
    pool.forEach((w) => {
      const weak = isWeakWord(this.isKanji?'kanji':'vocab', w.lessonId, w.originalIdx);
      const rating = getWordRating(this.isKanji?'kanji':'vocab', w.lessonId, w.originalIdx);
      let weight = 2;
      if(weak) weight = 4;
      else if(rating==='easy') weight = 1;
      else if(!rating) weight = 3; // unseen prioritized
      for(let j=0;j<weight;j++) weighted.push({word:w, origIdx: w.originalIdx});
    });
    // Shuffle and pick
    for(let i=weighted.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[weighted[i],weighted[j]]=[weighted[j],weighted[i]];}
    // Deduplicate by picking unique words up to count
    const seen = new Set();
    const picked = [];
    for(const item of weighted){
      const key = item.word.jp + item.word.bn;
      if(!seen.has(key)){ seen.add(key); picked.push(item); }
      if(picked.length >= this.count) break;
    }
    // If not enough unique, cycle
    while(picked.length < this.count && pool.length > 0){
      const pWord = pool[picked.length % pool.length];
      picked.push({word: pWord, origIdx: pWord.originalIdx});
    }

    const types = this.isKanji ? ['kanji_bn','kanji_reading'] : ['jp_bn','bn_jp','audio','roma'];
    for(const item of picked){
      const w = item.word;
      let t = this.type;
      if(t==='mixed') t = types[Math.floor(Math.random()*types.length)];
      this.questions.push(this._genQ(w, t, item.origIdx));
    }
  }

  _genQ(w, type, origIdx){
    // Get 3 wrong options from same lesson (confusion pairs)
    const others = this.allWords.filter(x => x.jp !== w.jp || x.bn !== w.bn)
      .sort(()=>Math.random()-0.5).slice(0,3);
    let prompt, display, correct, opts, displaySub='';

    if(this.isKanji){
      if(type==='kanji_bn'){
        prompt='What does this kanji mean?'; display=w.kanji||w.jp; correct=w.bn;
        opts=[w.bn,...others.map(x=>x.bn)];
      } else {
        prompt='What is the reading?'; display=w.kanji||w.jp; correct=w.reading||w.roma;
        opts=[w.reading||w.roma,...others.map(x=>x.reading||x.roma)];
      }
    } else {
      if(type==='jp_bn'){
        prompt='What is the Bangla meaning?'; display=w.jp; displaySub=w.roma; correct=w.bn;
        opts=[w.bn,...others.map(x=>x.bn)];
      } else if(type==='bn_jp'){
        prompt='Which Japanese word matches?'; display=w.bn; correct=w.jp;
        opts=[w.jp,...others.map(x=>x.jp)];
      } else if(type==='audio'){
        prompt='Listen and identify'; display='🔊'; correct=w.jp;
        opts=[w.jp,...others.map(x=>x.jp)];
      } else {
        prompt='What is the romaji?'; display=w.jp; correct=w.roma||'—';
        opts=[w.roma||'—',...others.map(x=>x.roma||'—')];
      }
    }
    // Shuffle options and ensure unique
    opts = [...new Set(opts)].sort(()=>Math.random()-0.5);
    if(opts.length < 4){
      while(opts.length < 4) opts.push('—');
    }
    return {w, type, prompt, display, displaySub, correct, opts: opts.slice(0,4), origIdx, mnemonic: w.mnemonic||w.mn||''};
  }

  current(){ return this.questions[this.idx]; }
  total(){ return this.questions.length; }
  progress(){ return (this.idx+1)/this.total()*100; }

  answer(chosen){
    if(this.answered) return null;
    this.answered = true;
    const q = this.current();
    const isCorrect = chosen === q.correct;
    if(isCorrect){
      this.score++;
      this.curStreak++;
      if(this.curStreak > this.bestStreak) this.bestStreak = this.curStreak;
    } else {
      this.curStreak = 0;
      this.wrongs.push(q);
      recordQuizWrong(this.isKanji?'kanji':'vocab', q.w.lessonId, q.w.originalIdx);
    }
    return isCorrect;
  }

  next(){
    if(this.idx < this.total()-1){ this.idx++; this.answered = false; return true; }
    return false; // quiz done
  }

  getResult(){
    const pct = Math.round(this.score/this.total()*100);
    const elapsed = Math.floor((Date.now()-this.startTime)/1000);
    let grade, color, msg;
    if(pct>=90){ grade='S'; color='var(--gold)'; msg='⚔️ Outstanding. You are ready for battle.'; }
    else if(pct>=75){ grade='A'; color='var(--green)'; msg='🎯 Strong performance. Review the marked words.'; }
    else if(pct>=60){ grade='B'; color='var(--white)'; msg="📚 You're improving. Focus on weak points."; }
    else if(pct>=45){ grade='C'; color='var(--orange)'; msg='⚠️ Needs work. Study these words again:'; }
    else { grade='D'; color='var(--red)'; msg='🔴 Return to the dojo. Serious review needed:'; }
    // Mark quiz passed if B or better
    if(pct >= 60 && this.lessonId) lsSet(`samurai_quiz_passed_${this.lessonId}`, 'true');
    return { grade, color, msg, pct, score: this.score, total: this.total(), wrongs: this.wrongs, elapsed, bestStreak: this.bestStreak, avgTime: Math.round(elapsed/this.total()) };
  }
};

/* ═══ FLASHCARD ENGINE ═══ */
window.SamuraiFlashcards = class {
  constructor(words, opts){
    this.allWords = words;
    this.lessonId = opts.lessonId;
    this.isKanji = opts.isKanji || false;
    this.filter = 'all';
    this.deck = [...words];
    this.idx = 0;
    this.flipped = false;
    this.reviewedCount = 0;
    this.sessionRatings = {};
  }

  setFilter(f){
    this.filter = f;
    this.deck = this._getFilteredDeck();
    if(!this.deck.length){ this.filter='all'; this.deck=[...this.allWords]; }
    this.idx = 0; this.flipped = false;
  }

  _getFilteredDeck(){
    if(this.filter==='all') return [...this.allWords];
    return this.allWords.filter((w) => {
      const r = getWordRating(this.isKanji?'kanji':'vocab', w.lessonId, w.originalIdx);
      if(this.filter==='hard') return r==='again'||r==='hard';
      if(this.filter==='good') return r==='good';
      if(this.filter==='easy') return r==='easy';
      if(this.filter==='unseen') return !r;
      return true;
    });
  }

  current(){ return this.deck[this.idx]; }
  total(){ return this.deck.length; }
  progress(){ return this.deck.length ? (this.idx+1)/this.deck.length*100 : 0; }

  flip(){ this.flipped = !this.flipped; return this.flipped; }
  nav(dir){ this.idx = Math.max(0, Math.min(this.deck.length-1, this.idx+dir)); this.flipped=false; }

  shuffle(){
    for(let i=this.deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]];}
    this.idx=0; this.flipped=false;
  }

  rate(rating){
    const w = this.current();
    if(!w) return;
    saveRating(this.isKanji?'kanji':'vocab', w.lessonId, w.originalIdx, rating);
    this.sessionRatings[this.idx] = rating;
    this.reviewedCount++;
    // Again: reinsert 2 cards later
    if(rating==='again' && this.idx < this.deck.length-2){
      const copy = {...w};
      this.deck.splice(this.idx+3, 0, copy);
    }
    if(this.idx < this.deck.length-1) this.nav(1);
  }

  isComplete(){ return this.idx >= this.deck.length-1 && Object.keys(this.sessionRatings).length >= this.deck.length; }

  getSessionSummary(){
    const again = Object.values(this.sessionRatings).filter(r=>r==='again').length;
    const hard = Object.values(this.sessionRatings).filter(r=>r==='hard').length;
    const good = Object.values(this.sessionRatings).filter(r=>r==='good').length;
    const easy = Object.values(this.sessionRatings).filter(r=>r==='easy').length;
    return { reviewed: this.reviewedCount, again, hard, good, easy, hardWords: this.deck.filter((_,i) => this.sessionRatings[i]==='again'||this.sessionRatings[i]==='hard') };
  }
};

/* ═══ KEYBOARD SHORTCUTS ═══ */
document.addEventListener('keydown', e => {
  const ev = new CustomEvent('samurai-key', {detail: e.key});
  window.dispatchEvent(ev);
});

/* ═══ NAVBAR BUILDER ═══ */
window.buildNavbar = function(activePage){
  const nav = document.querySelector('nav.samurai-nav');
  if(!nav) return;
  const userDisplay = localStorage.getItem('samurai_active_email') || 'User';
  const shortName = userDisplay.split('@')[0];
  
  nav.innerHTML = `
    <div class="nav-top">
      <a class="nav-brand" href="index.html">⚔️ JLPT SAMURAI <span>侍</span></a>
      ${window.CURRENT_USER ? `<div class="nav-user-chip" onclick="logout()" title="Click to logout">👤 ${shortName}</div>` : ''}
    </div>
    <div class="nav-links">
      <a class="nav-link ${activePage==='home'?'active':''}" href="index.html">Home</a>
      <a class="nav-link ${activePage==='profile'?'active':''}" href="profile.html">Profile</a>
      <a class="nav-link ${activePage==='leaderboard'?'active':''}" href="leaderboard.html">Rankings</a>
      <a class="nav-link ${activePage==='n5'?'active':''}" href="n5.html">N5</a>
      <a class="nav-link ${activePage==='n4'?'active':''}" href="n4.html">N4</a>
      <a class="nav-link ${activePage==='kana'?'active':''}" href="kana.html">Kana</a>
      <a class="nav-link ${activePage==='about'?'active':''}" href="about.html">About</a>
    </div>`;
};

/* ═══ FOOTER BUILDER ═══ */
window.buildFooter = function(){
  const f = document.querySelector('.samurai-footer');
  if(f) f.innerHTML = '⚔️ JLPT Samurai — Master Japanese. One Slash at a Time. — 2026';
};

})();
