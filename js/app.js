console.log("JS IS RUNNING");

import { hsk1 } from "./data/hsk1.js";
import { hsk2 } from "./data/hsk2.js";
import { radicals } from "./data/radicals.js";

const STORAGE_KEYS = {
  progress: "hsk_progress_v2",
  settings: "hsk_settings_v2",
  streak: "hsk_streak_v2"
};

const DAY_MS = 24 * 60 * 60 * 1000;

const rawSets = [hsk1, hsk2];
let state = {
  activeSetId: null,
  activeFilter: "all",
  frontMode: "hanzi",
  isShuffled: false,
  studyIndex: 0,
  currentDeck: [],
  allCards: [],
  drawingWord: "",
  drawingCharIndex: 0,
  showingAllChars: false,
  speechSpeed: 0.8,
  autoResetFlip: true,
  theme: "aurora",
  fontSize: 16,
  lastRatedCard: null, // <-- ADD THIS LINE
  goals: JSON.parse(localStorage.getItem("hsk_goals_v2") || '{"time": 15, "words": 20}') // 👈 ADD THIS LINE
};

let strokeWriter = null;
let canvasReady = false;
let drawing = false;

const elements = {
  body: document.body,
  lobbyScreen: document.getElementById("lobbyScreen"),
  studyScreen: document.getElementById("studyScreen"),
  setGrid: document.getElementById("setGrid"),
  activeSetLabel: document.getElementById("activeSetLabel"),
  studyTitle: document.getElementById("studyTitle"),
  cardCounter: document.getElementById("cardCounter"),
  cardFaceBadge: document.getElementById("cardFaceBadge"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  wordList: document.getElementById("wordList"),
  frontDisplay: document.getElementById("frontDisplay"),
  frontHint: document.getElementById("frontHint"),
  backHanzi: document.getElementById("backHanzi"),
  backPinyin: document.getElementById("backPinyin"),
  backEnglish: document.getElementById("backEnglish"),
  backExamples: document.getElementById("backExamples"),
  cardInner: document.getElementById("cardInner"),
  wordStatusBadge: document.getElementById("wordStatusBadge"),
  toggleShuffleBtn: document.getElementById("toggleShuffleBtn"),
  statsGrid: document.getElementById("statsGrid"),
  streakCount: document.getElementById("streakCount"),
  lastStudyDate: document.getElementById("lastStudyDate"),
  streakBest: document.getElementById("streakBest"),
  streakCalendar: document.getElementById("streakCalendar"),
  infoContainer: document.getElementById("infoContainer"),
  charRefDisplay: document.getElementById("charRefDisplay"),
  strokeControls: document.getElementById("strokeControls"),
  allCharactersDisplay: document.getElementById("allCharactersDisplay"),
  drawTitle: document.getElementById("drawTitle"),
  canvas: document.getElementById("canvas"),
  themeSelect: document.getElementById("themeSelect"),
  fontSizeRange: document.getElementById("fontSizeRange"),
  defaultFrontSelect: document.getElementById("defaultFrontSelect"),
  speechSpeedRange: document.getElementById("speechSpeedRange"),
  autoResetFlipToggle: document.getElementById("autoResetFlipToggle"),
  importFile: document.getElementById("importFile"),
  completionCopy: document.getElementById("completionCopy")
};

const modals = [
  "settingsModal",
  "statsModal",
  "streakModal",
  "infoModal",
  "drawModal",
  "completionModal",
  "goalsModal",
  "goalCelebrationModal",
  "goalResetConfirmModal"
];

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
    frontMode: state.frontMode,
    speechSpeed: state.speechSpeed,
    autoResetFlip: state.autoResetFlip,
    theme: state.theme,
    fontSize: state.fontSize
  }));
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
  state.frontMode = saved.frontMode || "hanzi";
  state.speechSpeed = saved.speechSpeed || 0.8;
  state.autoResetFlip = saved.autoResetFlip ?? true;
  state.theme = saved.theme || "aurora";
  state.fontSize = saved.fontSize || 16;

  elements.body.dataset.theme = state.theme;
  document.documentElement.style.fontSize = `${state.fontSize}px`;
  elements.themeSelect.value = state.theme;
  elements.fontSizeRange.value = String(state.fontSize);
  elements.defaultFrontSelect.value = state.frontMode;
  elements.speechSpeedRange.value = String(state.speechSpeed);
  elements.autoResetFlipToggle.checked = state.autoResetFlip;
  updateFrontModeButtons();
}

// --- LOAD PERSISTENT GOALS ON STARTUP ---
function loadGoals() {
  const savedGoals = localStorage.getItem("hsk_goals_v2");
  if (savedGoals) {
    try {
      state.goals = JSON.parse(savedGoals);
    } catch (e) {
      console.error("Error loading goals:", e);
      state.goals = { time: 15, words: 20 };
    }
  } else {
    // Default fallback
    state.goals = state.goals || { time: 15, words: 20 };
  }
}


function buildCard(word, setId) {
  return {
    id: `${setId}:${word[0]}`,
    setId,
    hanzi: word[0],
    pinyin: word[1],
    type: word[2] || "",        // "verb"
    english: word[3] || "",     // "to love"
    examples: word[4] || "",    // "我爱我的家。~wǒ ài wǒ de jiā.\nI love my family."
    status: "normal",
    interval: 1,
    ease: 2.5,
    reviewCount: 0,
    consecutiveCorrect: 0,
    nextReview: Date.now()
  };
}

function hydrateSets() {
  const savedProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || "{}");

  return rawSets.map((set) => ({
    ...set,
    words: set.words.map((word) => {
      const base = buildCard(word, set.id);
      return savedProgress[base.id] ? { ...base, ...savedProgress[base.id] } : base;
    })
  }));
}

function persistProgress() {
  const payload = {};
  rawSetsState().forEach((set) => {
    set.words.forEach((word) => {
      payload[word.id] = word;
    });
  });
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(payload));
}

function rawSetsState() {
  return window.__hskSets || [];
}

function setRawSetsState(nextSets) {
  window.__hskSets = nextSets;
}

function getSetById(setId) {
  return rawSetsState().find((set) => set.id === setId);
}

function getHSK1Completion() {
  const set = getSetById("hsk1");
  if (!set || set.words.length === 0) return 0;
  const mastered = set.words.filter((word) => word.status === "mastered").length;
  return mastered / set.words.length;
}

function isSetUnlocked(setId) {
  if (setId === "hsk1") return true;
  return getHSK1Completion() === 1;
}

