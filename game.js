// Simple Tycoon Clicker - game.js
// Author: generated (adapt and extend as desired)

// ------------------------
// Minimal utilities
// ------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = n => {
  if (n < 1000) return n.toString();
  const units = ['K','M','B','T','Qa','Qi'];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${+v.toFixed(2)}${units[i-1] ?? units[i]}`;
};

// ------------------------
// Default game state
// ------------------------
const DEFAULT = {
  coins: 0,
  clickValue: 1,
  cps: 0,            // coins per second (passive)
  upgrades: {},      // purchased counts for each upgrade id
  levelXP: 0,
  level: 1,
  prestigePoints: 0,
  lastTick: Date.now()
};

// ------------------------
// Upgrade definitions
// Each has id, name, description, baseCost, effect (applies when bought), type
// types: 'click' (increases clickValue), 'cps' (increases passive), 'mult' (global multiplier)
// scaleFactor: cost increases by scaleFactor^count
// ------------------------
const UPGRADE_DEFS = [
  { id:'cursor', name:'Cursor', desc:'Auto-clicks slowly', baseCost: 15, scale:1.15, type:'cps', value:0.1 },
  { id:'factory', name:'Factory', desc:'Produces coins per second', baseCost: 150, scale:1.17, type:'cps', value:1 },
  { id:'mine', name:'Mine', desc:'Better passive income', baseCost: 1200, scale:1.18, type:'cps', value:8 },
  { id:'taptech', name:'Tap Tech', desc:'Increases coin per click', baseCost: 50, scale:1.2, type:'click', value:1 },
  { id:'doubleclick', name:'Double Click', desc:'Doubles click value (one-time)', baseCost: 5000, scale:2, type:'oneoff', value:2 },
  { id:'multiplier', name:'Global Mult', desc:'Increases all production', baseCost: 10000, scale:2.2, type:'mult', value:0.05 }
];

// ------------------------
// Game state and persistence
// ------------------------
let GS = loadGame();

function loadGame() {
  try {
    const raw = localStorage.getItem('tycoon_save_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT, parsed);
    }
  } catch (e) { console.warn('Load failed', e); }
  return Object.assign({}, DEFAULT);
}

function saveGame() {
  GS.lastTick = Date.now();
  localStorage.setItem('tycoon_save_v1', JSON.stringify(GS));
}

// Export/import helpers
function exportSave() {
  const blob = new Blob([JSON.stringify(GS, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tycoon-save.json';
  a.click();
  URL.revokeObjectURL(url);
}
function importSaveFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      GS = Object.assign({}, DEFAULT, parsed);
      GS.lastTick = Date.now();
      ui.refreshAll();
      saveGame();
      flash('Save imported');
    } catch (err) { flash('Invalid save file'); }
  };
  reader.readAsText(file);
}

// ------------------------
// Game mechanics
// ------------------------
function computeCPS() {
  // sum from upgrades, apply multiplier from 'multiplier' and prestige
  let base = 0;
  for (const u of UPGRADE_DEFS) {
    const count = GS.upgrades[u.id] || 0;
    if (u.type === 'cps') base += count * u.value;
    if (u.type === 'oneoff' && u.value && count > 0 && u.id === 'doubleclick') {
      // handled in clickValue
    }
  }
  // global multiplier from 'multiplier' upgrade
  const multCount = GS.upgrades['multiplier'] || 0;
  const multBonus = 1 + multCount * (UPGRADE_DEFS.find(x => x.id==='multiplier').value || 0);
  // prestige: each prestigePoint gives +1% to all production
  const prestigeMultiplier = 1 + (GS.prestigePoints * 0.01);
  return base * multBonus * prestigeMultiplier;
}

function computeClickValue() {
  let v = GS.clickValue;
  // add click-type upgrades
  const tapTechCount = GS.upgrades['taptech'] || 0;
  v += tapTechCount * (UPGRADE_DEFS.find(x => x.id === 'taptech')?.value || 0);
  // multiplicative one-off
  const doubleCount = GS.upgrades['doubleclick'] || 0;
  if (doubleCount > 0) v *= Math.pow(2, doubleCount);
  // global multiplier and prestige apply to clicks too
  const multCount = GS.upgrades['multiplier'] || 0;
  const multBonus = 1 + multCount * (UPGRADE_DEFS.find(x => x.id==='multiplier').value || 0);
  const prestigeMultiplier = 1 + (GS.prestigePoints * 0.01);
  return v * multBonus * prestigeMultiplier;
}

function gainCoins(amount) {
  GS.coins = Math.max(0, GS.coins + amount);
  GS.levelXP += Math.max(0, amount);
  // auto-level up at thresholds
  const needed = 50 * GS.level; // simple XP needed formula
  while (GS.levelXP >= needed) {
    GS.levelXP -= needed;
    GS.level++;
  }
  ui.refreshAll();
}

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(u => u.id === id);
  if (!def) return;
  const owned = GS.upgrades[id] || 0;
  const cost = Math.floor(def.baseCost * Math.pow(def.scale || 1.15, owned));
  if (GS.coins < cost) {
    flash('Not enough coins');
    return;
  }
  GS.coins -= cost;
  GS.upgrades[id] = owned + 1;

  // apply immediate effects when necessary
  if (def.type === 'click') {
    // click upgrades are handled in computeClickValue (we use tapTech that adds flat)
  } else if (def.type === 'cps') {
    // handled in computeCPS
  } else if (def.type === 'oneoff') {
    // nothing else required here beyond owning it
  } else if (def.type === 'mult') {
    // multiplier accounted in compute functions
  }
  ui.refreshAll();
  saveGame();
  flash(`Bought ${def.name}`);
}

function resetGame(hard = false) {
  if (!confirm('Are you sure you want to reset the game?')) return;
  GS = Object.assign({}, DEFAULT);
  if (!hard) {
    // keep prestige points on soft reset? We'll fully reset here.
  }
  saveGame();
  ui.refreshAll();
  flash('Game reset');
}

function prestige() {
  // Example prestige: requires level 10, gives +1 prestige point per 10 levels
  if (GS.level < 10) {
    flash('Reach Level 10 to prestige');
    return;
  }
  const points = Math.floor(GS.level / 10);
  if (!confirm(`Prestige will reset your progress but grant ${points} prestige point(s). Proceed?`)) return;
  GS.prestigePoints += points;
  // reset core progress but keep prestige
  GS.coins = 0;
  GS.clickValue = DEFAULT.clickValue;
  GS.cps = 0;
  GS.upgrades = {};
  GS.level = 1;
  GS.levelXP = 0;
  saveGame();
  ui.refreshAll();
  flash(`Prestiged! +${points} point(s)`);
}

// ------------------------
// UI handling
// ------------------------
const ui = {
  init() {
    this.coinsEl = $('#coins-display');
    this.cpsEl = $('#cps-display');
    this.clickButton = $('#click-button');
    this.clickValueEl = $('#click-value');
    this.xpBar = $('#xp-bar');
    this.levelLabel = $('#level-label');
    this.upgradesList = $('#upgrades-list');
    this.prestigeButton = $('#prestige-button');
    this.prestigeInfo = $('#prestige-info');
    this.resetButton = $('#reset-button');
    this.downloadBtn = $('#download-button');
    this.uploadBtn = $('#upload-button');
    this.fileInput = $('#file-input');

    // attach events
    this.clickButton.addEventListener('click', () => {
      const cv = computeClickValue();
      gainCoins(cv);
    });

    this.resetButton.addEventListener('click', () => resetGame(true));
    this.prestigeButton.addEventListener('click', () => prestige());
    this.downloadBtn.addEventListener('click', exportSave);
    this.uploadBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', e => {
      if (e.target.files.length) importSaveFromFile(e.target.files[0]);
      e.target.value = '';
    });

    // initial render
    this.renderUpgrades();
    this.refreshAll();
  },

  renderUpgrades() {
    const tpl = $('#upgrade-item-template');
    this.upgradesList.innerHTML = '';
    for (const def of UPGRADE_DEFS) {
      const node = tpl.content.cloneNode(true);
      const el = node.querySelector('.upgrade');
      el.querySelector('.u-name').textContent = def.name;
      el.querySelector('.u-desc').textContent = def.desc;
      const costEl = el.querySelector('.u-cost');
      const buyBtn = el.querySelector('.buy-button');
      buyBtn.addEventListener('click', () => buyUpgrade(def.id));
      buyBtn.dataset.upgradeId = def.id;
      // attach custom property for updates
      el.dataset.upgradeId = def.id;
      this.upgradesList.appendChild(el);
    }
  },

  refreshUpgrades() {
    for (const el of $$('.upgrade', this.upgradesList)) {
      const id = el.dataset.upgradeId;
      const def = UPGRADE_DEFS.find(u => u.id === id);
      const owned = GS.upgrades[id] || 0;
      const cost = Math.floor(def.baseCost * Math.pow(def.scale || 1.15, owned));
      el.querySelector('.u-cost').textContent = `${fmt(cost)} ⌬`;
      const btn = el.querySelector('.buy-button');
      btn.disabled = GS.coins < cost;
    }
  },

  refreshAll() {
    this.coinsEl.textContent = `Coins: ${fmt(Math.floor(GS.coins))}`;
    const cpsVal = computeCPS();
    this.cpsEl.textContent = `CPS: ${fmt(+cpsVal.toFixed(2))}`;
    this.clickValueEl.textContent = `+${fmt(+computeClickValue().toFixed(2))}`;
    const xpNeeded = 50 * GS.level;
    const pct = Math.min(100, (GS.levelXP / xpNeeded) * 100);
    this.xpBar.style.width = pct + '%';
    this.levelLabel.textContent = `Level ${GS.level} (${Math.floor(GS.levelXP)}/${xpNeeded})`;
    this.prestigeInfo.textContent = `Prestige points: ${GS.prestigePoints}`;
    this.prestigeButton.disabled = GS.level < 10;
    this.refreshUpgrades();
  }
};

// ------------------------
// Game loop
// ------------------------
let accumulator = 0; // for sub-second ticks

function tick() {
  const now = Date.now();
  const dt = (now - (GS.lastTick || now)) / 1000;
  GS.lastTick = now;
  // add passive coins
  const cps = computeCPS();
  const gained = cps * dt;
  if (gained > 0) {
    GS.coins += gained;
    GS.levelXP += gained;
  }
  // occasional save
  accumulator += dt;
  if (accumulator >= 5) {
    accumulator = 0;
    saveGame();
  }
  ui.refreshAll();
  requestAnimationFrame(tick);
}

// small visual flash message
function flash(msg, time = 1500) {
  const el = document.createElement('div');
  el.className = 'flash';
  Object.assign(el.style, {
    position:'fixed',left:'50%',top:'20px',transform:'translateX(-50%)',
    background:'#07121b',padding:'10px 14px',borderRadius:'10px',color:'#bfe9ff',zIndex:9999,boxShadow:'0 6px 20px rgba(0,0,0,0.6)'
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=> el.style.opacity = '0', time - 300);
  setTimeout(()=> el.remove(), time);
}

// ------------------------
// Setup
// ------------------------
document.addEventListener('DOMContentLoaded', () => {
  ui.init();
  // compensate for offline time: if lastTick is older, give coins for elapsed time (cap to prevent abuse)
  const now = Date.now();
  const last = GS.lastTick || now;
  const elapsed = Math.min((now - last) / 1000, 60 * 60 * 6); // max 6 hours offline gain
  if (elapsed > 1) {
    const offlineGain = computeCPS() * elapsed;
    if (offlineGain > 0) {
      GS.coins += offlineGain;
      GS.levelXP += offlineGain;
      flash(`You earned ${fmt(Math.floor(offlineGain))} coins while away`);
    }
  }
  GS.lastTick = now;
  requestAnimationFrame(tick);
});
