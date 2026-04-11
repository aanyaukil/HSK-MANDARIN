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
  fontSize: 16
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

const modals = ["settingsModal", "statsModal", "streakModal", "infoModal", "drawModal", "completionModal"];

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

function buildCard(word, setId) {
  return {
    id: `${setId}:${word[0]}`,
    setId,
    hanzi: word[0],
    pinyin: word[1],
    english: word[2],
    examples: word[3] || "",
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

    const card = document.createElement("article");
    card.className = `set-card${unlocked ? "" : " locked"}`;
    card.innerHTML = `
      <div class="set-card-top">
        <div>
          <p class="eyebrow">${set.level}</p>
          <h3 class="set-title">${set.title}</h3>
        </div>
        <span class="pill">${unlocked ? "Unlocked" : "Locked"}</span>
      </div>
      <p class="set-note">${set.description}</p>
      <div class="set-card-bottom">
        <div class="muted">${set.words.length} words</div>
        <div class="muted">${completion}% mastered</div>
      </div>
      <div class="progress-rail">
        <div class="progress-fill" style="width:${completion}%"></div>
      </div>
      <button class="${unlocked ? "primary-btn" : "secondary-btn"}">${unlocked ? "Start set" : "Finish HSK 1 first"}</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
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

  if (state.activeFilter === "review") {
    deck = deck.filter((word) => word.status === "review");
  } else if (state.activeFilter === "due") {
    deck = deck.filter((word) => word.nextReview <= now || word.status === "review");
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
  const hintMap = {
    hanzi: "Tap to reveal pinyin, translation, and examples",
    pinyin: word.hanzi,
    english: word.hanzi
  };

  elements.frontDisplay.textContent = frontMap[state.frontMode];
  elements.frontHint.textContent = hintMap[state.frontMode];
  elements.backHanzi.textContent = word.hanzi;
  elements.backPinyin.textContent = word.pinyin;
  elements.backEnglish.textContent = word.english;
  elements.backExamples.textContent = word.examples || "No examples yet.";
  elements.cardCounter.textContent = `${state.studyIndex + 1} / ${state.currentDeck.length}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.wordStatusBadge.textContent = getStatusLabel(word.status);
  elements.wordStatusBadge.className = `badge ${word.status}`;

  if (state.autoResetFlip) {
    elements.cardInner.classList.remove("flipped");
  }

  updateFrontModeButtons();
  renderWordList();
}

function renderWordList() {
  elements.wordList.innerHTML = "";

  state.currentDeck.forEach((word, index) => {
    const row = document.createElement("button");
    row.className = `word-row${index === state.studyIndex ? " active" : ""}`;
    row.innerHTML = `
      <div class="word-row-top">
        <div>
          <div class="word-hanzi">${word.hanzi}</div>
          <div class="word-meta">${word.pinyin} • ${word.english}</div>
        </div>
        <span class="badge ${word.status}">${getStatusLabel(word.status)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      state.studyIndex = index;
      renderStudy();
    });
    elements.wordList.appendChild(row);
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

  if (quality < 2) {
    card.interval = 1;
    card.consecutiveCorrect = 0;
    card.status = "review";
  } else {
    card.consecutiveCorrect = (card.consecutiveCorrect || 0) + 1;
    if (card.consecutiveCorrect === 1) card.interval = 1;
    else if (card.consecutiveCorrect === 2) card.interval = 3;
    else card.interval = Math.max(4, Math.round(card.interval * card.ease));

    card.status = quality >= 4 ? "mastered" : "normal";
  }

  card.ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  card.nextReview = Date.now() + card.interval * DAY_MS;
}

function applyRating(quality) {
  const word = currentWord();
  if (!word) return;

  calculateNextReview(word, quality);
  persistProgress();
  updateStreak();
  renderLobby();

  if (state.studyIndex < state.currentDeck.length - 1) {
    state.studyIndex += 1;
    renderStudy();
  } else {
    renderStudy();
    elements.completionCopy.textContent = `You finished ${getSetById(state.activeSetId)?.title || "this set"}. ${isSetUnlocked("hsk2") ? "HSK 2 is now unlocked." : "Keep mastering HSK 1 to unlock HSK 2."}`;
    openModal("completionModal");
  }
}

function getStats() {
  const sets = rawSetsState();
  const allWords = sets.flatMap((set) => set.words);
  const totalWords = allWords.length;
  const masteredWords = allWords.filter((word) => word.status === "mastered").length;
  const reviewWords = allWords.filter((word) => word.status === "review").length;
  const dueToday = allWords.filter((word) => word.nextReview <= Date.now()).length;

  return {
    totalWords,
    masteredWords,
    reviewWords,
    dueToday,
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
    ["Due now", stats.dueToday],
    ["HSK 1 complete", `${stats.hsk1Completion}%`]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-number">${value}</div><div class="muted">${label}</div>`;
    elements.statsGrid.appendChild(card);
  });
}

function todayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
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
    const meta = radicalData[char] || {
      rad: "N/A",
      radP: "-",
      radM: "Unknown radical",
      meaning: "Character",
      parts: "Unique form",
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
      <p><strong>Parts:</strong> ${meta.parts}</p>
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
  if (!word) return;

  state.drawingWord = word.hanzi;
  state.drawingCharIndex = 0;
  state.showingAllChars = false;
  elements.allCharactersDisplay.innerHTML = "";
  elements.drawTitle.textContent = `Stroke practice • ${word.hanzi}`;
  openModal("drawModal");
  setTimeout(() => {
    resizeCanvas();
    clearCanvas();
    renderDrawingCharacter();
  }, 50);
}

function renderDrawingCharacter() {
  elements.charRefDisplay.innerHTML = "";
  const target = document.createElement("div");
  target.style.width = "100%";
  target.style.height = "100%";
  elements.charRefDisplay.appendChild(target);
  const char = state.drawingWord[state.drawingCharIndex];

  try {
    strokeWriter = HanziWriter.create(target, char, {
      width: Math.max(280, elements.charRefDisplay.clientWidth),
      height: 320,
      padding: 10,
      showOutline: true,
      showStroke: true
    });
    strokeWriter.animateCharacter();
  } catch (error) {
    console.error(error);
  }

  elements.strokeControls.innerHTML = "";
  [
    ["Replay", () => strokeWriter?.animateCharacter()],
    ["Reset", () => strokeWriter?.reset()],
    ...(state.drawingWord.length > 1 ? [
      ["Prev char", () => {
        state.drawingCharIndex = (state.drawingCharIndex - 1 + state.drawingWord.length) % state.drawingWord.length;
        renderDrawingCharacter();
      }],
      ["Next char", () => {
        state.drawingCharIndex = (state.drawingCharIndex + 1) % state.drawingWord.length;
        renderDrawingCharacter();
      }]
    ] : [])
  ].forEach(([label, handler]) => {
    const button = document.createElement("button");
    button.className = "secondary-btn";
    button.textContent = label;
    button.addEventListener("click", handler);
    elements.strokeControls.appendChild(button);
  });
}

function toggleAllCharacters() {
  if (state.drawingWord.length <= 1) return;
  state.showingAllChars = !state.showingAllChars;
  document.getElementById("toggleAllCharsBtn").textContent = state.showingAllChars ? "Hide all characters" : "Show all characters";

  if (!state.showingAllChars) {
    elements.allCharactersDisplay.innerHTML = "";
    return;
  }

  elements.allCharactersDisplay.innerHTML = "";
  [...state.drawingWord].forEach((char, index) => {
    const card = document.createElement("div");
    card.className = "practice-mini-card";
    card.innerHTML = `<p class="eyebrow">Character ${index + 1}</p><div class="practice-writer"></div>`;
    elements.allCharactersDisplay.appendChild(card);
    const target = card.querySelector(".practice-writer");
    try {
      HanziWriter.create(target, char, {
        width: 220,
        height: 220,
        padding: 8,
        showOutline: true,
        showStroke: true
      }).animateCharacter();
    } catch (error) {
      console.error(error);
    }
  });
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
    const point = position(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function move(event) {
    if (!drawing) return;
    const point = position(event);
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = state.theme === "light" ? "#0f172a" : "#f8fafc";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    start(event);
  }, { passive: false });
  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    move(event);
  }, { passive: false });
  window.addEventListener("mouseup", () => {
    drawing = false;
  });
  window.addEventListener("touchend", () => {
    drawing = false;
  });

  canvasReady = true;
}