function renderLobby() {
  elements.setGrid.innerHTML = "";

  rawSetsState().forEach((set) => {
    const progress = set.words.filter((word) => word.status === "mastered").length;
    const completion = set.words.length ? Math.round((progress / set.words.length) * 100) : 0;
    const unlocked = isSetUnlocked(set.id);

    // Check if the user has started studying this set
    const hasStarted = set.words.some((word) => word.status !== "normal" || (word.reviewCount && word.reviewCount > 0));

    // Determine button text dynamically
    let buttonText = "Start set";
    if (!unlocked) {
      buttonText = "Finish HSK 1 first";
    } else if (hasStarted) {
      buttonText = "Continue";
    }
    
    const card = document.createElement("article");
    card.className = `set-card${unlocked ? "" : " locked"}`;
    card.innerHTML = `
      <div class="set-card-top">
        <div>
          <p class="eyebrow">${set.level}</p>
          <h3 class="set-title">${set.title}</h3>
        </div>
        <div class="flex items-center gap-2">
          <span class="pill">${unlocked ? "Unlocked" : "Locked"}</span>
          ${unlocked ? `<button class="icon-btn reset-set-btn" title="Reset Set Progress">Reset</button>` : ""}
        </div>
      </div>
      <p class="set-note">${set.description}</p>
      <div class="set-card-bottom">
        <div class="muted">${set.words.length} words</div>
        <div class="muted">${completion}% mastered</div>
      </div>
      <div class="progress-rail">
        <div class="progress-fill" style="width:${completion}%"></div>
      </div>
      <button class="${unlocked ? "primary-btn" : "secondary-btn"}">${buttonText}</button>
    `;

    // Reset Progress Event Handler
    const resetBtn = card.querySelector(".reset-set-btn");
    resetBtn?.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevents launching the set when clicking reset
      
      const confirmReset = window.confirm(`Are you sure you want to reset all progress for "${set.title}"?`);
      if (confirmReset) {
        set.words.forEach((word) => {
          word.status = "normal";
          word.interval = 1;
          word.consecutiveCorrect = 0;
          word.nextReview = 0;
          word.starred = false;
        });

        persistProgress();
        renderLobby();
      }
    });

    // Main Set Action Event Handler
    card.querySelector(".primary-btn, .secondary-btn")?.addEventListener("click", () => {
      if (!unlocked) {
        openModal("statsModal");
        renderStats();
        return;
      }
      startSet(set.id);
    });

    elements.setGrid.appendChild(card);
  });
}

function getStatusLabel(status) {
  if (status === "mastered") return "Mastered";
  if (status === "review") return "Needs review";
  return "New";
}

function updateFrontModeButtons() {
  document.querySelectorAll("[data-front]").forEach((button) => {
    button.classList.toggle("active", button.dataset.front === state.frontMode);
  });
  elements.cardFaceBadge.textContent = `Front: ${frontModeLabel(state.frontMode)}`;
}

function frontModeLabel(mode) {
  if (mode === "pinyin") return "Pinyin";
  if (mode === "english") return "Translation";
  return "Mandarin";
}

function currentWord() {
  return state.currentDeck[state.studyIndex];
}


function updateStudyDeck() {
  const set = getSetById(state.activeSetId);
  if (!set) return;

  let deck = [...set.words];
  const now = Date.now();

  // FILTER LOGIC
  if (state.activeFilter === "review") {
    deck = deck.filter((word) => word.status === "review");
  } else if (state.activeFilter === "due") {
    deck = deck.filter((word) => word.nextReview <= now || word.status === "review");
  } else if (state.activeFilter === "mastered") {
    deck = deck.filter((word) => word.status === "mastered");
  } else if (state.activeFilter === "normal") {
    deck = deck.filter((word) => word.status === "normal");
  } else if (state.activeFilter === "starred") {
    deck = deck.filter((word) => word.starred);
  }

  if (state.isShuffled) {
    deck = shuffle([...deck]);
  }

  state.currentDeck = deck;
  if (state.studyIndex >= state.currentDeck.length) {
    state.studyIndex = Math.max(0, state.currentDeck.length - 1);
  }
}

function startSet(setId) {
  state.activeSetId = setId;
  state.activeFilter = "all";
  state.studyIndex = 0;
  state.isShuffled = false;
  elements.toggleShuffleBtn.textContent = "Shuffle Off";
  document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
  document.querySelectorAll("[data-front]").forEach((item) => item.classList.toggle("active", item.dataset.front === state.frontMode));
  updateStudyDeck();
  elements.lobbyScreen.classList.remove("active");
  elements.studyScreen.classList.add("active");
  renderStudy();
}

function showLobby() {
  elements.studyScreen.classList.remove("active");
  elements.lobbyScreen.classList.add("active");
  renderLobby();
}

function renderStudy() {
  const set = getSetById(state.activeSetId);
  updateStudyDeck();

  elements.activeSetLabel.textContent = set ? `${set.title} • ${set.level}` : "Study";
  elements.studyTitle.textContent = set ? `${set.title} session` : "Study Session";

  if (!state.currentDeck.length) {
    elements.cardInner.classList.remove("flipped");
    elements.frontDisplay.textContent = "No cards here yet";
    elements.frontHint.textContent = state.activeFilter === "review" ? "Try studying all words first." : "Switch filter or add more data.";
    elements.backHanzi.textContent = "";
    elements.backPinyin.textContent = "";
    elements.backEnglish.textContent = "";
    elements.backExamples.textContent = "";
    elements.cardCounter.textContent = "0 / 0";
    elements.progressBar.style.width = "0%";
    elements.progressText.textContent = "0%";
    renderWordList();
    return;
  }

  const word = currentWord();
  const progress = Math.round(((state.studyIndex + 1) / state.currentDeck.length) * 100);

  const frontMap = {
    hanzi: word.hanzi,
    pinyin: word.pinyin,
    english: word.english
  };

  // UPDATED: No small Hanzi character underneath in Pinyin/English mode
  const hintMap = {
    hanzi: "Tap to reveal pinyin, translation, and examples",
    pinyin: word.hanzi,
    english: "Tap to reveal character and details"
  };

  elements.frontDisplay.textContent = frontMap[state.frontMode];
  elements.frontHint.textContent = hintMap[state.frontMode];
  elements.backHanzi.textContent = word.hanzi;
  elements.backPinyin.textContent = word.pinyin;
  
  // Displays: "to love (verb)"
  elements.backEnglish.textContent = word.type ? `${word.english} (${word.type})` : word.english;
  
  // Clean up example sentence formatting
  if (word.examples) {
    const formattedExample = word.examples.replace("~", "\n");
    elements.backExamples.textContent = formattedExample;
  } else {
    elements.backExamples.textContent = "No examples yet.";
  }

  elements.cardCounter.textContent = `${state.studyIndex + 1} / ${state.currentDeck.length}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.wordStatusBadge.textContent = getStatusLabel(word.status);
  elements.wordStatusBadge.className = `badge ${word.status}`;

  if (state.autoResetFlip) {
    elements.cardInner.classList.remove("flipped");
  }

  // Update Star button toggle state
  const starBtn = document.getElementById("starBtn");
  if (starBtn) {
    starBtn.textContent = word.starred ? "★" : "☆";
    starBtn.classList.toggle("active", Boolean(word.starred));
  }

  updateFrontModeButtons();
  renderWordList();
}
function renderWordList() {
  // Look for wordList or sessionWordList
  const container = document.getElementById("wordList") || document.getElementById("sessionWordList");
  if (!container) return;

  container.innerHTML = "";

  if (!state.currentDeck || state.currentDeck.length === 0) {
    container.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--muted);">
        No words match this filter. Try switching to <b>All words</b>!
      </div>
    `;
    return;
  }

  state.currentDeck.forEach((word, index) => {
    const isCurrent = index === state.studyIndex;
    const row = document.createElement("div");
    row.className = `word-row ${isCurrent ? "active" : ""}`;

    const statusText = typeof getStatusLabel === "function" ? getStatusLabel(word.status) : (word.status || "New");

    row.innerHTML = `
      <div class="word-row-top">
        <div class="flex items-center gap-2">
          <button class="list-star-btn ${word.starred ? "active" : ""}" data-word-id="${word.id}" type="button">
            ${word.starred ? "★" : "☆"}
          </button>
          <span class="word-hanzi">${word.hanzi || ""}</span>
        </div>
        <span class="badge ${word.status || "normal"}">${statusText}</span>
      </div>
      <div class="word-meta">
        <span>${word.pinyin || ""}</span> • <span>${word.english || ""}</span>
      </div>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".list-star-btn")) return;
      state.studyIndex = index;
      state.practiceCharIndex = 0; // 👈 Reset practice character index to 0
      renderStudy();
    });

    // Click star button in list -> Toggle star state
    const listStarBtn = row.querySelector(".list-star-btn");
    listStarBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      word.starred = !word.starred;
      persistProgress();
      renderStudy();
    });

    container.appendChild(row);
  });
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


function calculateNextReview(card, quality) {
  card.reviewCount = (card.reviewCount || 0) + 1;

  if (quality === 1) {
    // 1 = REVIEW AGAIN (Reset progress)
    card.interval = 1;
    card.consecutiveCorrect = 0;
    card.status = "review";
  } else if (quality === 3) {
    // 5 = MASTERED (Fully completed)
    card.consecutiveCorrect = (card.consecutiveCorrect || 0) + 1;
    card.interval = 30; // Jump ahead
    card.status = "mastered";
  }

  card.nextReview = Date.now() + card.interval * DAY_MS;
}


// 1. Standalone celebration function (Place this above applyRating)
function triggerCelebration() {
  if (typeof confetti === "function") {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

function applyRating(quality) {
  const word = currentWord();
  if (!word) return;

  // Save state before changing it so we can undo
  state.lastRatedCard = {
    wordId: word.id,
    previousStatus: word.status,
    previousInterval: word.interval,
    previousConsecutive: word.consecutiveCorrect,
    previousIndex: state.studyIndex
  };

  // --- GOAL TRACKING HOOK ---
  if (quality === 3 && (word.id || word.hanzi)) {
    trackWordMastered(word.id || word.hanzi);
  }

  // Record deck length BEFORE updating card status
  const previousDeckLength = state.currentDeck.length;

  calculateNextReview(word, quality);
  persistProgress();
  updateStreak();

  // Re-calculate deck (this removes the card if filtering by 'due', 'normal', etc.)
  updateStudyDeck();

  // FIX: If the deck shrunk (e.g. card left "Due" or "Normal" filter), 
  // do NOT increment studyIndex! The next card naturally slid into state.studyIndex.
  const deckShrank = state.currentDeck.length < previousDeckLength;

  if (!deckShrank) {
    if (state.studyIndex < state.currentDeck.length - 1) {
      state.studyIndex += 1;
    }
  }

  // Ensure index stays within bounds
  if (state.studyIndex >= state.currentDeck.length) {
    state.studyIndex = Math.max(0, state.currentDeck.length - 1);
  }

  renderLobby();

  // Check completion
  if (state.currentDeck.length === 0) {
    renderStudy();
    if (elements.completionCopy) {
      elements.completionCopy.textContent = `You finished ${getSetById(state.activeSetId)?.title || "this set"}. ${isSetUnlocked("hsk2") ? "HSK 2 is now unlocked." : "Keep mastering HSK 1 to unlock HSK 2."}`;
    }
    triggerCelebration(); // Confetti blast! 🎉
    openModal("completionModal");
  } else {
    renderStudy();
  }
}

function getStats() {
  const sets = rawSetsState();
  const allWords = sets.flatMap((set) => set.words);
  const totalWords = allWords.length;
  const masteredWords = allWords.filter((word) => word.status === "mastered").length;
  const reviewWords = allWords.filter((word) => word.status === "review").length;
  
  // Due now = New cards ("normal") + Review cards ("review")
  const newWords = allWords.filter((word) => word.status === "normal").length;
  const dueCount = reviewWords + newWords;

  return {
    totalWords,
    masteredWords,
    reviewWords,
    dueDisplay: dueCount > 0 ? dueCount : "No more due",
    hsk1Completion: Math.round(getHSK1Completion() * 100)
  };
}

function renderStats() {
  const stats = getStats();
  elements.statsGrid.innerHTML = "";

  [
    ["Total cards", stats.totalWords],
    ["Mastered", stats.masteredWords],
    ["Needs review", stats.reviewWords],
    ["Due now", stats.dueDisplay],
    ["HSK 1 complete", `${stats.hsk1Completion}%`]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-number">${value}</div><div class="muted">${label}</div>`;
    elements.statsGrid.appendChild(card);
  });
}

function loadStreakData() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.streak) || '{"days":[],"best":0}');
}

function saveStreakData(data) {
  localStorage.setItem(STORAGE_KEYS.streak, JSON.stringify(data));
}

function updateStreak() {
  const data = loadStreakData();
  const today = todayKey();

  if (!data.days.includes(today)) {
    data.days.push(today);
    data.days.sort();
  }

  let current = 1;
  let best = 1;
  for (let i = 1; i < data.days.length; i += 1) {
    const prev = new Date(data.days[i - 1]).getTime();
    const next = new Date(data.days[i]).getTime();
    const diff = Math.round((next - prev) / DAY_MS);
    current = diff === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  }

  data.best = Math.max(data.best || 0, best);
  saveStreakData(data);
}

function getCurrentStreak(data) {
  if (!data.days.length) return 0;
  let streak = 1;
  for (let i = data.days.length - 1; i > 0; i -= 1) {
    const curr = new Date(data.days[i]).getTime();
    const prev = new Date(data.days[i - 1]).getTime();
    const diff = Math.round((curr - prev) / DAY_MS);
    if (diff === 1) streak += 1;
    else break;
  }

  const last = new Date(data.days[data.days.length - 1]).getTime();
  const today = new Date(todayKey()).getTime();
  const daysSince = Math.round((today - last) / DAY_MS);
  return daysSince > 1 ? 0 : streak;
}

function renderStreak() {
  const data = loadStreakData();
  const streak = getCurrentStreak(data);
  elements.streakCount.textContent = String(streak);
  elements.streakBest.textContent = `Best streak: ${data.best || 0}`;
  elements.lastStudyDate.textContent = data.days.length ? `Last study day: ${data.days[data.days.length - 1]}` : "No session yet";

  elements.streakCalendar.innerHTML = "";
  const today = new Date(todayKey());

  for (let i = 27; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = todayKey(day.getTime());
    const block = document.createElement("div");
    block.className = `streak-day${data.days.includes(key) ? " done" : ""}`;
    block.innerHTML = `<strong>${day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong><span class="muted">${data.days.includes(key) ? "Studied" : "Rest"}</span>`;
    elements.streakCalendar.appendChild(block);
  }
}