function clearCanvas() {
  const ctx = elements.canvas.getContext("2d");
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function bindEvents() {
  document.getElementById("goHomeBtn").addEventListener("click", showLobby);
  document.getElementById("openSettingsBtn").addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("floatingSettingsBtn").addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("openStatsBtn").addEventListener("click", () => {
    renderStats();
    openModal("statsModal");
  });
  document.getElementById("studyStatsBtn").addEventListener("click", () => {
    renderStats();
    openModal("statsModal");
  });
  document.getElementById("openStreakBtn").addEventListener("click", () => {
    renderStreak();
    openModal("streakModal");
  });
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (state.studyIndex > 0) {
      state.studyIndex -= 1;
      renderStudy();
    }
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (state.studyIndex < state.currentDeck.length - 1) {
      state.studyIndex += 1;
      renderStudy();
    }
  });
  document.getElementById("flipFrontBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    elements.cardInner.classList.add("flipped");
  });
  document.getElementById("flashcard").addEventListener("click", () => {
    elements.cardInner.classList.toggle("flipped");
  });
  document.getElementById("speakBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    speakCurrent();
  });
  document.getElementById("infoBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    openInfo();
  });
  document.getElementById("practiceBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    openDraw();
  });
  document.getElementById("toggleShuffleBtn").addEventListener("click", () => {
    state.isShuffled = !state.isShuffled;
    elements.toggleShuffleBtn.textContent = state.isShuffled ? "Shuffle On" : "Shuffle Off";
    renderStudy();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.studyIndex = 0;
      renderStudy();
    });
  });
  document.querySelectorAll("[data-front]").forEach((button) => {
    button.addEventListener("click", () => {
      state.frontMode = button.dataset.front;
      saveSettings();
      renderStudy();
    });
  });
  document.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", () => applyRating(Number(button.dataset.rating)));
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
  document.getElementById("reviewAgainBtn").addEventListener("click", () => {
    closeModal("completionModal");
    state.activeFilter = "due";
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item.dataset.filter === "due"));
    state.studyIndex = 0;
    renderStudy();
  });
  document.getElementById("exportBtn").addEventListener("click", exportProgress);
  elements.importFile.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importProgress(file);
  });
  elements.themeSelect.addEventListener("change", () => {
    state.theme = elements.themeSelect.value;
    elements.body.dataset.theme = state.theme;
    saveSettings();
  });
  elements.fontSizeRange.addEventListener("input", () => {
    state.fontSize = Number(elements.fontSizeRange.value);
    document.documentElement.style.fontSize = `${state.fontSize}px`;
    saveSettings();
  });
  elements.defaultFrontSelect.addEventListener("change", () => {
    state.frontMode = elements.defaultFrontSelect.value;
    saveSettings();
    renderStudy();
  });
  elements.speechSpeedRange.addEventListener("input", () => {
    state.speechSpeed = Number(elements.speechSpeedRange.value);
    saveSettings();
  });
  elements.autoResetFlipToggle.addEventListener("change", () => {
    state.autoResetFlip = elements.autoResetFlipToggle.checked;
    saveSettings();
  });
  document.getElementById("clearCanvasBtn").addEventListener("click", clearCanvas);
  document.getElementById("toggleAllCharsBtn").addEventListener("click", toggleAllCharacters);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("keydown", (event) => {
    if (event.key === " ") {
      event.preventDefault();
      elements.cardInner.classList.toggle("flipped");
    }
    if (event.key === "ArrowLeft" && state.studyIndex > 0) {
      state.studyIndex -= 1;
      renderStudy();
    }
    if (event.key === "ArrowRight" && state.studyIndex < state.currentDeck.length - 1) {
      state.studyIndex += 1;
      renderStudy();
    }
    if (["1", "2", "3", "4"].includes(event.key) && state.studyScreen.classList.contains("active")) {
      applyRating(Number(event.key));
    }
    if (event.key.toLowerCase() === "s") {
      openModal("settingsModal");
    }
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
}

function initialize() {
  setRawSetsState(hydrateSets());
  loadSettings();
  renderLobby();
  renderStats();
  renderStreak();
  if (state.activeSetId) renderStudy();
}

bindEvents();
initialize();