function openInfo() {
  const word = currentWord();
  if (!word) return;
  const chars = [...word.hanzi.replace(/\s+/g, "")];
  elements.infoContainer.innerHTML = "";

  chars.forEach((char) => {
    const meta = radicals[char] || {
      rad: "N/A",
      radP: "-",
      radM: "Unknown radical",
      meaning: "Character",
      traditionalParts: "Unique form",
      traditional: char,
      etymology: "Add custom character notes later in js/data/radicals.js.",
      origin: "Unknown"
};

    const card = document.createElement("article");
    card.className = "info-card";
    card.innerHTML = `
      <div class="info-char">${char}</div>
      <div id="stroke-${char}-${Math.random().toString(36).slice(2, 8)}" class="practice-writer"></div>
      <p><strong>Traditional:</strong> ${meta.traditional}</p>
      <p><strong>Radical:</strong> ${meta.rad} (${meta.radP}) • ${meta.radM}</p>
      <p><strong>Meaning:</strong> ${meta.meaning}</p>
      <p><strong>Parts:</strong> ${meta.traditionalParts}</p>
      <p><strong>Etymology:</strong> ${meta.etymology}</p>
      <p class="muted">${meta.origin}</p>
    `;
    elements.infoContainer.appendChild(card);

    const target = card.querySelector(".practice-writer");
    setTimeout(() => {
      try {
        HanziWriter.create(target, char, {
          width: 240,
          height: 240,
          padding: 8,
          showOutline: true,
          showStroke: true
        }).animateCharacter();
      } catch (error) {
        console.error(error);
      }
    }, 30);
  });

  openModal("infoModal");
}

function openDraw() {
  const word = currentWord();
  if (!word || !word.hanzi) return;

  // Initialize character index if needed
  if (typeof state.practiceCharIndex !== "number") {
    state.practiceCharIndex = 0;
  }

  const chars = Array.from(word.hanzi);
  const targetChar = chars[state.practiceCharIndex] || chars[0];

  openModal("drawModal");

  // Reset drawing canvas
  resizeCanvas();
  clearCanvas();

  // 1. FIX: Render HanziWriter animation BIGGER (280px) & WHITE (#ffffff)
  const targetEl = document.getElementById("characterTarget") || elements.charRefDisplay;
  if (targetEl && window.HanziWriter) {
    targetEl.innerHTML = "";

    try {
      window.hanziWriterInstance = HanziWriter.create(targetEl, targetChar, {
        width: 280,
        height: 280,
        padding: 10,
        showOutline: true,
        showStroke: true,
        strokeColor: "#ffffff", // White character stroke
        outlineColor: "rgba(255, 255, 255, 0.2)"
      });
      window.hanziWriterInstance.animateCharacter();
    } catch (err) {
      console.error("HanziWriter initialization error:", err);
    }
  }

  // 2. FIX: Dynamically render controls below the animation
  renderPracticeControls(chars);
}

// Helper to render Replay, Prev Char, and Next Char buttons dynamically
function renderPracticeControls(chars) {
  const controlsEl = document.getElementById("strokeControls");
  if (!controlsEl) return;

  controlsEl.innerHTML = "";

  // Replay Button
  const replayBtn = document.createElement("button");
  replayBtn.className = "secondary-btn";
  replayBtn.textContent = "Replay Animation";
  replayBtn.addEventListener("click", replayCharacterAnimation);
  controlsEl.appendChild(replayBtn);

  // Prev / Next Character buttons (Only show if multi-character word)
  if (chars.length > 1) {
    const prevBtn = document.createElement("button");
    prevBtn.className = "secondary-btn";
    prevBtn.textContent = "← Prev Char";
    prevBtn.addEventListener("click", () => navigatePracticeChar(-1));

    const nextBtn = document.createElement("button");
    nextBtn.className = "secondary-btn";
    nextBtn.textContent = "Next Char →";
    nextBtn.addEventListener("click", () => navigatePracticeChar(1));

    controlsEl.appendChild(prevBtn);
    controlsEl.appendChild(nextBtn);
  }

  // Show / Hide "Show all characters" button based on word length
  const toggleAllCharsBtn = document.getElementById("toggleAllCharsBtn");
  if (toggleAllCharsBtn) {
    if (chars.length > 1) {
      toggleAllCharsBtn.style.display = "inline-flex";
      toggleAllCharsBtn.textContent = state.showingAllChars ? "Hide all characters" : "Show all characters";
    } else {
      toggleAllCharsBtn.style.display = "none";
      state.showingAllChars = false;
      const container = document.getElementById("allCharactersDisplay");
      if (container) container.innerHTML = "";
    }
  }
}

function replayCharacterAnimation() {
  if (window.hanziWriterInstance) {
    window.hanziWriterInstance.animateCharacter();
  }
}

function toggleAllCharacters() {
  const word = currentWord();
  if (!word || !word.hanzi) return;

  const chars = Array.from(word.hanzi);
  if (chars.length <= 1) return;

  state.showingAllChars = !state.showingAllChars;

  const toggleBtn = document.getElementById("toggleAllCharsBtn");
  if (toggleBtn) {
    toggleBtn.textContent = state.showingAllChars ? "Hide all characters" : "Show all characters";
  }

  const container = document.getElementById("allCharactersDisplay");
  if (!container) return;

  container.innerHTML = "";

  if (state.showingAllChars) {
    chars.forEach((char, index) => {
      const card = document.createElement("div");
      card.className = "practice-mini-card";
      card.innerHTML = `<p class="eyebrow">Character ${index + 1}: ${char}</p><div class="mini-writer"></div>`;
      container.appendChild(card);

      const target = card.querySelector(".mini-writer");
      try {
        HanziWriter.create(target, char, {
          width: 140,
          height: 140,
          padding: 8,
          showOutline: true,
          showStroke: true,
          strokeColor: "#ffffff",
          outlineColor: "rgba(255, 255, 255, 0.2)"
        }).animateCharacter();
      } catch (error) {
        console.error(error);
      }
    });
  }
}

function speakCurrent(text = currentWord()?.hanzi) {
  if (!text || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = state.speechSpeed;
  const voice = synth.getVoices().find((entry) => entry.lang === "zh-CN" || entry.lang === "zh-CN-x-ctr");
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    settings: {
      frontMode: state.frontMode,
      speechSpeed: state.speechSpeed,
      autoResetFlip: state.autoResetFlip,
      theme: state.theme,
      fontSize: state.fontSize
    },
    progress: JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || "{}"),
    streak: loadStreakData()
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hsk-progress-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data.progress) localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(data.progress));
      if (data.streak) localStorage.setItem(STORAGE_KEYS.streak, JSON.stringify(data.streak));
      if (data.settings) {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.settings));
      }
      initialize();
      openModal("statsModal");
      renderStats();
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function closeAllModals() {
  modals.forEach(closeModal);
}

function resizeCanvas() {
  const canvas = elements.canvas;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = Math.max(320, rect.height || 320);
  if (!canvasReady) setupCanvas();
}

function setupCanvas() {
  if (canvasReady) return;
  const canvas = elements.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function position(event) {
    const rect = canvas.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(event) {
    drawing = true;
    
    // Hide hint text when drawing starts
    const hint = document.querySelector(".canvas-hint");
    if (hint) hint.style.display = "none";

    const point = position(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function move(event) {
    if (!drawing) return;
    const point = position(event);
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = state.theme === "light" ? "#0f172a" : "#f8fafc";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stop() {
    if (drawing) {
      drawing = false;
      saveCanvasState(); // Save snapshot after each stroke for Z (undo)
    }
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", stop);
  canvas.addEventListener("mouseleave", stop);

  canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    start(event);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    move(event);
  }, { passive: false });
  canvas.addEventListener("touchend", stop);

  canvasReady = true;
}
// Global history array for canvas undo
let strokeHistory = [];

// Call this function whenever a stroke is drawn (e.g., in pointerup/mouseup/touchend)
function saveCanvasState() {
  if (!elements.canvas) return;
  const ctx = elements.canvas.getContext("2d");
  strokeHistory.push(ctx.getImageData(0, 0, elements.canvas.width, elements.canvas.height));
}

// Updated clearCanvas function
function clearCanvas() {
  const canvas = elements.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  strokeHistory = []; // Reset stroke history

  const hint = document.querySelector(".canvas-hint");
  if (hint) hint.style.display = "block";
}

// New undoCanvas function for strokes
function undoCanvas() {
  const canvas = elements.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (strokeHistory.length > 0) {
    strokeHistory.pop(); // Remove the most recent stroke
    if (strokeHistory.length > 0) {
      ctx.putImageData(strokeHistory[strokeHistory.length - 1], 0, 0);
    } else {
      clearCanvas();
    }
  } else {
    clearCanvas();
  }
}

function undoLastRating() {
  const word = currentWord();
  if (!word) return;

  // Reset the card currently visible on screen back to "new"
  word.status = "normal";
  word.interval = 1;
  word.consecutiveCorrect = 0;
  word.reviewCount = 0;
  word.nextReview = Date.now();

  // Clear last rated snapshot so history doesn't interfere
  state.lastRatedCard = null;

  persistProgress();
  renderLobby();
  renderStudy();
}

// Helper to navigate between characters of multi-char words (e.g., 爱好)
function navigatePracticeChar(direction) {
  const word = currentWord();
  if (!word || !word.hanzi) return;

  const chars = Array.from(word.hanzi); 
  if (chars.length <= 1) return; // Single character word -> do nothing

  if (typeof state.practiceCharIndex !== "number") {
    state.practiceCharIndex = 0;
  }

  const nextIndex = state.practiceCharIndex + direction;

  // Ensure index stays within word bounds
  if (nextIndex >= 0 && nextIndex < chars.length) {
    state.practiceCharIndex = nextIndex;
    clearCanvas(); // Clear drawing canvas for the new character
    
    // Refresh practice view for the new character
    if (typeof openDraw === "function") {
      openDraw();
    }
  }
}

// ==========================================
// CIRCULAR GOALS DIAL LOGIC ⭕
// ==========================================

class ArcSlider {
  constructor(config) {
    this.wrapper = document.getElementById(config.wrapperId);
    this.ticks = document.getElementById(config.ticksId);
    this.track = document.getElementById(config.trackId);
    this.progress = document.getElementById(config.progressId);
    this.handle = document.getElementById(config.handleId);
    this.valueDisplay = document.getElementById(config.valueId);
    this.tagDisplay = document.getElementById(config.tagId);

    this.min = config.min;
    this.max = config.max;
    this.step = config.step;
    this.val = config.initialValue;

    // 270-degree arc parameters
    this.startAngle = 135;
    this.totalAngle = 270;
    this.radius = 80;
    this.arcLength = (this.totalAngle / 360) * (2 * Math.PI * this.radius);

    // Continuous float percent for liquid-smooth visual movement
    this.smoothPercent = (this.val - this.min) / (this.max - this.min);

    this.setupTrackArcs();
    this.initEvents();
    this.updateUI();
  }

  setupTrackArcs() {
    const fullCircumference = 2 * Math.PI * this.radius;
    const outerRadius = 92;
    const outerArcLength = (this.totalAngle / 360) * (2 * Math.PI * outerRadius);
    const outerCircumference = 2 * Math.PI * outerRadius;

    // Cut-off outer ticks to 270 degrees
    if (this.ticks) {
      this.ticks.style.strokeDasharray = `${outerArcLength} ${outerCircumference}`;
      this.ticks.style.transformOrigin = "center";
      this.ticks.style.transform = `rotate(${this.startAngle}deg)`;
    }

    // Cut-off track & progress arc
    this.track.style.strokeDasharray = `${this.arcLength} ${fullCircumference}`;
    this.track.style.transformOrigin = "center";
    this.track.style.transform = `rotate(${this.startAngle}deg)`;

    this.progress.style.strokeDasharray = `${this.arcLength} ${fullCircumference}`;
    this.progress.style.transformOrigin = "center";
    this.progress.style.transform = `rotate(${this.startAngle}deg)`;
  }

  getIntensityTag(percent) {
    if (percent <= 0.25) return "Light";
    if (percent <= 0.60) return "Moderate";
    if (percent <= 0.85) return "Intense";
    return "Heroic";
  }

  initEvents() {
    const onMove = (e) => {
      if (!this.isDragging) return;
      const rect = this.wrapper.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.width / 2;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      let relAngle = angle - this.startAngle;
      if (relAngle < 0) relAngle += 360;

      if (relAngle > this.totalAngle) {
        relAngle = relAngle - this.totalAngle < 45 ? this.totalAngle : 0;
      }

      // Smooth un-rounded percent for visual fluidity
      this.smoothPercent = Math.max(0, Math.min(1, relAngle / this.totalAngle));

      // Discrete value for integer counting
      const rawVal = this.min + this.smoothPercent * (this.max - this.min);
      this.val = Math.round(rawVal / this.step) * this.step;

      this.updateUI();
    };

    const onStart = (e) => {
      this.isDragging = true;
      onMove(e);
    };

    const onEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        // Snap smooth percent to exact integer position when drag releases
        this.smoothPercent = (this.val - this.min) / (this.max - this.min);
        this.updateUI();
      }
    };

    this.wrapper.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    this.wrapper.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  }

  updateUI() {
    // Fill offset along arc using smooth percent
    const offset = this.arcLength - (this.smoothPercent * this.arcLength);
    this.progress.style.strokeDashoffset = offset;

    // Fluid knob handle placement
    const currentAngleDeg = this.startAngle + (this.smoothPercent * this.totalAngle);
    const angleRad = currentAngleDeg * (Math.PI / 180);

    const cx = 100 + this.radius * Math.cos(angleRad);
    const cy = 100 + this.radius * Math.sin(angleRad);

    this.handle.setAttribute("cx", cx);
    this.handle.setAttribute("cy", cy);

    if (this.valueDisplay) this.valueDisplay.textContent = this.val;
    if (this.tagDisplay) this.tagDisplay.textContent = this.getIntensityTag(this.smoothPercent);
  }
}

let timeSlider, wordsSlider;



wordsSlider = new ArcSlider({
  wrapperId: "wordsRadial",
  ticksId: "wordsTicks",
  trackId: "wordsTrack",
  progressId: "wordsProgress",
  handleId: "wordsHandle",
  valueId: "wordsVal",
  tagId: "wordsTag",
  min: 1,
  max: 40,
  step: 1,
  initialValue: Math.min(state.goals.words || 20, 40)
}); 


function bindEvents() {
  // --- Navigation & Headers ---
  document.getElementById("goHomeBtn")?.addEventListener("click", showLobby);
  document.getElementById("openSettingsBtn")?.addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("floatingSettingsBtn")?.addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("openStatsBtn")?.addEventListener("click", () => {
    renderStats();
    openModal("statsModal");
  });
  document.getElementById("studyStatsBtn")?.addEventListener("click", () => {
    renderStats();
    openModal("statsModal");
  });
  document.getElementById("openStreakBtn")?.addEventListener("click", () => {
    renderStreak();
    openModal("streakModal");
  });
  document.getElementById("openStreakBtnLobby")?.addEventListener("click", () => {
    renderStreak();
    openModal("streakModal");
  }); 

  // --- Goals Modal Listeners ---
  document.getElementById("openGoalsBtn")?.addEventListener("click", () => {
    openModal("goalsModal");
    if (!timeSlider) initGoalSliders();
  });

  // Save Goals Listener (Triggers Two-Step Popup)
  const saveBtn = document.getElementById("saveGoalsBtn");
  if (saveBtn) {
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener("click", () => {
      const newTime = timeSlider ? timeSlider.val : (state.goals?.time || 15);
      const newWords = wordsSlider ? wordsSlider.val : (state.goals?.words || 20);

      // Store selection temporarily
      pendingGoalSelection = {
        time: newTime,
        words: newWords
      };

      closeModal("goalsModal");
      openModal("goalResetConfirmModal"); // 👈 Opens the second confirmation modal!
    });
  }

  // --- Flashcard Controls ---
  document.getElementById("prevBtn")?.addEventListener("click", () => {
    if (state.studyIndex > 0) {
      state.studyIndex -= 1;
      state.practiceCharIndex = 0; // 👈 Reset practice character index to 0
      renderStudy();
    }
  });

  document.getElementById("nextBtn")?.addEventListener("click", () => {
    if (state.studyIndex < state.currentDeck.length - 1) {
      state.studyIndex += 1;
      state.practiceCharIndex = 0; // 👈 Reset practice character index to 0
      renderStudy();
    }
  });
  document.getElementById("flipFrontBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.cardInner.classList.add("flipped");
  });
  document.getElementById("flashcard")?.addEventListener("click", () => {
    elements.cardInner.classList.toggle("flipped");
  });
  document.getElementById("speakBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    speakCurrent();
  });
  document.getElementById("infoBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openInfo();
  });
  document.getElementById("practiceBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openDraw();
  });
  document.getElementById("undoBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    undoLastRating();
  });

  document.getElementById("toggleShuffleBtn")?.addEventListener("click", () => {
    state.isShuffled = !state.isShuffled;
    elements.toggleShuffleBtn.textContent = state.isShuffled ? "Shuffle On" : "Shuffle Off";
    renderStudy();
  });

  document.getElementById("starBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const word = currentWord();
    if (!word) return;
    
    word.starred = !word.starred;
    persistProgress();
    renderStudy();
  });

  document.querySelectorAll("[data-front]").forEach((button) => {
    button.addEventListener("click", () => {
      state.frontMode = button.dataset.front;
      saveSettings();
      renderStudy();
    });
  });

  document.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      applyRating(Number(button.dataset.rating));
    });
  });

  // --- Modals & Close Handlers ---
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  // 👇 NEXT SET BUTTON (PLACED HERE)
  document.getElementById("nextSetBtn")?.addEventListener("click", () => {
    closeAllModals();

    const sets = rawSetsState();
    const currentIndex = sets.findIndex((s) => s.id === state.activeSetId);

    // Find the next unlocked set
    if (currentIndex !== -1 && currentIndex < sets.length - 1) {
      const nextSet = sets[currentIndex + 1];
      if (!nextSet.locked) {
        state.activeSetId = nextSet.id;
        state.studyIndex = 0;
        state.activeFilter = "all";
        renderStudy();
        return;
      }
    }

    // Fallback to lobby if no next set is unlocked
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("lobbyScreen")?.classList.add("active");
    renderLobby();
  });

  // --- Settings Inputs ---
  document.getElementById("exportBtn")?.addEventListener("click", exportProgress);
  elements.importFile?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importProgress(file);
  });
  elements.themeSelect?.addEventListener("change", () => {
    state.theme = elements.themeSelect.value;
    elements.body.dataset.theme = state.theme;
    saveSettings();
  });
  elements.fontSizeRange?.addEventListener("input", () => {
    state.fontSize = Number(elements.fontSizeRange.value);
    document.documentElement.style.fontSize = `${state.fontSize}px`;
    saveSettings();
  });
  elements.defaultFrontSelect?.addEventListener("change", () => {
    state.frontMode = elements.defaultFrontSelect.value;
    saveSettings();
    renderStudy();
  });
  elements.speechSpeedRange?.addEventListener("input", () => {
    state.speechSpeed = Number(elements.speechSpeedRange.value);
    saveSettings();
  });
  elements.autoResetFlipToggle?.addEventListener("change", () => {
    state.autoResetFlip = elements.autoResetFlipToggle.checked;
    saveSettings();
  });

  // --- Canvas Practice ---
  document.getElementById("clearCanvasBtn")?.addEventListener("click", clearCanvas);
  document.getElementById("toggleAllCharsBtn")?.addEventListener("click", toggleAllCharacters);
  window.addEventListener("resize", resizeCanvas);

  // --- Keyboard Shortcuts ---
  document.addEventListener("keydown", (event) => {
    if (["input", "textarea"].includes(document.activeElement?.tagName?.toLowerCase())) return;

    const drawModal = document.getElementById("drawModal");
    const isDrawOpen = drawModal && !drawModal.classList.contains("hidden");
    const isStudying = elements.studyScreen?.classList.contains("active");

    if (isDrawOpen) {
      const key = event.key.toLowerCase();

      // 1. Clear Canvas (C)
      if (key === "c") {
        event.preventDefault();
        clearCanvas();
      }

      // 2. Undo Last Stroke (Z)
      if (key === "z") {
        event.preventDefault();
        undoCanvas();
      }

      // 3. Replay Animation (R)
      if (key === "r") {
        event.preventDefault();
        replayCharacterAnimation();
      }

      // 4. Navigate Multi-character words (← / →) inside popup
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePracticeChar(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePracticeChar(1);
      }

      if (event.key === "Escape") closeAllModals();
      return; // Prevents background card switching while drawing modal is open
    }

    // ==========================================
    // B. MAIN FLASHCARD STUDY SHORTCUTS 🃏
    // ==========================================

    // Flip Card (Space)
    if (event.key === " " && isStudying) {
      event.preventDefault();
      elements.cardInner.classList.toggle("flipped");
    }

    // Prev / Next Card Navigation (← / →)
    if (event.key === "ArrowLeft" && isStudying && state.studyIndex > 0) {
      state.studyIndex -= 1;
      state.practiceCharIndex = 0; // Reset practice char index for new card
      renderStudy();
    }
    if (event.key === "ArrowRight" && isStudying && state.studyIndex < state.currentDeck.length - 1) {
      state.studyIndex += 1;
      state.practiceCharIndex = 0; // Reset practice char index for new card
      renderStudy();
    }

    // Ratings (1 = Review again, 2 = Mastered)
    if (["1", "2"].includes(event.key) && isStudying) {
      const ratingMap = { "1": 1, "2": 3 };
      applyRating(ratingMap[event.key]);
    }

    // Toggle Star (3)
    if (event.key === "3" && isStudying) {
      const word = currentWord();
      if (word) {
        word.starred = !word.starred;
        persistProgress();
        renderStudy();
      }
    }

    // Undo Rating (Z on study screen)
    if (event.key.toLowerCase() === "z" && isStudying) {
      undoLastRating();
    }

    // Global Modal Shortcuts
    if (event.key.toLowerCase() === "s") openModal("settingsModal");
    if (event.key === "Escape") closeAllModals();
  });

  // --- Dropdowns & Filters ---
  const dropdownBtn = document.getElementById("reviewDropdownBtn");
  const dropdownMenu = document.getElementById("reviewDropdownMenu");
  const dropdownLabel = document.getElementById("dropdownLabel");

  dropdownBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdownMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    dropdownMenu?.classList.add("hidden");
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedFilter = button.dataset.filter;
      state.activeFilter = selectedFilter;

      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      const isDropdownOption = ["review", "mastered", "normal"].includes(selectedFilter);
      if (isDropdownOption) {
        dropdownBtn?.classList.add("active");
        if (dropdownLabel) dropdownLabel.textContent = button.textContent;
      } else {
        dropdownBtn?.classList.remove("active");
        if (dropdownLabel) dropdownLabel.textContent = "Review";
      }

      dropdownMenu?.classList.add("hidden");
      state.studyIndex = 0;
      renderStudy();
    });
  });
}


document.addEventListener("DOMContentLoaded", () => {
  const intro = document.getElementById("introBanner");
  const closeBtn = document.getElementById("closeIntro");

  if (closeBtn && intro) {
    closeBtn.addEventListener("click", () => {
      intro.style.display = "none";
    });
  }
});





// Local timezone date helper (Format: YYYY-MM-DD)
function getLocalDateKey(ts = Date.now()) {
  return new Date(ts).toLocaleDateString("en-CA");
}

function todayKey(ts = Date.now()) {
  return getLocalDateKey(ts);
}

// 1. Daily Tracking State Initialization (Resets at local 00:00)
function loadDailyProgress() {
  const progressTodayKey = getLocalDateKey();
  const saved = localStorage.getItem("hsk_daily_progress");

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Keeps progress if it belongs to TODAY in the user's local timezone
      if (parsed && parsed.date === progressTodayKey) {
        state.dailyProgress = parsed;
        return;
      }
    } catch (e) {
      console.error("Error reading saved daily progress", e);
    }
  }

  // Resets daily stats & goals clean at local midnight
  state.dailyProgress = {
    date: progressTodayKey,
    secondsStudied: 0,
    wordsMasteredToday: [],
    timeGoalHit: false,
    wordsGoalHit: false
  };
  saveDailyProgress();
}

let studyTimerInterval = null;

// 2. Timer Control Functions
function startStudyTimer() {
  if (studyTimerInterval) return;
  studyTimerInterval = setInterval(() => {
    state.dailyProgress.secondsStudied += 1;
    saveDailyProgress();
    checkGoalMilestones();
  }, 1000);
}

function stopStudyTimer() {
  if (studyTimerInterval) {
    clearInterval(studyTimerInterval);
    studyTimerInterval = null;
  }
}

function saveDailyProgress() {
  localStorage.setItem("hsk_daily_progress", JSON.stringify(state.dailyProgress));
}

// 3. Track Words Mastered (Call this inside your Flashcard "Mastered" button handler)
function trackWordMastered(wordId) {
  if (!state.dailyProgress.wordsMasteredToday.includes(wordId)) {
    state.dailyProgress.wordsMasteredToday.push(wordId);
    saveDailyProgress();
    checkGoalMilestones();
  }
}

// 4. Milestone Check & Popup Trigger
function checkGoalMilestones() {
  const timeGoalMins = state.goals?.time || 15;
  const wordsGoalCount = state.goals?.words || 20;

  const currentMins = Math.floor(state.dailyProgress.secondsStudied / 60);
  const currentWords = state.dailyProgress.wordsMasteredToday.length;

  // Check Time Goal
  if (currentMins >= timeGoalMins && !state.dailyProgress.timeGoalHit) {
    state.dailyProgress.timeGoalHit = true;
    saveDailyProgress();
    triggerGoalCelebration("time", timeGoalMins);
    updateDashboardBanner();
  }

  // Check Words Goal
  if (currentWords >= wordsGoalCount && !state.dailyProgress.wordsGoalHit) {
    state.dailyProgress.wordsGoalHit = true;
    saveDailyProgress();
    triggerGoalCelebration("words", wordsGoalCount);
    updateDashboardBanner();
  }
}

function reevaluateDailyGoals() {
  if (!state.dailyProgress || !state.goals) return;

  const timeGoalMins = state.goals.time || 15;
  const wordsGoalCount = state.goals.words || 20;

  const currentMins = Math.floor((state.dailyProgress.secondsStudied || 0) / 60);
  const currentWords = state.dailyProgress.wordsMasteredToday?.length || 0;

  // Mark hit flags as true if targets are met, without popping up the modal
  if (currentMins >= timeGoalMins) {
    state.dailyProgress.timeGoalHit = true;
  }
  if (currentWords >= wordsGoalCount) {
    state.dailyProgress.wordsGoalHit = true;
  }

  saveDailyProgress();
}

// 5. Celebration Modal Handler
function triggerGoalCelebration(type, targetVal) {
  stopStudyTimer(); // Pause timer while popup is open

  const titleEl = document.getElementById("celebrationTitle");
  const msgEl = document.getElementById("celebrationMessage");

  if (type === "time") {
    titleEl.textContent = "Time Goal Completed!";
    msgEl.textContent = `Well done! You've studied for ${targetVal} minutes today. You can keep studying if you want.`;
  } else {
    titleEl.textContent = "Word Target Achieved!";
    msgEl.textContent = `Awesome job! You mastered ${targetVal} words today. You can keep studying if you want.`;
  }

  openModal("goalCelebrationModal");
}

// 6. Update Banner on Dashboard
function updateDashboardBanner() {
  const banner = document.getElementById("goalCompletionBanner");
  const bannerTitle = document.getElementById("goalBannerTitle");
  const bannerText = document.getElementById("goalBannerText");

  const timeHit = state.dailyProgress.timeGoalHit;
  const wordsHit = state.dailyProgress.wordsGoalHit;

  if (!timeHit && !wordsHit) {
    banner?.classList.add("hidden");
    return;
  }

  banner?.classList.remove("hidden");

  if (timeHit && wordsHit) {
    bannerTitle.textContent = "All Daily Goals Completed! 🔥";
    bannerText.textContent = "You completed both your study time and word targets for today! Feel free to keep studying.";
  } else if (timeHit) {
    bannerTitle.textContent = "Time Goal Completed! 🔥";
    bannerText.textContent = "You reached your daily study time goal. You can keep studying if you want.";
  } else if (wordsHit) {
    bannerTitle.textContent = "Word Target Completed! 🔥";
    bannerText.textContent = "You reached your daily mastered words goal. You can keep studying if you want.";
  }
}

// Variable to store temporary slider selection before confirmation modal choice
let pendingGoalSelection = null;

// --- 1. Dashboard Navigation Helper ---
function goToDashboard() {
  closeAllModals();
  stopStudyTimer();

  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const lobby = document.getElementById("lobbyScreen");
  if (lobby) lobby.classList.add("active");

  updateDashboardBanner();
  updateGoalsButtonText();
}

// --- 2. Dynamic Goals / Reset Goal Button Label ---
function updateGoalsButtonText() {
  const btn = document.getElementById("openGoalsBtn");
  if (!btn) return;

  const timeHit = state.dailyProgress?.timeGoalHit;
  const wordsHit = state.dailyProgress?.wordsGoalHit;

  if (timeHit || wordsHit) {
    btn.textContent = "Reset Goal";
  } else {
    btn.textContent = "Goals";
  }
}

// --- 3. Goal Sliders Initializer (Locks Minimum to Completed Floor) ---
function initGoalSliders() {
  // Always reload goals from storage first before rendering sliders
  loadGoals();

  const timeHit = state.dailyProgress?.timeGoalHit;
  const wordsHit = state.dailyProgress?.wordsGoalHit;

  const currentMins = Math.floor((state.dailyProgress?.secondsStudied || 0) / 60);
  const currentWords = state.dailyProgress?.wordsMasteredToday?.length || 0;

  const timeMin = timeHit ? Math.max(currentMins, state.goals?.time || 1) : 1;
  const wordsMin = wordsHit ? Math.max(currentWords, state.goals?.words || 1) : 1;

  timeSlider = new ArcSlider({
    wrapperId: "timeRadial",
    ticksId: "timeTicks",
    trackId: "timeTrack",
    progressId: "timeProgress",
    handleId: "timeHandle",
    valueId: "timeVal",
    tagId: "timeTag",
    min: timeMin,
    max: 60,
    step: 1,
    initialValue: state.goals?.time || 15 // 👈 Pulls exact saved goal
  });

  wordsSlider = new ArcSlider({
    wrapperId: "wordsRadial",
    ticksId: "wordsTicks",
    trackId: "wordsTrack",
    progressId: "wordsProgress",
    handleId: "wordsHandle",
    valueId: "wordsVal",
    tagId: "wordsTag",
    min: wordsMin,
    max: 40,
    step: 1,
    initialValue: state.goals?.words || 20 // 👈 Pulls exact saved goal
  });
}
// --- 4. Event Listeners ---
function bindGoalSystemEvents() {
  // Celebration Modal Buttons
  document.getElementById("celebrationDashboardBtn")?.addEventListener("click", () => {
    closeModal("goalCelebrationModal");
    goToDashboard();
  });

  document.getElementById("celebrationContinueBtn")?.addEventListener("click", () => {
    closeModal("goalCelebrationModal");
    startStudyTimer();
  });

  // Open Goals Modal (Loads fresh sliders with limits)
  document.getElementById("openGoalsBtn")?.addEventListener("click", () => {
    openModal("goalsModal");
    initGoalSliders();
  });

  // Save Goals -> Opens Second Confirmation Modal (with Event Listener Reset)
  const saveBtn = document.getElementById("saveGoalsBtn");
  if (saveBtn) {
    // Replace element to purge old event listeners that might bypass the modal
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener("click", () => {
      const newTime = typeof timeSlider !== "undefined" && timeSlider ? timeSlider.val : (state.goals?.time || 15);
      const newWords = typeof wordsSlider !== "undefined" && wordsSlider ? wordsSlider.val : (state.goals?.words || 20);

      pendingGoalSelection = {
        time: newTime,
        words: newWords
      };

      closeModal("goalsModal");
      openModal("goalResetConfirmModal");
    });
  }

  // Choice 1: Reset Just for Today
  document.getElementById("resetTodayOnlyBtn")?.addEventListener("click", () => {
    if (pendingGoalSelection) {
      state.goals = { ...pendingGoalSelection };
      
      // Reset daily completion flags so higher targets can trigger celebrations again
      if (state.dailyProgress) {
        state.dailyProgress.timeGoalHit = false;
        state.dailyProgress.wordsGoalHit = false;
        saveDailyProgress();
      }
    }
    closeModal("goalResetConfirmModal");
    updateDashboardBanner();
    updateGoalsButtonText();
  });

  // Choice 2: Change Goal Forever
  document.getElementById("resetForeverBtn")?.addEventListener("click", () => {
    if (pendingGoalSelection) {
      state.goals = { ...pendingGoalSelection };
      
      // Save permanently across page reloads
      localStorage.setItem("hsk_goals_v2", JSON.stringify(state.goals));

      if (state.dailyProgress) {
        state.dailyProgress.timeGoalHit = false;
        state.dailyProgress.wordsGoalHit = false;
        saveDailyProgress();
      }
    }
    closeModal("goalResetConfirmModal");
    updateDashboardBanner();
    updateGoalsButtonText();
  });

  // Refresh UI states on load
  updateDashboardBanner();
  updateGoalsButtonText();
}

function initialize() {
  setRawSetsState(hydrateSets());
  loadSettings();
  loadGoals();          // 1. Load saved targets (e.g. 5 mins / 10 words)
  loadDailyProgress(); // 2. Load today's progress safely (checks date stamp)

  // 3. Re-check progress state silently so banner & button stay active
  reevaluateDailyGoals();

  renderLobby();
  renderStats();
  renderStreak();
  if (state.activeSetId) renderStudy();

  // 4. Bind events & sync UI
  bindGoalSystemEvents();
}

bindEvents();
initialize();
