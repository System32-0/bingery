/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  BINGERY — app.js                                               ║
 * ║  Core application logic for the local media tracker.            ║
 * ║                                                                  ║
 * ║  Table of Contents:                                             ║
 * ║  § 1.  Constants & State                                        ║
 * ║  § 2.  DOM References                                           ║
 * ║  § 3.  Utility Helpers                                          ║
 * ║  § 4.  Storage Layer (localStorage)                             ║
 * ║  § 5.  Data Loading & Merging                                   ║
 * ║  § 6.  Settings Management                                      ║
 * ║  § 7.  Filter UI Population                                     ║
 * ║  § 8.  Filtering & Sorting Logic                                ║
 * ║  § 9.  Card Rendering                                           ║
 * ║  § 10. Grid Rendering                                           ║
 * ║  § 11. Detail Modal                                             ║
 * ║  § 12. Form Modal (Add / Edit)                                  ║
 * ║  § 13. Settings Panel                                           ║
 * ║  § 14. Toast Notifications                                      ║
 * ║  § 15. Event Handlers                                           ║
 * ║  § 16. Initialisation                                           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * SECURITY NOTE:
 *   All user-visible strings are escaped before insertion as HTML,
 *   preventing XSS from tampered data or user-entered content.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   § 1.  CONSTANTS & STATE
═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY       = 'bingery_data';
const SETTINGS_KEY      = 'bingery_settings';
const LIBRARY_CONFIG_KEY = 'bingery_library_config';
const DEFAULT_ACCENT    = '#4a80d4';

const DEFAULT_ENC_KEY_RAW = new Uint8Array([
  0x42,0x49,0x4e,0x47,0x45,0x52,0x59,0x5f,
  0x53,0x54,0x41,0x54,0x49,0x43,0x5f,0x4d,
  0x45,0x44,0x49,0x41,0x5f,0x54,0x52,0x41,
  0x43,0x4b,0x45,0x52,0x5f,0x33,0x32,0x5f,
]);

let MEDIA_TYPES    = ['Anime', 'Manga', 'Manhwa', 'Manhua', 'Book', 'Movie'];
let MEDIA_STATUSES = ['Planned', 'In Progress', 'Completed', 'Dropped'];

/** @type {Array<Object>} Original unmodified list from data.json */
let baseMedia = [];

/** @type {Array<Object>} Full merged library (base + localStorage) */
let allMedia = [];

/** @type {Array<Object>} Currently displayed subset (after filter + sort) */
let filteredMedia = [];

/** @type {Set<string>} IDs that originated from data.json */
let baseMediaIds = new Set();

/** @type {{ added: Array, edited: Object, deleted: Array }} User mutations */
let storageData = { added: [], edited: {}, deleted: [] };

/* ── Bulk Select mode ──
   When active, clicking cards toggles selection instead of opening the modal.
   The toolbar appears with batch actions (change status, type, delete). */
let bulkSelectMode = false;
let bulkSelectedIds = new Set();

/* ── Pinned entries ──
   Entries can be pinned to the top of the grid, separated
   by a visual divider from the rest of the library. */
const DEFAULT_PIN_LIMIT = 6;
const PINNED_KEY = 'bingery_pinned';

/* ── Default relationship types for linked entries (Task 1) ──
   These appear in the "Relationship" dropdown when linking entries.
   Users can customise this list in Settings → Library. */
const DEFAULT_RELATIONSHIP_TYPES = [
  'Sequel', 'Prequel', 'Spin-Off', 'Side Story',
  'Alternative', 'Adaptation', 'Remake', 'Related'
];

/* ── Default scoring system options (Task 11) ──
   Determines how ratings are displayed and input. */
const SCORING_SYSTEMS = {
  '1-10':       { min: 0, max: 10,  step: 0.5, display: v => v + ' / 10' },
  '1-5-stars':  { min: 0, max: 5,   step: 0.5, display: v => '\u2605'.repeat(Math.floor(v)) + (v % 1 >= 0.5 ? '\u00BD' : '') + ' / 5' },
  '1-100':      { min: 0, max: 100, step: 1,   display: v => v + ' / 100' },
  'letter':     { min: 0, max: 5,   step: 1,   display: v => ['F','D','C','B','A','S'][Math.min(5, Math.round(v))] },
  'thumbs':     { min: 0, max: 1,   step: 1,   display: v => v >= 1 ? '\uD83D\uDC4D' : '\uD83D\uDC4E' },
};

/* ── Theme presets — curated colour palettes ──
   Each preset defines the full set of background, text, border,
   and shadow variables. Users pick a preset and the entire UI recolours. */
const THEME_PRESETS = {
  dark:       { label: 'Dark',       bgPrimary: '#0d0f14', bgSecondary: '#131720', bgElevated: '#1a1f2e', bgOverlay: 'rgba(0,0,0,0.75)', textPrimary: '#e8eaf0', textSecondary: '#8a90a8', textMuted: '#4a5068', border: '#252b3b', starEmpty: '#2a3048', shadowCard: '0 2px 12px rgba(0,0,0,0.5)', shadowModal: '0 8px 48px rgba(0,0,0,0.75)' },
  light:      { label: 'Light',      bgPrimary: '#f0f2f7', bgSecondary: '#ffffff', bgElevated: '#e4e8f0', bgOverlay: 'rgba(0,0,0,0.45)', textPrimary: '#1a1e2e', textSecondary: '#4a5270', textMuted: '#8890a8', border: '#d0d5e2', starEmpty: '#c8cce0', shadowCard: '0 2px 12px rgba(0,0,0,0.12)', shadowModal: '0 8px 48px rgba(0,0,0,0.25)' },
  amoled:     { label: 'AMOLED',     bgPrimary: '#000000', bgSecondary: '#0a0a0a', bgElevated: '#141414', bgOverlay: 'rgba(0,0,0,0.85)', textPrimary: '#e0e0e0', textSecondary: '#888888', textMuted: '#555555', border: '#1a1a1a', starEmpty: '#222222', shadowCard: '0 2px 12px rgba(0,0,0,0.8)', shadowModal: '0 8px 48px rgba(0,0,0,0.9)' },
  nord:       { label: 'Nord',       bgPrimary: '#2e3440', bgSecondary: '#3b4252', bgElevated: '#434c5e', bgOverlay: 'rgba(0,0,0,0.65)', textPrimary: '#eceff4', textSecondary: '#d8dee9', textMuted: '#7b88a1', border: '#4c566a', starEmpty: '#3b4252', shadowCard: '0 2px 12px rgba(0,0,0,0.4)', shadowModal: '0 8px 48px rgba(0,0,0,0.6)' },
  solarized:  { label: 'Solarized',  bgPrimary: '#002b36', bgSecondary: '#073642', bgElevated: '#0a4050', bgOverlay: 'rgba(0,0,0,0.65)', textPrimary: '#839496', textSecondary: '#657b83', textMuted: '#586e75', border: '#586e75', starEmpty: '#073642', shadowCard: '0 2px 12px rgba(0,0,0,0.4)', shadowModal: '0 8px 48px rgba(0,0,0,0.6)' },
  dracula:    { label: 'Dracula',    bgPrimary: '#282a36', bgSecondary: '#313345', bgElevated: '#3c3f58', bgOverlay: 'rgba(0,0,0,0.65)', textPrimary: '#f8f8f2', textSecondary: '#c0c0d0', textMuted: '#6272a4', border: '#44475a', starEmpty: '#313345', shadowCard: '0 2px 12px rgba(0,0,0,0.4)', shadowModal: '0 8px 48px rgba(0,0,0,0.6)' },
  rosepine:   { label: 'Ros\u00e9 Pine', bgPrimary: '#191724', bgSecondary: '#1f1d2e', bgElevated: '#26233a', bgOverlay: 'rgba(0,0,0,0.7)', textPrimary: '#e0def4', textSecondary: '#908caa', textMuted: '#6e6a86', border: '#2a273f', starEmpty: '#1f1d2e', shadowCard: '0 2px 12px rgba(0,0,0,0.5)', shadowModal: '0 8px 48px rgba(0,0,0,0.7)' },
  catppuccin: { label: 'Catppuccin', bgPrimary: '#1e1e2e', bgSecondary: '#252536', bgElevated: '#313244', bgOverlay: 'rgba(0,0,0,0.7)', textPrimary: '#cdd6f4', textSecondary: '#a6adc8', textMuted: '#6c7086', border: '#45475a', starEmpty: '#313244', shadowCard: '0 2px 12px rgba(0,0,0,0.5)', shadowModal: '0 8px 48px rgba(0,0,0,0.7)' },
  sepia:      { label: 'Warm Sepia', bgPrimary: '#f5f0e8', bgSecondary: '#faf6ee', bgElevated: '#ece5d8', bgOverlay: 'rgba(0,0,0,0.4)', textPrimary: '#3a3530', textSecondary: '#6b6358', textMuted: '#a09888', border: '#d8d0c0', starEmpty: '#d0c8b8', shadowCard: '0 2px 12px rgba(0,0,0,0.1)', shadowModal: '0 8px 48px rgba(0,0,0,0.2)' },
};

/* ── Font family stacks ──
   Curated sets of system fonts. The selected stack replaces --font-sans
   so the entire UI re-renders in the chosen typeface instantly. */
const FONT_FAMILIES = {
  system:    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  serif:     'Georgia, "Times New Roman", "Palatino Linotype", serif',
  mono:      'ui-monospace, "SFMono-Regular", "Cascadia Code", Menlo, Consolas, monospace',
  humanist:  '"Gill Sans", "Segoe UI", "Trebuchet MS", Calibri, sans-serif',
};

/* ── Font scale multipliers ──
   Applied to all --text-* tokens in applySettings(). A scale of 1.2
   makes every font size 20% larger — great for accessibility. */
const FONT_SCALES = { tiny: 0.85, small: 0.92, normal: 1, large: 1.10, xl: 1.20 };

/* ── Animation speed multipliers ──
   Multiplied against the base --transition-* durations. 0 disables
   all transitions (instant); 1.8 makes everything slower & smoother. */
const ANIMATION_SPEEDS = { instant: 0, fast: 0.4, normal: 1, smooth: 1.8 };

/* ── Border radius presets ──
   Each preset defines values for sm/md/lg/xl that override --radius-*.
   "sharp" = almost square, "pill" = very rounded / capsule shapes. */
const BORDER_RADII = {
  sharp:   { sm: 2, md: 3, lg: 4, xl: 6 },
  subtle:  { sm: 3, md: 5, lg: 8, xl: 10 },
  rounded: { sm: 4, md: 8, lg: 12, xl: 16 },
  pill:    { sm: 8, md: 14, lg: 20, xl: 28 },
};

/* ── Grid gap presets ──
   Controls whitespace between cards. Applied to --grid-gap. */
const GRID_GAPS = { tight: '8px', normal: '16px', relaxed: '24px', spacious: '32px' };

/* ── Shadow intensity presets ──
   Overrides --shadow-card and --shadow-modal. "none" removes all
   depth; "dramatic" adds strong layered shadows for a bold look. */
const SHADOW_PRESETS = {
  none:     { card: 'none',                                                       modal: 'none' },
  subtle:   { card: '0 1px 6px rgba(0,0,0,0.2)',                                 modal: '0 4px 24px rgba(0,0,0,0.35)' },
  normal:   { card: '0 2px 12px rgba(0,0,0,0.5)',                                modal: '0 8px 48px rgba(0,0,0,0.75)' },
  dramatic: { card: '0 4px 24px rgba(0,0,0,0.7), 0 8px 48px rgba(0,0,0,0.4)',    modal: '0 12px 64px rgba(0,0,0,0.9)' },
};

/* ── Multi-rating dimension labels (Task 17) ──
   Sub-categories that can each receive their own score. The main
   rating is auto-averaged from these if the user fills them in. */
const DEFAULT_RATING_DIMENSIONS = ['Story', 'Animation/Art', 'Characters', 'Soundtrack', 'Enjoyment'];

/** @type {{ theme, accentColor, viewMode, cardSize, backupEncryption }} Active settings */
const settings = {
  theme:             'dark',
  accentColor:       DEFAULT_ACCENT,
  viewMode:          'grid',
  cardSize:          'normal',
  backupEncryption:  'none',

  /* ── Task 11 — Custom scoring system ──
     Controls how ratings are displayed and input across the app.
     Options: '1-10', '1-5-stars', '1-100', 'letter', 'thumbs' */
  scoringSystem:     '1-10',

  /* ── Task 1 — Relationship types for linked entries ──
     Customisable list of relationship labels shown in the
     "Link Related Entry" dropdown when adding/editing. */
  relationshipTypes: DEFAULT_RELATIONSHIP_TYPES.slice(),

  /* ── Task 17 — Multi-rating dimension weights ──
     Each dimension gets a weight (0–1) used when auto-averaging
     sub-ratings into the main score. Equal by default. */
  ratingWeights: { Story: 1, 'Animation/Art': 1, Characters: 1, Soundtrack: 1, Enjoyment: 1 },

  /* ── Customisable sub-rating dimension names ──
     Users can add/remove these in Settings → Library. */
  ratingDimensions: DEFAULT_RATING_DIMENSIONS.slice(),

  /* ── Pin limit — max entries that can be pinned to the top ── */
  pinLimit: DEFAULT_PIN_LIMIT,

  /* ── Time estimates — minutes per unit for each media type ──
     Used by estimateTimeRemaining() and the statistics module. */
  timeEstimates: { anime: 23, manga: 5, manhwa: 5, manhua: 5, movie: 90, book: 4 },

  /* ── Theming & design customisation ──
     These settings control the full visual appearance of the app.
     All are applied in applySettings() by setting CSS custom properties
     on :root or toggling body classes. Users configure them in the
     General tab of the Settings drawer.

     themePreset — which curated colour palette to use (THEME_PRESETS keys)
     customBg    — optional { primary, secondary, elevated } hex overrides
     fontScale   — proportional text size multiplier (FONT_SCALES keys)
     fontFamily  — which system font stack to use (FONT_FAMILIES keys)
     cardHover   — hover animation style: lift | glow | border | none
     animationSpeed — transition speed multiplier (ANIMATION_SPEEDS keys)
     borderRadius   — corner roundness preset (BORDER_RADII keys)
     gridGap        — space between grid cards (GRID_GAPS keys)
     shadowIntensity — card/modal shadow depth (SHADOW_PRESETS keys)
     cardInfo    — which info elements to show on cards (booleans)
     statusColors — custom hex per status, or null for defaults
     typeColors   — custom hex per media type, or null for defaults
     sidebarPosition — filter sidebar on 'left' or 'right'
     headerStyle     — 'standard', 'compact', or 'auto-hide'
     lineHeight      — reading density: 'tight', 'normal', 'relaxed'
     cardEntrance    — entrance animation: 'none', 'fade', 'slide-up', 'scale'
     customCSS       — raw CSS string injected into a <style> element */
  themePreset:       'dark',
  customBg:          null,
  fontScale:         'normal',
  fontFamily:        'system',
  cardHover:         'lift',
  animationSpeed:    'normal',
  borderRadius:      'rounded',
  gridGap:           'normal',
  shadowIntensity:   'normal',
  cardInfo:          { author: true, rating: true, statusDot: true, progressBar: true },
  statusColors:      null,
  typeColors:        null,
  sidebarPosition:   'left',
  headerStyle:       'standard',
  lineHeight:        'normal',
  cardEntrance:      'slide-up',
  customCSS:         '',
};

const activeFilters = { type: 'All', genre: 'All', status: 'All' };

let activeSort   = 'dateAdded';
let activeSearch = '';
let searchDebounceTimer = null;
let openModalId  = null;
let editingId    = null;
let toastTimer   = null;

/* ── Undo System (Task 15) ──
   Each user action (add, edit, delete) pushes a snapshot onto the undo stack.
   A cookie-like expiry mechanism removes entries older than 90 seconds.
   Ctrl+Z pops the most recent snapshot and restores the state.
   Ctrl+Y re-applies the last undone action (redo). The redo stack
   is cleared whenever a new user action is performed, preventing
   stale redo paths from diverging from the current timeline. */
let undoStack = [];
let redoStack = [];  /* Mirrors undoStack — populated when user undoes, cleared on new actions */
const UNDO_TTL = 90000; /* 90 seconds — after this the snapshot is gone */

/* ── Activity Log (Task 21) ──
   Records timestamped actions the user performs so they can review
   their session history inside the settings panel. */
let activityLog = [];
const ACTIVITY_LOG_KEY = 'bingery_activity_log';


/* ═══════════════════════════════════════════════════════════════
   § 2.  DOM REFERENCES
═══════════════════════════════════════════════════════════════ */
const dom = {
  get grid()              { return document.getElementById('media-grid');            },
  get resultsCount()      { return document.getElementById('results-count');         },
  get statsMeta()         { return document.getElementById('stats-meta');            },
  get searchInput()       { return document.getElementById('search-input');          },
  get searchClear()       { return document.getElementById('search-clear');          },
  get filterToggle()      { return document.getElementById('filter-toggle');         },
  get filterPanel()       { return document.getElementById('filter-panel');          },
  get typeGroup()         { return document.getElementById('type-filter-group');     },
  get genreGroup()        { return document.getElementById('genre-filter-group');    },
  get statusGroup()       { return document.getElementById('status-filter-group');   },
  get sortSelect()        { return document.getElementById('sort-select');           },
  get resetFilters()      { return document.getElementById('reset-filters');         },
  get emptyState()        { return document.getElementById('empty-state');           },
  get emptyReset()        { return document.getElementById('empty-reset');           },
  get emptyLibraryState() { return document.getElementById('empty-library-state');  },
  get emptyLibraryAdd()   { return document.getElementById('empty-library-add');    },
  get errorState()        { return document.getElementById('error-state');           },
  get modalOverlay()      { return document.getElementById('modal-overlay');         },
  get modalContent()      { return document.getElementById('modal-content');         },
  get modalClose()        { return document.getElementById('modal-close');           },
  get formOverlay()       { return document.getElementById('form-overlay');          },
  get formContainer()     { return document.getElementById('form-container');        },
  get formBody()          { return document.getElementById('form-body');             },
  get formClose()         { return document.getElementById('form-close');            },
  get settingsOverlay()   { return document.getElementById('settings-overlay');      },
  get settingsDrawer()    { return document.getElementById('settings-drawer');       },
  get settingsClose()     { return document.getElementById('settings-close');        },
  get accentInput()       { return document.getElementById('accent-color-input');    },
  get accentPreview()     { return document.getElementById('accent-color-preview');  },
  get resetAccentBtn()    { return document.getElementById('reset-accent-btn');      },
  get exportDataBtn()     { return document.getElementById('export-data-btn');       },
  get importDataInput()   { return document.getElementById('import-data-input');     },
  get resetUserDataBtn()  { return document.getElementById('reset-user-data-btn');   },
  get addBtn()            { return document.getElementById('add-btn');               },
  get settingsBtn()       { return document.getElementById('settings-btn');          },
  get toolsBtn()          { return document.getElementById('tools-btn');             },
  get toolsOverlay()      { return document.getElementById('tools-overlay');         },
  get toolsDrawer()       { return document.getElementById('tools-drawer');          },
  get toolsClose()        { return document.getElementById('tools-close');           },
  get toast()             { return document.getElementById('toast-notification');    },
};


/* ═══════════════════════════════════════════════════════════════
   § 3.  UTILITY HELPERS
═══════════════════════════════════════════════════════════════ */

function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

function formatDate(iso) {
  if (!iso) return '\u2014';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function typeClass(type) {
  return type ? type.toLowerCase().replace(/\s+/g, '-') : 'unknown';
}

function statusClass(status) {
  const s = status || 'Planned';
  return 'status-' + s.toLowerCase().replace(/\s+/g, '-');
}

function parseStars(rating) {
  const score5 = rating / 2;
  const filled  = Math.floor(score5);
  const half    = (score5 - filled) >= 0.5;
  const empty   = 5 - filled - (half ? 1 : 0);
  return { filled, half, empty };
}

function buildStarsHTML(rating) {
  const { filled, half, empty } = parseStars(rating);
  let html = '';
  for (let i = 0; i < filled; i++) html += '<span class="rating-star" aria-hidden="true">\u2605</span>';
  if (half)                          html += '<span class="rating-star rating-star-half" aria-hidden="true">\u2605</span>';
  for (let i = 0; i < empty;  i++) html += '<span class="rating-star-empty" aria-hidden="true">\u2605</span>';
  return html;
}

function fuzzyMatch(query, target) {
  if (!query) return true;
  const haystack = target.toLowerCase();
  return query.trim().split(/\s+/).every(word => haystack.includes(word));
}

function progressPercent(item) {
  if (!item.totalEpisodes || item.totalEpisodes < 1) return null;
  return Math.min(100, Math.round((item.watchedEpisodes / item.totalEpisodes) * 100));
}

function generateId(title) {
  const slug = (title || 'entry')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return slug + '-' + Date.now();
}

function hexToRgba(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'rgba(74,128,212,' + alpha + ')';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function lightenColor(hex, ratio) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, Math.round(r + (255 - r) * ratio));
  g = Math.min(255, Math.round(g + (255 - g) * ratio));
  b = Math.min(255, Math.round(b + (255 - b) * ratio));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ── Task 11 — Format a rating according to the active scoring system ──
   Converts the internal 0–10 score to the display format chosen
   by the user (e.g. letter grades, stars, thumbs). */
function formatScore(rating) {
  const sys = SCORING_SYSTEMS[settings.scoringSystem] || SCORING_SYSTEMS['1-10'];
  const scaled = (rating / 10) * sys.max;
  return sys.display(Math.round(scaled / sys.step) * sys.step);
}

/* ── Task 11 — Convert a score from the active system back to 0–10 ── */
function scoreToInternal(value) {
  const sys = SCORING_SYSTEMS[settings.scoringSystem] || SCORING_SYSTEMS['1-10'];
  return (value / sys.max) * 10;
}

/* ── Task 12 — Fuzzy duplicate title detection ──
   Returns true if two titles are similar enough to be duplicates.
   Uses normalised Levenshtein-like comparison: strips punctuation,
   collapses whitespace, lowercases, then checks inclusion or
   edit distance relative to length. */
function titlesAreSimilar(a, b) {
  if (!a || !b) return false;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  /* Simple character-overlap ratio for short titles */
  const longer  = na.length >= nb.length ? na : nb;
  const shorter = na.length <  nb.length ? na : nb;
  if (shorter.length < 3) return false;
  let matches = 0;
  const longerChars = longer.split('');
  shorter.split('').forEach(c => {
    const idx = longerChars.indexOf(c);
    if (idx !== -1) { matches++; longerChars.splice(idx, 1); }
  });
  return (matches / longer.length) > 0.8;
}

/* ── Task 10 — Estimate watch/read time remaining ──
   Returns an object { remaining, total, unit } with estimated
   minutes left for an in-progress entry. Uses ~23 min per anime
   episode, ~5 min per manga chapter, ~90 min per movie,
   ~250 pages/hr (~4 min/page) for books. */
function estimateTimeRemaining(item) {
  if (!item.totalEpisodes || item.totalEpisodes < 1) return null;
  const watched = item.watchedEpisodes || 0;
  const remaining = Math.max(0, item.totalEpisodes - watched);
  if (remaining === 0) return null;
  const type = (item.type || '').toLowerCase();
  const est = settings.timeEstimates || {};
  const minsPer = est[type] || est.anime || 23;
  return { remaining, total: remaining * minsPer, unit: type === 'movie' ? 'films' : (type === 'book' ? 'pages' : 'episodes') };
}

/* ── Task 17 — Calculate auto-averaged rating from sub-ratings ──
   Takes an object like { Story: 8, Characters: 7, ... } and the
   user's weight config, returns a weighted average on 0–10. */
function autoAverageSubRatings(subRatings, weights) {
  if (!subRatings || typeof subRatings !== 'object') return null;
  const entries = Object.entries(subRatings).filter(([, v]) => v !== null && v !== undefined && v > 0);
  if (entries.length === 0) return null;
  let totalWeight = 0;
  let totalScore  = 0;
  entries.forEach(([dim, val]) => {
    const w = (weights && weights[dim]) || 1;
    totalWeight += w;
    totalScore  += val * w;
  });
  return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : null;
}

/* ═══════════════════════════════════════════════════════════════
   § 3.6  CUSTOM DATE PICKER
   A themed calendar dropdown that replaces native <input type="date">.
   Renders a month grid with navigation. Matches the dark/light theme
   via CSS custom properties. Each instance is bound to a hidden input.
═══════════════════════════════════════════════════════════════ */

/**
 * Build a custom date picker HTML. The hidden input stores the ISO
 * value (YYYY-MM-DD), while the visible button shows the formatted date.
 */
function buildDatePickerHTML(id, name, value) {
  const display = value ? formatDate(value) : 'Select date\u2026';
  return (
    '<div class="bingery-datepicker" id="' + id + '-dp" data-name="' + name + '">' +
      '<button type="button" class="bingery-dp-trigger" id="' + id + '-dp-btn">' +
        '<span class="bingery-dp-value">' + escapeHTML(display) + '</span>' +
        '<svg class="bingery-dp-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
          '<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '<line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '<line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>' +
        '</svg>' +
      '</button>' +
      '<div class="bingery-dp-dropdown" hidden></div>' +
      '<input type="hidden" id="' + id + '" name="' + name + '" value="' + escapeHTML(value || '') + '"/>' +
    '</div>'
  );
}

/**
 * Initialise all date pickers on the page.
 * Attaches click handlers to open the calendar dropdown and
 * renders the month grid inside.
 */
function initDatePickers() {
  document.querySelectorAll('.bingery-datepicker:not([data-dp-init])').forEach(dp => {
    dp.dataset.dpInit = 'true';
    const btn      = dp.querySelector('.bingery-dp-trigger');
    const dropdown = dp.querySelector('.bingery-dp-dropdown');
    const hidden   = dp.querySelector('input[type="hidden"]');
    if (!btn || !dropdown || !hidden) return;

    let viewYear, viewMonth;
    const current = hidden.value ? new Date(hidden.value + 'T00:00:00') : new Date();
    viewYear  = current.getFullYear();
    viewMonth = current.getMonth();

    btn.addEventListener('click', e => {
      e.stopPropagation();
      /* Close other open date pickers */
      document.querySelectorAll('.bingery-dp-dropdown:not([hidden])').forEach(d => {
        if (d !== dropdown) d.hidden = true;
      });
      if (!dropdown.hidden) { dropdown.hidden = true; return; }
      renderCalendar();
      dropdown.hidden = false;
    });

    function renderCalendar() {
      const today     = new Date();
      const todayStr  = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const selVal    = hidden.value;
      const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
      const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      let html = '<div class="bingery-dp-header">' +
        '<button type="button" class="bingery-dp-nav" data-dir="-1" aria-label="Previous month">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<span class="bingery-dp-month">' + monthName + '</span>' +
        '<button type="button" class="bingery-dp-nav" data-dir="1" aria-label="Next month">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>';

      html += '<div class="bingery-dp-weekdays">';
      ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
        html += '<span class="bingery-dp-wd">' + d + '</span>';
      });
      html += '</div>';

      html += '<div class="bingery-dp-grid">';
      /* Empty cells before first day */
      for (let i = 0; i < firstDay; i++) html += '<span class="bingery-dp-empty"></span>';
      /* Day cells */
      for (let d = 1; d <= daysInMon; d++) {
        const dateStr = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const isToday = dateStr === todayStr;
        const isSel   = dateStr === selVal;
        html += '<button type="button" class="bingery-dp-day' +
          (isToday ? ' is-today' : '') +
          (isSel ? ' is-selected' : '') +
          '" data-date="' + dateStr + '">' + d + '</button>';
      }
      html += '</div>';

      html += '<div class="bingery-dp-footer">' +
        '<button type="button" class="bingery-dp-today-btn">Today</button>' +
        '<button type="button" class="bingery-dp-clear-btn">Clear</button>' +
      '</div>';

      dropdown.innerHTML = html;

      /* Event delegation for calendar interactions */
      dropdown.addEventListener('click', handleCalendarClick);
    }

    function handleCalendarClick(e) {
      e.stopPropagation();
      const nav = e.target.closest('.bingery-dp-nav');
      if (nav) {
        const dir = parseInt(nav.dataset.dir, 10);
        viewMonth += dir;
        if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
        renderCalendar();
        return;
      }
      const dayBtn = e.target.closest('.bingery-dp-day');
      if (dayBtn) {
        hidden.value = dayBtn.dataset.date;
        btn.querySelector('.bingery-dp-value').textContent = formatDate(dayBtn.dataset.date);
        dropdown.hidden = true;
        return;
      }
      if (e.target.closest('.bingery-dp-today-btn')) {
        const t = new Date();
        const tStr = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        hidden.value = tStr;
        btn.querySelector('.bingery-dp-value').textContent = formatDate(tStr);
        dropdown.hidden = true;
        return;
      }
      if (e.target.closest('.bingery-dp-clear-btn')) {
        hidden.value = '';
        btn.querySelector('.bingery-dp-value').textContent = 'Select date\u2026';
        dropdown.hidden = true;
        return;
      }
    }
  });

}

/* ── Task 26 — Push an undo snapshot onto the stack ──
   Captures a deep copy of storageData at the current moment.
   Entries older than UNDO_TTL (90s) are pruned automatically. */
function pushUndo(actionLabel) {
  const now = Date.now();
  /* Prune expired snapshots */
  undoStack = undoStack.filter(s => now - s.time < UNDO_TTL);
  /* Deep-copy the current state */
  undoStack.push({
    time:  now,
    label: actionLabel,
    data:  JSON.parse(JSON.stringify(storageData)),
  });
  /* New user action invalidates the redo history */
  redoStack = [];
  logActivity(actionLabel);
}

/* ── Task 26 — Pop and restore the most recent undo snapshot ── */
function popUndo() {
  const now = Date.now();
  undoStack = undoStack.filter(s => now - s.time < UNDO_TTL);
  if (undoStack.length === 0) {
    showToast('Nothing to undo.', 'info');
    return;
  }
  const snapshot = undoStack.pop();

  /* Save current state to redo stack before restoring */
  redoStack.push({
    time:  Date.now(),
    label: snapshot.label,
    data:  JSON.parse(JSON.stringify(storageData)),
    activityLogBackup: snapshot.activityLogBackup
      ? JSON.parse(JSON.stringify(activityLog))
      : undefined,
  });

  storageData = snapshot.data;
  saveStorageData();

  /* Restore activity log if it was backed up (clear logs undo) */
  if (snapshot.activityLogBackup) {
    activityLog = snapshot.activityLogBackup;
    try { localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog)); } catch { /* */ }
  }

  refreshLibrary();
  showToast('Undone: ' + snapshot.label + ' (Ctrl+Y to redo)', 'info');
  logActivity('Undo: ' + snapshot.label);
}

/* ── Redo — Pop from redo stack and restore that state ──
   Inverse of popUndo(). When the user presses Ctrl+Y, we:
   1. Pop the most recent snapshot off redoStack
   2. Push the CURRENT state back onto undoStack (so the user can undo the redo)
   3. Restore storageData from the redo snapshot
   This creates a bidirectional undo/redo chain that the user can
   walk back and forth through until a new action clears the redo stack. */
function popRedo() {
  if (redoStack.length === 0) {
    showToast('Nothing to redo.', 'info');
    return;
  }
  const snapshot = redoStack.pop();

  /* Save current state back onto undo stack */
  undoStack.push({
    time:  Date.now(),
    label: snapshot.label,
    data:  JSON.parse(JSON.stringify(storageData)),
    activityLogBackup: snapshot.activityLogBackup || undefined,
  });

  storageData = snapshot.data;
  saveStorageData();

  /* Restore activity log if applicable */
  if (snapshot.activityLogBackup) {
    activityLog = snapshot.activityLogBackup;
    try { localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog)); } catch { /* */ }
  }

  refreshLibrary();
  showToast('Redone: ' + snapshot.label, 'info');
  logActivity('Redo: ' + snapshot.label);
}

/* ── Task 21 — Activity log helper ──
   Records a timestamped action string. Persisted to localStorage
   so the log survives page reloads (capped at 200 entries). */
function logActivity(action) {
  activityLog.unshift({ time: new Date().toISOString(), action });
  if (activityLog.length > 200) activityLog.length = 200;
  try { localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog)); } catch { /* quota */ }
}

function loadActivityLog() {
  try {
    const raw = localStorage.getItem(ACTIVITY_LOG_KEY);
    if (raw) activityLog = JSON.parse(raw);
  } catch { activityLog = []; }
}

/* ── Task 7 — Recommendation engine ──
   Analyses the user's highest-rated Completed entries to build a
   preference profile (genres, types, episode counts), then scores
   every Planned entry against that profile. Returns an array of
   { entry, score } sorted by descending score. */
/* ── Recommendation Engine ──
   Scores each "Planned" entry based on how well it matches the user's
   demonstrated preferences. The scoring considers five signals:

   1. Genre Affinity — Genres the user has rated highly get more weight.
      Multiple genre matches receive a compounding bonus (15% per match)
      since overlapping genres strongly predict enjoyment.

   2. Type Preference — If the user watches mostly anime, planned anime
      entries score higher. Normalized against the most-watched type.

   3. Author Affinity — Same author as a highly-rated entry gets a bonus,
      since users tend to enjoy an author's other works.

   4. Episode Count Proximity — Entries with a similar episode count to
      the user's average get a higher score (log-scale falloff).

   5. Linked Entry Bonus — If a planned entry is linked (e.g. sequel) to
      a highly-rated entry, it gets a significant boost.

   Returns an array of { entry, score } sorted by score descending. */
function getRecommendations() {
  /* Build preference profile from completed and in-progress entries */
  const rated = allMedia.filter(m =>
    (m.status === 'Completed' || m.status === 'In Progress') && (m.rating || 0) > 0
  );
  if (rated.length === 0) return [];

  /* Genre affinity — weight by rating (higher rated = stronger signal) */
  const genreAffinity = {};
  const typeCounts    = {};
  const authorAffinity = {};
  let totalRating = 0;
  let avgEps = 0;
  let epCount = 0;

  rated.forEach(m => {
    const r = m.rating || 0;
    totalRating += r;
    (m.genres || []).forEach(g => {
      genreAffinity[g] = (genreAffinity[g] || 0) + r;
    });
    typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    if (m.author) {
      authorAffinity[m.author] = (authorAffinity[m.author] || 0) + r;
    }
    if (m.totalEpisodes) { avgEps += m.totalEpisodes; epCount++; }
  });
  if (epCount > 0) avgEps /= epCount;
  const avgRating = totalRating / rated.length;

  /* Normalize genre scores to 0-1 range */
  const maxGenre = Math.max(...Object.values(genreAffinity), 1);

  /* Score each Planned entry */
  const planned = allMedia.filter(m => m.status === 'Planned');
  const scored = planned.map(entry => {
    let score = 0;
    const entryGenres = entry.genres || [];

    /* Genre overlap — weighted by normalized affinity */
    let genreScore = 0;
    let genreMatches = 0;
    entryGenres.forEach(g => {
      if (genreAffinity[g]) {
        genreScore += genreAffinity[g] / maxGenre;
        genreMatches++;
      }
    });
    /* Bonus for multiple genre matches (indicates stronger alignment) */
    if (genreMatches > 1) genreScore *= (1 + genreMatches * 0.15);
    score += genreScore * 10;

    /* Type preference — normalized by how many of that type user has watched */
    const maxType = Math.max(...Object.values(typeCounts), 1);
    if (typeCounts[entry.type]) {
      score += (typeCounts[entry.type] / maxType) * 5;
    }

    /* Author affinity — same author as a highly-rated entry */
    if (entry.author && authorAffinity[entry.author]) {
      score += (authorAffinity[entry.author] / (avgRating * 2)) * 4;
    }

    /* Episode count proximity — prefer entries near user's average length */
    if (entry.totalEpisodes && avgEps > 0) {
      const epRatio = entry.totalEpisodes / avgEps;
      /* Score peaks at 1.0 (exact match) and falls off symmetrically */
      const proximity = Math.max(0, 1 - Math.abs(Math.log(epRatio)));
      score += proximity * 3;
    }

    /* Linked entry bonus — if this entry is linked to a highly-rated entry */
    if (entry.linkedEntries && entry.linkedEntries.length > 0) {
      entry.linkedEntries.forEach(link => {
        const linked = allMedia.find(m => m.id === link.entryId);
        if (linked && (linked.rating || 0) >= 7) {
          score += ((linked.rating || 0) / 10) * 5;
        }
      });
    }

    return { entry, score: Math.round(score * 10) / 10 };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Build the HTML string for a fully-custom themed <select> replacement.
 * A hidden <input type="hidden"> with the given name carries the value so
 * existing form-submission code (form[name].value) keeps working unchanged.
 */
/**
 * Build a searchable custom select — includes a text input at the top
 * of the dropdown that filters options as the user types.
 * Falls back to buildCustomSelectHTML for the base structure.
 */
function buildSearchableSelectHTML(id, name, options, selectedValue) {
  if (!options || options.length === 0) {
    return '<input type="hidden" id="' + id + '" name="' + name + '" value=""/>';
  }
  const safeSelected = options.includes(selectedValue) ? selectedValue : options[0];
  const optsHTML = options.map(opt => {
    const sel = opt === safeSelected;
    return '<li class="custom-select-opt' + (sel ? ' active' : '') + '" role="option"' +
           ' data-value="' + escapeHTML(opt) + '"' +
           ' aria-selected="' + (sel ? 'true' : 'false') + '"' +
           ' tabindex="-1">' + escapeHTML(opt) + '</li>';
  }).join('');
  const chevron =
    '<svg class="custom-select-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"' +
    ' aria-hidden="true" focusable="false">' +
    '<polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return (
    '<div class="custom-select custom-select--searchable" id="' + id + '-wrap">' +
      '<button type="button" class="custom-select-btn" id="' + id + '-btn"' +
        ' aria-haspopup="listbox" aria-expanded="false"' +
        ' aria-controls="' + id + '-list">' +
        '<span class="custom-select-val">' + escapeHTML(safeSelected) + '</span>' +
        chevron +
      '</button>' +
      '<div class="custom-select-dropdown" id="' + id + '-dropdown" hidden>' +
        '<input type="text" class="custom-select-search" placeholder="Search\u2026"' +
          ' aria-label="Search options" autocomplete="off"/>' +
        '<ul class="custom-select-list" role="listbox" id="' + id + '-list"' +
          ' aria-hidden="true" hidden>' +
          optsHTML +
        '</ul>' +
      '</div>' +
      '<input type="hidden" id="' + id + '" name="' + name + '"' +
        ' value="' + escapeHTML(safeSelected) + '"/>' +
    '</div>'
  );
}

function buildCustomSelectHTML(id, name, options, selectedValue) {
  if (!options || options.length === 0) {
    /* Fallback: emit a plain hidden input so the form still submits */
    return '<input type="hidden" id="' + id + '" name="' + name + '" value=""/>';
  }
  const safeSelected = options.includes(selectedValue) ? selectedValue : options[0];
  const optsHTML = options.map(opt => {
    const sel = opt === safeSelected;
    return '<li class="custom-select-opt' + (sel ? ' active' : '') + '" role="option"' +
           ' data-value="' + escapeHTML(opt) + '"' +
           ' aria-selected="' + (sel ? 'true' : 'false') + '"' +
           ' tabindex="-1">' + escapeHTML(opt) + '</li>';
  }).join('');
  const chevron =
    '<svg class="custom-select-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"' +
    ' aria-hidden="true" focusable="false">' +
    '<polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return (
    '<div class="custom-select" id="' + id + '-wrap">' +
      '<button type="button" class="custom-select-btn" id="' + id + '-btn"' +
        ' aria-haspopup="listbox" aria-expanded="false"' +
        ' aria-controls="' + id + '-list">' +
        '<span class="custom-select-val">' + escapeHTML(safeSelected) + '</span>' +
        chevron +
      '</button>' +
      '<ul class="custom-select-list" role="listbox" id="' + id + '-list"' +
        ' aria-hidden="true" hidden>' +
        optsHTML +
      '</ul>' +
      '<input type="hidden" id="' + id + '" name="' + name + '"' +
        ' value="' + escapeHTML(safeSelected) + '"/>' +
    '</div>'
  );
}


/* ═══════════════════════════════════════════════════════════════
   § 3.5  CRYPTO HELPERS (Web Crypto API — AES-GCM-256)
═══════════════════════════════════════════════════════════════ */

function hexEncode(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexDecode(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function getDefaultKey() {
  return crypto.subtle.importKey(
    'raw', DEFAULT_ENC_KEY_RAW, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
}

async function deriveKeyFromPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function encryptJSON(json, key) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json));
  return { iv: hexEncode(iv), ct: hexEncode(new Uint8Array(ct)) };
}

async function decryptJSON(ct, iv, key) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexDecode(iv) }, key, hexDecode(ct)
  );
  return new TextDecoder().decode(plain);
}


/* ═══════════════════════════════════════════════════════════════
   § 3.6  CUSTOM SELECT / DROPDOWN HELPERS
   Manages all .custom-select widgets: the sort dropdown in the
   sidebar and the type/status dropdowns inside the form modal.
═══════════════════════════════════════════════════════════════ */

/**
 * Initialise every uninitialised .custom-select on the page.
 * Safe to call multiple times — already-initialised wrappers are skipped.
 */
function initCustomSelects() {
  document.querySelectorAll('.custom-select:not([data-cs-init])').forEach(wrap => {
    wrap.dataset.csInit = 'true';

    const btn  = wrap.querySelector('.custom-select-btn');
    const list = wrap.querySelector('.custom-select-list');
    if (!btn || !list) return;

    const isSearchable = wrap.classList.contains('custom-select--searchable');
    const searchInput  = wrap.querySelector('.custom-select-search');

    /* ── Open / close on trigger click ── */
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = !list.hidden;
      closeAllCustomSelects();
      if (!isOpen) {
        openCustomSelect(wrap);
        /* Auto-focus the search input when opening searchable selects */
        if (isSearchable && searchInput) {
          searchInput.value = '';
          filterSelectOptions(list, '');
          setTimeout(() => searchInput.focus(), 10);
        }
      }
    });

    /* ── Keyboard on trigger: open with Down / Enter / Space ── */
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCustomSelect(wrap);
        if (isSearchable && searchInput) {
          searchInput.value = '';
          filterSelectOptions(list, '');
          setTimeout(() => searchInput.focus(), 10);
        } else {
          (list.querySelector('.custom-select-opt.active') ||
           list.querySelector('.custom-select-opt'))?.focus();
        }
      }
    });

    /* ── Search input filtering (searchable selects only) ── */
    if (isSearchable && searchInput) {
      searchInput.addEventListener('input', () => {
        filterSelectOptions(list, searchInput.value);
      });
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const firstVisible = list.querySelector('.custom-select-opt:not([hidden])');
          if (firstVisible) firstVisible.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCustomSelect(wrap);
          btn.focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstVisible = list.querySelector('.custom-select-opt:not([hidden])');
          if (firstVisible) applyCustomSelectOption(wrap, firstVisible.dataset.value);
        }
        e.stopPropagation();
      });
      /* Prevent clicks inside the search from closing the dropdown */
      searchInput.addEventListener('click', e => e.stopPropagation());
    }

    /* ── Option click ── */
    list.addEventListener('click', e => {
      const opt = e.target.closest('.custom-select-opt');
      if (opt) applyCustomSelectOption(wrap, opt.dataset.value);
    });

    /* ── Keyboard inside the list ── */
    list.addEventListener('keydown', e => {
      const opts = Array.from(list.querySelectorAll('.custom-select-opt:not([hidden])'));
      const idx  = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault(); opts[Math.min(idx + 1, opts.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) opts[idx - 1].focus();
        else if (isSearchable && searchInput) searchInput.focus();
        else btn.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const opt = document.activeElement.closest('.custom-select-opt');
        if (opt) applyCustomSelectOption(wrap, opt.dataset.value);
      } else if (e.key === 'Escape') {
        e.preventDefault(); closeCustomSelect(wrap); btn.focus();
      } else if (e.key === 'Tab') {
        closeCustomSelect(wrap);
      }
    });
  });
}

/* ── Filter options in a custom-select list by query string ── */
function filterSelectOptions(list, query) {
  const q = query.toLowerCase().trim();
  list.querySelectorAll('.custom-select-opt').forEach(opt => {
    const text = (opt.dataset.value || opt.textContent || '').toLowerCase();
    opt.hidden = q.length > 0 && !text.includes(q);
  });
}

function openCustomSelect(wrap) {
  const btn      = wrap.querySelector('.custom-select-btn');
  const list     = wrap.querySelector('.custom-select-list');
  const dropdown = wrap.querySelector('.custom-select-dropdown');
  if (!btn || !list) return;
  list.hidden = false;
  list.removeAttribute('aria-hidden');
  if (dropdown) dropdown.hidden = false;
  wrap.classList.add('custom-select--open');
  btn.setAttribute('aria-expanded', 'true');
}

function closeCustomSelect(wrap) {
  const btn      = wrap.querySelector('.custom-select-btn');
  const list     = wrap.querySelector('.custom-select-list');
  const dropdown = wrap.querySelector('.custom-select-dropdown');
  if (!list) return;
  list.hidden = true;
  list.setAttribute('aria-hidden', 'true');
  if (dropdown) dropdown.hidden = true;
  wrap.classList.remove('custom-select--open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select--open').forEach(closeCustomSelect);
}

/**
 * Select an option programmatically or from a click, then fire a 'change'
 * event on the hidden <input> so existing listeners keep working.
 */
function applyCustomSelectOption(wrap, value) {
  const list    = wrap.querySelector('.custom-select-list');
  const valEl   = wrap.querySelector('.custom-select-val');
  const hidden  = wrap.querySelector('input[type="hidden"]');
  if (!list) return;

  list.querySelectorAll('.custom-select-opt').forEach(o => {
    const sel = o.dataset.value === value;
    o.classList.toggle('active', sel);
    o.setAttribute('aria-selected', sel ? 'true' : 'false');
    if (sel && valEl) valEl.textContent = o.textContent.trim();
  });

  if (hidden && hidden.value !== value) {
    hidden.value = value;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  closeCustomSelect(wrap);
  wrap.querySelector('.custom-select-btn')?.focus();
}

/**
 * Sync the visible label and active state of a custom select without
 * triggering a change event (used when resetting filters from JS).
 */
function syncCustomSelectUI(wrap, value) {
  if (!wrap) return;
  const list  = wrap.querySelector('.custom-select-list');
  const valEl = wrap.querySelector('.custom-select-val');
  const hidden = wrap.querySelector('input[type="hidden"]');
  if (!list) return;
  list.querySelectorAll('.custom-select-opt').forEach(o => {
    const sel = o.dataset.value === value;
    o.classList.toggle('active', sel);
    o.setAttribute('aria-selected', sel ? 'true' : 'false');
    if (sel && valEl) valEl.textContent = o.textContent.trim();
  });
  if (hidden) hidden.value = value;
}


/* ═══════════════════════════════════════════════════════════════
   § 4.  STORAGE LAYER
═══════════════════════════════════════════════════════════════ */

function defaultStorageData() {
  return { added: [], edited: {}, deleted: [] };
}

function loadStorageData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStorageData();
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      !Array.isArray(parsed.added) ||
      typeof parsed.edited !== 'object' ||
      !Array.isArray(parsed.deleted)
    ) return defaultStorageData();
    return parsed;
  } catch {
    return defaultStorageData();
  }
}

function saveStorageData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
}

/* ── Pinned entries persistence ── */
function loadPinnedIds() {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function savePinnedIds(ids) {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}
function getPinnedIds() {
  return loadPinnedIds();
}
function togglePin(id) {
  const ids = loadPinnedIds();
  const idx = ids.indexOf(id);
  if (idx !== -1) {
    ids.splice(idx, 1);
  } else {
    const limit = settings.pinLimit || DEFAULT_PIN_LIMIT;
    if (ids.length >= limit) {
      showToast('Maximum ' + limit + ' pinned entries allowed.', 'error');
      return false;
    }
    ids.push(id);
  }
  savePinnedIds(ids);
  return true;
}

function mergeWithStorage(base) {
  const deletedSet = new Set(storageData.deleted);
  const merged = base
    .filter(m => !deletedSet.has(m.id))
    .map(m => storageData.edited[m.id] ? Object.assign({}, m, storageData.edited[m.id]) : m);
  const added = storageData.added
    .filter(m => !deletedSet.has(m.id))
    .map(m => storageData.edited[m.id] ? Object.assign({}, m, storageData.edited[m.id]) : m);
  return merged.concat(added);
}

function refreshLibrary() {
  allMedia = mergeWithStorage(baseMedia);
  populateFilters();
  applyFiltersAndSort();
}


/* ═══════════════════════════════════════════════════════════════
   § 4.5  LIBRARY CONFIGURATION (types & statuses)
═══════════════════════════════════════════════════════════════ */

function loadLibraryConfig() {
  try {
    const raw = localStorage.getItem(LIBRARY_CONFIG_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (Array.isArray(cfg.types)    && cfg.types.length    > 0) MEDIA_TYPES    = cfg.types;
    if (Array.isArray(cfg.statuses) && cfg.statuses.length > 0) MEDIA_STATUSES = cfg.statuses;
  } catch { /* ignore */ }
}

function saveLibraryConfig() {
  localStorage.setItem(LIBRARY_CONFIG_KEY, JSON.stringify({ types: MEDIA_TYPES, statuses: MEDIA_STATUSES }));
}


/* ═══════════════════════════════════════════════════════════════
   § 5.  DATA LOADING
═══════════════════════════════════════════════════════════════ */

async function loadData() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.media)) throw new Error('Invalid data.json');

    baseMedia    = data.media;
    baseMediaIds = new Set(baseMedia.map(m => m.id));
    storageData  = loadStorageData();
    allMedia     = mergeWithStorage(baseMedia);
    filteredMedia = allMedia.slice();

    populateFilters();
    renderGrid();
  } catch (err) {
    console.error('[Bingery] Failed to load data.json:', err);
    storageData   = loadStorageData();
    allMedia      = mergeWithStorage([]);
    filteredMedia = allMedia.slice();

    if (allMedia.length > 0) {
      populateFilters();
      renderGrid();
    } else {
      showErrorState();
    }
  }
}


/* ═══════════════════════════════════════════════════════════════
   § 6.  SETTINGS MANAGEMENT
═══════════════════════════════════════════════════════════════ */

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') Object.assign(settings, saved);
  } catch { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * applySettings() — the central function that maps every settings field
 * to its visual representation. It works by:
 *  1. Looking up the active theme preset and setting all --bg-*, --text-*,
 *     --border, --shadow-* CSS custom properties on :root.
 *  2. Allowing custom background overrides on top of the preset.
 *  3. Setting accent colour and its derived values (hover, subtle, focus).
 *  4. Toggling body CSS classes for view mode, card size, hover effect,
 *     animation, sidebar position, header style, card entrance, etc.
 *  5. Overriding font-scale, font-family, border-radius, grid-gap,
 *     shadow intensity, line-height via --var overrides.
 *  6. Applying custom status/type colours if configured.
 *  7. Injecting or clearing the user's custom CSS <style> block.
 *  8. Syncing all settings UI controls (toggles, pickers, checkboxes).
 *
 * Called on: init, settings change, import, theme import.
 */
function applySettings() {
  const body = document.body;
  const root = document.documentElement;

  /* ── Theme preset — apply full colour palette ──
     Looks up the preset's bg/text/border/shadow values and sets them
     all as CSS custom properties. Custom bg overrides take precedence. */
  const preset = THEME_PRESETS[settings.themePreset] || THEME_PRESETS.dark;
  body.classList.remove('theme-light');
  if (settings.themePreset === 'light' || settings.themePreset === 'sepia') body.classList.add('theme-light');
  /* Also keep legacy settings.theme in sync for backwards compat */
  settings.theme = (settings.themePreset === 'light' || settings.themePreset === 'sepia') ? 'light' : 'dark';

  root.style.setProperty('--bg-primary',    settings.customBg?.primary   || preset.bgPrimary);
  root.style.setProperty('--bg-secondary',  settings.customBg?.secondary || preset.bgSecondary);
  root.style.setProperty('--bg-elevated',   settings.customBg?.elevated  || preset.bgElevated);
  root.style.setProperty('--bg-overlay',    preset.bgOverlay);
  root.style.setProperty('--text-primary',  preset.textPrimary);
  root.style.setProperty('--text-secondary',preset.textSecondary);
  root.style.setProperty('--text-muted',    preset.textMuted);
  root.style.setProperty('--border',        preset.border);
  root.style.setProperty('--star-empty',    preset.starEmpty);
  root.style.setProperty('--shadow-card',   preset.shadowCard);
  root.style.setProperty('--shadow-modal',  preset.shadowModal);

  /* ── Accent colour ── */
  root.style.setProperty('--accent',        settings.accentColor);
  root.style.setProperty('--accent-hover',  lightenColor(settings.accentColor, 0.18));
  root.style.setProperty('--accent-subtle', hexToRgba(settings.accentColor, 0.15));
  root.style.setProperty('--border-focus',  settings.accentColor);
  root.style.setProperty('--shadow-focus',  '0 0 0 3px ' + hexToRgba(settings.accentColor, 0.45));

  /* ── View mode ── */
  body.classList.toggle('view-list', settings.viewMode === 'list');

  /* ── Card size ── */
  body.classList.remove('card-tiny', 'card-small', 'card-compact', 'card-normal', 'card-large', 'card-spacious');
  if (settings.cardSize !== 'normal') body.classList.add('card-' + settings.cardSize);

  /* ── Font scale ── */
  const scale = FONT_SCALES[settings.fontScale] || 1;
  root.style.setProperty('--text-xs',   (0.70  * scale).toFixed(3) + 'rem');
  root.style.setProperty('--text-sm',   (0.80  * scale).toFixed(3) + 'rem');
  root.style.setProperty('--text-base', (0.9375 * scale).toFixed(4) + 'rem');
  root.style.setProperty('--text-md',   (1.0625 * scale).toFixed(4) + 'rem');
  root.style.setProperty('--text-lg',   (1.25  * scale).toFixed(3) + 'rem');
  root.style.setProperty('--text-xl',   (1.5   * scale).toFixed(3) + 'rem');
  root.style.setProperty('--text-2xl',  (1.875 * scale).toFixed(3) + 'rem');

  /* ── Font family ── */
  const fontStack = FONT_FAMILIES[settings.fontFamily] || FONT_FAMILIES.system;
  root.style.setProperty('--font-sans', fontStack);

  /* ── Card hover effect ── */
  body.classList.remove('hover-lift', 'hover-glow', 'hover-border', 'hover-none');
  body.classList.add('hover-' + (settings.cardHover || 'lift'));

  /* ── Animation speed ── */
  const speedMult = ANIMATION_SPEEDS[settings.animationSpeed] !== undefined ? ANIMATION_SPEEDS[settings.animationSpeed] : 1;
  root.style.setProperty('--transition-fast',   Math.round(120 * speedMult) + 'ms ease-out');
  root.style.setProperty('--transition-normal',  Math.round(220 * speedMult) + 'ms ease-out');
  root.style.setProperty('--transition-slow',    Math.round(350 * speedMult) + 'ms ease-out');

  /* ── Border radius ── */
  const radii = BORDER_RADII[settings.borderRadius] || BORDER_RADII.rounded;
  root.style.setProperty('--radius-sm', radii.sm + 'px');
  root.style.setProperty('--radius-md', radii.md + 'px');
  root.style.setProperty('--radius-lg', radii.lg + 'px');
  root.style.setProperty('--radius-xl', radii.xl + 'px');

  /* ── Grid gap ── */
  const gap = GRID_GAPS[settings.gridGap] || GRID_GAPS.normal;
  root.style.setProperty('--grid-gap', gap);

  /* ── Shadow intensity ── */
  const shadows = SHADOW_PRESETS[settings.shadowIntensity] || SHADOW_PRESETS.normal;
  root.style.setProperty('--shadow-card',  shadows.card);
  root.style.setProperty('--shadow-modal', shadows.modal);

  /* ── Card info density ── */
  const ci = settings.cardInfo || {};
  body.classList.toggle('hide-card-author',   ci.author === false);
  body.classList.toggle('hide-card-rating',   ci.rating === false);
  body.classList.toggle('hide-card-status',   ci.statusDot === false);
  body.classList.toggle('hide-card-progress', ci.progressBar === false);

  /* ── Custom status colours ── */
  if (settings.statusColors) {
    if (settings.statusColors.completed)  root.style.setProperty('--status-completed',   settings.statusColors.completed);
    if (settings.statusColors.inProgress) root.style.setProperty('--status-in-progress', settings.statusColors.inProgress);
    if (settings.statusColors.dropped)    root.style.setProperty('--status-dropped',     settings.statusColors.dropped);
    if (settings.statusColors.planned)    root.style.setProperty('--status-planned',     settings.statusColors.planned);
  }

  /* ── Custom type badge colours ── */
  if (settings.typeColors) {
    Object.keys(settings.typeColors).forEach(type => {
      root.style.setProperty('--type-' + type.toLowerCase(), settings.typeColors[type]);
    });
  }

  /* ── Sidebar position ── */
  body.classList.toggle('sidebar-right', settings.sidebarPosition === 'right');

  /* ── Header style ── */
  body.classList.remove('header-compact', 'header-autohide');
  if (settings.headerStyle === 'compact')   body.classList.add('header-compact');
  if (settings.headerStyle === 'auto-hide') body.classList.add('header-autohide');

  /* ── Line height ── */
  const lhMap = { tight: '1.3', normal: '1.6', relaxed: '1.8' };
  body.style.lineHeight = lhMap[settings.lineHeight] || '1.6';

  /* ── Card entrance animation ── */
  body.classList.remove('entrance-none', 'entrance-fade', 'entrance-slide-up', 'entrance-scale');
  body.classList.add('entrance-' + (settings.cardEntrance || 'slide-up'));

  /* ── Custom CSS injection ── */
  let userStyle = document.getElementById('user-custom-css');
  if (settings.customCSS) {
    if (!userStyle) {
      userStyle = document.createElement('style');
      userStyle.id = 'user-custom-css';
      document.head.appendChild(userStyle);
    }
    userStyle.textContent = settings.customCSS;
  } else if (userStyle) {
    userStyle.textContent = '';
  }

  /* ── Auto-hide header scroll listener ── */
  applyAutoHideHeader();

  syncSettingsToggles();

  updateEncryptionHint();

  const input   = dom.accentInput;
  const preview = dom.accentPreview;
  if (input)   input.value           = settings.accentColor;
  if (preview) {
    preview.textContent              = settings.accentColor;
    preview.style.background         = settings.accentColor;
  }

  /* ── Sync custom bg pickers ── */
  const bgPrimInput = document.getElementById('bg-primary-input');
  const bgSecInput  = document.getElementById('bg-secondary-input');
  const bgElevInput = document.getElementById('bg-elevated-input');
  if (bgPrimInput) bgPrimInput.value = settings.customBg?.primary   || preset.bgPrimary;
  if (bgSecInput)  bgSecInput.value  = settings.customBg?.secondary || preset.bgSecondary;
  if (bgElevInput) bgElevInput.value = settings.customBg?.elevated  || preset.bgElevated;

  /* ── Sync status colour pickers ── */
  const scComp   = document.getElementById('sc-completed');
  const scProg   = document.getElementById('sc-inprogress');
  const scDrop   = document.getElementById('sc-dropped');
  const scPlan   = document.getElementById('sc-planned');
  if (scComp) scComp.value = settings.statusColors?.completed  || '#40c870';
  if (scProg) scProg.value = settings.statusColors?.inProgress || '#e8c030';
  if (scDrop) scDrop.value = settings.statusColors?.dropped    || '#e85050';
  if (scPlan) scPlan.value = settings.statusColors?.planned    || '#4a80d4';

  /* ── Sync type colour pickers ── */
  MEDIA_TYPES.forEach(type => {
    const el = document.getElementById('tc-' + type.toLowerCase());
    if (el) el.value = settings.typeColors?.[type.toLowerCase()] || getComputedStyle(root).getPropertyValue('--type-' + type.toLowerCase()).trim() || '#888888';
  });

  /* ── Sync custom CSS textarea ── */
  const cssTA = document.getElementById('custom-css-textarea');
  if (cssTA && cssTA.value !== settings.customCSS) cssTA.value = settings.customCSS || '';

  /* ── Sync card info density checkboxes ── */
  const ciToggles = document.getElementById('card-info-toggles');
  if (ciToggles) {
    const ci = settings.cardInfo || { author: true, rating: true, statusDot: true, progressBar: true };
    ciToggles.querySelectorAll('input[data-info]').forEach(cb => {
      cb.checked = ci[cb.dataset.info] !== false;
    });
  }
}

/* ── Auto-hide header scroll behaviour ── */
let _lastScrollY = 0;
let _autoHideHandler = null;
function applyAutoHideHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  if (settings.headerStyle === 'auto-hide') {
    if (!_autoHideHandler) {
      _autoHideHandler = () => {
        const y = window.scrollY;
        if (y > _lastScrollY && y > 80) header.classList.add('header-hidden');
        else header.classList.remove('header-hidden');
        _lastScrollY = y;
      };
      window.addEventListener('scroll', _autoHideHandler, { passive: true });
    }
  } else {
    if (_autoHideHandler) {
      window.removeEventListener('scroll', _autoHideHandler);
      _autoHideHandler = null;
    }
    header?.classList.remove('header-hidden');
  }
}

function syncSettingsToggles() {
  document.querySelectorAll('.settings-toggle[data-setting]').forEach(btn => {
    btn.classList.toggle('active', settings[btn.dataset.setting] === btn.dataset.value);
  });
}

function updateEncryptionHint() {
  const hint = document.getElementById('settings-enc-hint');
  if (!hint) return;
  const unavailable = !window.crypto?.subtle;
  document.querySelectorAll('.settings-toggle[data-setting="backupEncryption"]:not([data-value="none"])').forEach(btn => {
    btn.disabled = unavailable;
  });
  if (unavailable) {
    hint.textContent = 'Encryption unavailable \u2014 requires HTTPS or localhost.';
    return;
  }
  switch (settings.backupEncryption) {
    case 'default':
      hint.textContent = 'Exports are encrypted with a built-in key. Anyone with the app can decrypt.';
      break;
    case 'password':
      hint.textContent = 'Exports are encrypted with your password. Keep it safe \u2014 without it, data cannot be recovered.';
      break;
    default:
      hint.textContent = 'Exports are plain JSON \u2014 readable by anyone.';
  }
}


/* ═══════════════════════════════════════════════════════════════
   § 7.  FILTER UI POPULATION
═══════════════════════════════════════════════════════════════ */

function populateFilters() {
  const types = ['All'].concat(
    Array.from(new Set(allMedia.map(m => m.type).filter(Boolean))).sort()
  );

  const genreSet = new Set();
  allMedia.forEach(m => (m.genres || []).forEach(g => genreSet.add(g)));
  const genres = ['All'].concat(Array.from(genreSet).sort());

  const statuses = ['All'].concat(
    Array.from(new Set(allMedia.map(m => m.status).filter(Boolean))).sort()
  );

  renderChipGroup(dom.typeGroup,   types,    'type');
  renderChipGroup(dom.genreGroup,  genres,   'genre');
  renderChipGroup(dom.statusGroup, statuses, 'status');
}

function renderChipGroup(container, values, dimension) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  values.forEach(value => {
    const btn = document.createElement('button');
    const isActive = activeFilters[dimension] === value;
    btn.className = 'chip' + (isActive ? ' active' : '');
    btn.textContent = value;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.dataset.dimension = dimension;
    btn.dataset.value = value;
    btn.addEventListener('click', handleChipClick);
    fragment.appendChild(btn);
  });
  container.innerHTML = '';
  container.appendChild(fragment);
}

function syncChipActiveState(dimension, newValue) {
  const group = document.getElementById(dimension + '-filter-group');
  if (!group) return;
  group.querySelectorAll('.chip').forEach(chip => {
    const isActive = chip.dataset.value === newValue;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}


/* ═══════════════════════════════════════════════════════════════
   § 8.  FILTERING & SORTING LOGIC
═══════════════════════════════════════════════════════════════ */

function applyFiltersAndSort() {
  filteredMedia = allMedia.filter(item => {
    if (activeFilters.type   !== 'All' && item.type   !== activeFilters.type)               return false;
    if (activeFilters.genre  !== 'All' && !(item.genres || []).includes(activeFilters.genre)) return false;
    if (activeFilters.status !== 'All' && item.status !== activeFilters.status)             return false;
    if (activeSearch) {
      const target = [
        item.title, item.alternativeTitle, item.author,
        item.notes, item.personalReview,
        (item.genres || []).join(' '), item.type, item.status,
      ].filter(Boolean).join(' ');
      if (!fuzzyMatch(activeSearch, target)) return false;
    }
    return true;
  });
  sortMedia(filteredMedia);
  renderGrid();
}

function sortMedia(arr) {
  arr.sort((a, b) => {
    switch (activeSort) {
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'title-desc':
        return (b.title || '').localeCompare(a.title || '');
      case 'progress': {
        const pA = progressPercent(a) !== null ? progressPercent(a) : -1;
        const pB = progressPercent(b) !== null ? progressPercent(b) : -1;
        return pB - pA;
      }
      default:
        return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
    }
  });
}

function resetAll() {
  activeFilters.type   = 'All';
  activeFilters.genre  = 'All';
  activeFilters.status = 'All';
  activeSort   = 'dateAdded';
  activeSearch = '';

  dom.searchInput.value  = '';
  dom.searchClear.hidden = true;
  dom.sortSelect.value   = 'dateAdded';
  syncCustomSelectUI(document.getElementById('sort-select-wrap'), 'dateAdded');

  ['type', 'genre', 'status'].forEach(dim => syncChipActiveState(dim, 'All'));

  filteredMedia = allMedia.slice();
  sortMedia(filteredMedia);
  renderGrid();
}


/* ═══════════════════════════════════════════════════════════════
   § 9.  CARD RENDERING
═══════════════════════════════════════════════════════════════ */

function buildCard(item, index) {
  const card = document.createElement('li');
  const isPinned = getPinnedIds().includes(item.id);
  card.className = 'media-card' + (bulkSelectedIds.has(item.id) ? ' bulk-selected' : '') + (isPinned ? ' card-pinned' : '');
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', escapeHTML(item.title) + ' \u2014 ' + escapeHTML(item.type));
  card.dataset.id = item.id;

  /* Card entrance animation — respects user preference */
  const entranceStyle = settings.cardEntrance || 'slide-up';
  const speedMult = ANIMATION_SPEEDS[settings.animationSpeed] !== undefined ? ANIMATION_SPEEDS[settings.animationSpeed] : 1;
  const dur = Math.round(350 * speedMult);
  const delay = Math.min(index * Math.round(40 * speedMult), Math.round(400 * speedMult));
  if (entranceStyle !== 'none' && dur > 0) {
    const keyframes = entranceStyle === 'fade'
      ? [{ opacity: '0' }, { opacity: '1' }]
      : entranceStyle === 'scale'
      ? [{ opacity: '0', transform: 'scale(0.9)' }, { opacity: '1', transform: 'scale(1)' }]
      : [{ opacity: '0', transform: 'translateY(16px)' }, { opacity: '1', transform: 'translateY(0)' }];
    card.animate(keyframes, { duration: dur, delay, easing: 'ease-out', fill: 'both' });
  }

  const coverSrc  = escapeHTML(item.cover || '');
  const typeLabel = escapeHTML(item.type  || 'Unknown');
  const typeCls   = typeClass(item.type);
  const statCls   = statusClass(item.status);
  const title     = escapeHTML(item.title  || 'Untitled');
  const author    = escapeHTML(item.author || '');
  const rating    = typeof item.rating === 'number' ? item.rating : 0;

  const genreTags = (item.genres || []).slice(0, 2)
    .map(g => '<span class="genre-tag">' + escapeHTML(g) + '</span>')
    .join('');

  const pct = progressPercent(item);
  const progressBar = pct !== null
    ? '<progress class="card-progress-bar" value="' + pct + '" max="100" aria-label="Progress: ' + pct + '%"></progress>'
    : '';
  /* Percentage badge — shown on the right side of the card-meta row
     when the entry has a known total episode count. Hidden on very small
     screens (≤ 600px) via CSS to avoid overflow in tight card layouts. */
  const pctBadge = pct !== null
    ? '<span class="card-pct-badge" aria-label="' + pct + '% complete">' + pct + '%</span>'
    : '';

  const coverHTML = coverSrc
    ? '<img class="card-cover" src="' + coverSrc + '" alt="' + escapeHTML(item.title || 'Media cover') + '" loading="lazy" width="200" height="300" decoding="async"/>'
    : '<div class="card-cover-placeholder" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 64"><rect x="4" y="4" width="40" height="56" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/><path d="M14 28 L28 20 L28 36 Z" fill="currentColor" opacity="0.3"/></svg></div>';

  /* Pin indicator shown on pinned cards */
  const pinBadge = isPinned
    ? '<span class="card-pin-badge" aria-label="Pinned" title="Pinned">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M16 2l5 5-4.5 4.5 1 4-3.5 3.5-4-4-5.5 5.5-1.5-1.5 5.5-5.5-4-4 3.5-3.5 4 1z"/></svg>' +
      '</span>'
    : '';

  /* Bulk select checkbox overlay — visible only in select mode */
  const bulkCheckbox = '<span class="card-bulk-check" aria-hidden="true">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
    '</span>';

  card.innerHTML =
    '<div class="card-cover-wrap">' +
      coverHTML +
      '<span class="status-dot ' + statCls + '" title="' + escapeHTML(item.status || '') + '" aria-hidden="true"></span>' +
      pinBadge +
      bulkCheckbox +
    '</div>' +
    '<div class="card-info">' +
      '<p class="card-title">' + title + '</p>' +
      (author ? '<p class="card-author">' + author + '</p>' : '') +
      (genreTags ? '<div class="card-genres" aria-hidden="true">' + genreTags + '</div>' : '') +
      progressBar +
      '<div class="card-meta">' +
        '<span class="type-badge type-' + typeCls + '" aria-label="Type: ' + typeLabel + '">' + typeLabel + '</span>' +
        '<div class="card-rating" aria-label="Rating: ' + formatScore(rating) + '">' +
          '<span class="rating-star" aria-hidden="true">\u2605</span>' +
          '<span class="card-rating-value">' + escapeHTML(formatScore(rating)) + '</span>' +
        '</div>' +
        pctBadge +
      '</div>' +
    '</div>';

  card.addEventListener('click', () => {
    if (bulkSelectMode) {
      /* Toggle selection instead of opening modal */
      if (bulkSelectedIds.has(item.id)) {
        bulkSelectedIds.delete(item.id);
        card.classList.remove('bulk-selected');
      } else {
        bulkSelectedIds.add(item.id);
        card.classList.add('bulk-selected');
      }
      updateBulkToolbar();
    } else {
      openModal(item.id);
    }
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });
  return card;
}


/* ═══════════════════════════════════════════════════════════════
   § 10. GRID RENDERING
═══════════════════════════════════════════════════════════════ */

function renderGrid() {
  const grid = dom.grid;
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = '';

  dom.emptyState.hidden        = true;
  dom.emptyLibraryState.hidden = true;
  dom.errorState.hidden        = true;
  grid.hidden                  = false;

  if (allMedia.length === 0) {
    dom.emptyLibraryState.hidden = false;
    grid.hidden = true;
    updateStatsBar();
    return;
  }

  if (filteredMedia.length === 0) {
    showEmptyState(true);
    updateStatsBar();
    return;
  }

  showEmptyState(false);
  const fragment = document.createDocumentFragment();
  const pinnedIds = getPinnedIds();

  /* Separate pinned entries from the rest */
  const pinned   = filteredMedia.filter(m => pinnedIds.includes(m.id));
  const unpinned = filteredMedia.filter(m => !pinnedIds.includes(m.id));

  /* Sort pinned entries to match pin order */
  pinned.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));

  let cardIndex = 0;
  if (pinned.length > 0) {
    pinned.forEach(item => fragment.appendChild(buildCard(item, cardIndex++)));
    /* Visual divider between pinned and unpinned */
    if (unpinned.length > 0) {
      const divider = document.createElement('li');
      divider.className = 'pin-divider';
      divider.setAttribute('role', 'separator');
      divider.setAttribute('aria-label', 'Pinned entries above, library entries below');
      divider.innerHTML = '<span class="pin-divider-label">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M16 2l5 5-4.5 4.5 1 4-3.5 3.5-4-4-5.5 5.5-1.5-1.5 5.5-5.5-4-4 3.5-3.5 4 1z"/></svg>' +
        ' Pinned</span>';
      fragment.appendChild(divider);
    }
  }
  unpinned.forEach(item => fragment.appendChild(buildCard(item, cardIndex++)));
  grid.appendChild(fragment);
  updateStatsBar();
}

function updateStatsBar() {
  const total      = allMedia.length;
  const showing    = filteredMedia.length;
  const isFiltered = showing < total;

  dom.resultsCount.textContent = total === 0
    ? 'No entries yet'
    : isFiltered
      ? 'Showing ' + showing + ' of ' + total + ' entries'
      : total + ' ' + (total === 1 ? 'entry' : 'entries') + ' in library';

  const typeCounts = {};
  allMedia.forEach(m => { typeCounts[m.type] = (typeCounts[m.type] || 0) + 1; });

  dom.statsMeta.innerHTML = Object.entries(typeCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => {
      const cls = typeClass(type);
      return '<span class="stat-badge"><span class="type-badge type-' + cls + '" aria-hidden="true">' + escapeHTML(type) + '</span> ' + count + '</span>';
    })
    .join('');
}

function showEmptyState(show) {
  dom.emptyState.hidden = !show;
  dom.grid.hidden = show;
}

function showErrorState() {
  dom.grid.innerHTML = '';
  dom.grid.hidden = true;
  dom.errorState.hidden = false;
  dom.resultsCount.textContent = 'Failed to load library';
}


/* ═══════════════════════════════════════════════════════════════
   § 10.5  BULK SELECT MODE
   Toggle-able mode where clicking cards selects them for batch
   operations: change status, change type, or delete.
═══════════════════════════════════════════════════════════════ */

function enterBulkSelect() {
  bulkSelectMode = true;
  bulkSelectedIds.clear();
  document.body.classList.add('bulk-select-active');
  const btn = document.getElementById('bulk-select-btn');
  if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Cancel'; }
  const toolbar = document.getElementById('bulk-toolbar');
  if (toolbar) toolbar.hidden = false;
  updateBulkToolbar();
}

function exitBulkSelect() {
  bulkSelectMode = false;
  bulkSelectedIds.clear();
  document.body.classList.remove('bulk-select-active');
  const btn = document.getElementById('bulk-select-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
      ' Select';
  }
  const toolbar = document.getElementById('bulk-toolbar');
  if (toolbar) toolbar.hidden = true;
  /* Remove selection highlights from all cards */
  document.querySelectorAll('.media-card.bulk-selected').forEach(c => c.classList.remove('bulk-selected'));
}

function updateBulkToolbar() {
  const count = bulkSelectedIds.size;
  const el = document.getElementById('bulk-toolbar-count');
  if (el) el.textContent = count + ' selected';
  /* Disable action buttons when nothing is selected */
  ['bulk-status-btn', 'bulk-type-btn', 'bulk-delete-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = count === 0;
  });
}

/* Show a small dropdown picker for bulk status/type changes */
function showBulkPicker(options, label, onPick) {
  const existing = document.getElementById('bulk-picker-dropdown');
  if (existing) existing.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'bulk-picker-dropdown';
  dropdown.id = 'bulk-picker-dropdown';
  dropdown.innerHTML = '<p class="bulk-picker-label">' + escapeHTML(label) + '</p>' +
    options.map(o => '<button type="button" class="bulk-picker-option">' + escapeHTML(o) + '</button>').join('');
  document.getElementById('bulk-toolbar').appendChild(dropdown);

  dropdown.addEventListener('click', e => {
    const btn = e.target.closest('.bulk-picker-option');
    if (!btn) return;
    onPick(btn.textContent);
    dropdown.remove();
  });

  /* Close on outside click */
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target)) { dropdown.remove(); document.removeEventListener('click', closeHandler); }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
}

function bulkChangeStatus() {
  showBulkPicker(MEDIA_STATUSES, 'Change status to:', status => {
    pushUndo('Bulk status change to ' + status);
    bulkSelectedIds.forEach(id => {
      const item = allMedia.find(m => m.id === id);
      if (!item) return;
      if (baseMediaIds.has(id)) {
        storageData.edited[id] = Object.assign({}, storageData.edited[id] || {}, item, { status });
      } else {
        const idx = storageData.added.findIndex(m => m.id === id);
        if (idx !== -1) storageData.added[idx].status = status;
      }
    });
    saveStorageData();
    refreshLibrary();
    showToast(bulkSelectedIds.size + ' entries updated to ' + status + '.', 'success');
    exitBulkSelect();
  });
}

function bulkChangeType() {
  showBulkPicker(MEDIA_TYPES, 'Change type to:', type => {
    pushUndo('Bulk type change to ' + type);
    bulkSelectedIds.forEach(id => {
      const item = allMedia.find(m => m.id === id);
      if (!item) return;
      if (baseMediaIds.has(id)) {
        storageData.edited[id] = Object.assign({}, storageData.edited[id] || {}, item, { type });
      } else {
        const idx = storageData.added.findIndex(m => m.id === id);
        if (idx !== -1) storageData.added[idx].type = type;
      }
    });
    saveStorageData();
    refreshLibrary();
    showToast(bulkSelectedIds.size + ' entries updated to ' + type + '.', 'success');
    exitBulkSelect();
  });
}

function bulkDelete() {
  const count = bulkSelectedIds.size;
  /* Show confirmation inline in the toolbar */
  const existing = document.getElementById('bulk-picker-dropdown');
  if (existing) existing.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'bulk-picker-dropdown';
  dropdown.id = 'bulk-picker-dropdown';
  dropdown.innerHTML =
    '<p class="bulk-picker-label">Delete ' + count + ' ' + (count === 1 ? 'entry' : 'entries') + '?</p>' +
    '<div style="display:flex;gap:var(--space-2)">' +
      '<button type="button" class="btn-secondary" id="bulk-delete-cancel">Cancel</button>' +
      '<button type="button" class="btn-danger" id="bulk-delete-confirm">Yes, Delete</button>' +
    '</div>';
  document.getElementById('bulk-toolbar').appendChild(dropdown);

  document.getElementById('bulk-delete-cancel')?.addEventListener('click', () => dropdown.remove());
  document.getElementById('bulk-delete-confirm')?.addEventListener('click', () => {
    pushUndo('Bulk delete ' + count + ' entries');
    bulkSelectedIds.forEach(id => {
      if (!storageData.deleted.includes(id)) storageData.deleted.push(id);
      storageData.added = storageData.added.filter(m => m.id !== id);
      delete storageData.edited[id];
      /* Also remove from pinned */
      const pins = loadPinnedIds().filter(p => p !== id);
      savePinnedIds(pins);
    });
    saveStorageData();
    refreshLibrary();
    showToast(count + ' ' + (count === 1 ? 'entry' : 'entries') + ' deleted.', 'success');
    exitBulkSelect();
  });
}


/* ═══════════════════════════════════════════════════════════════
   § 11. DETAIL MODAL
═══════════════════════════════════════════════════════════════ */

function openModal(id) {
  const item = allMedia.find(m => m.id === id);
  if (!item) return;

  openModalId = id;
  dom.modalContent.innerHTML = buildModalHTML(item);

  const editBtn          = document.getElementById('modal-edit-btn');
  const deleteBtn        = document.getElementById('modal-delete-btn');
  const cancelDeleteBtn  = document.getElementById('modal-cancel-delete-btn');
  const confirmDeleteBtn = document.getElementById('modal-confirm-delete-btn');

  /* ── Task 1 — Navigate to linked entries when clicked ── */
  document.querySelectorAll('.modal-linked-tag[data-id]').forEach(tag => {
    tag.addEventListener('click', () => { closeModal(); openModal(tag.dataset.id); });
  });

  if (editBtn) editBtn.addEventListener('click', () => { closeModal(); openFormModal(id); });

  /* ── Pin/Unpin button ── */
  const pinBtn = document.getElementById('modal-pin-btn');
  if (pinBtn) pinBtn.addEventListener('click', () => {
    const wasPinned = getPinnedIds().includes(id);
    if (togglePin(id)) {
      showToast(wasPinned ? 'Entry unpinned.' : 'Entry pinned.', 'success');
      closeModal();
      renderGrid();
    }
  });

  if (deleteBtn) deleteBtn.addEventListener('click', () => {
    const s = document.getElementById('modal-delete-confirm');
    if (s) s.hidden = false;
    document.getElementById('modal-cancel-delete-btn')?.focus();
  });
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => {
    const s = document.getElementById('modal-delete-confirm');
    if (s) s.hidden = true;
    document.getElementById('modal-delete-btn')?.focus();
  });
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => performDelete(id));

  /* ── Spoiler reveal toggle (delegated, CSP-safe) ── */
  document.querySelectorAll('[data-spoiler-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const content = btn.nextElementSibling;
      if (content) content.hidden = expanded;
      btn.querySelector('span').textContent = expanded ? 'Spoilers \u2014 click to reveal' : 'Spoilers \u2014 click to hide';
    });
  });

  const overlay = dom.modalOverlay;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}

function closeModal() {
  const overlay = dom.modalOverlay;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  overlay.removeEventListener('keydown', trapFocus);
  if (openModalId) {
    const card = document.querySelector('.media-card[data-id="' + CSS.escape(openModalId) + '"]');
    if (card) card.focus();
  }
  openModalId = null;
}

function trapFocus(e) {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  const container = document.getElementById('modal-container');
  const focusable = Array.from(
    container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea')
  ).filter(el => !el.closest('[hidden]'));
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function buildModalHTML(item) {
  const title     = escapeHTML(item.title || 'Untitled');
  const altTitle  = escapeHTML(item.alternativeTitle || '');
  const author    = escapeHTML(item.author || '\u2014');
  const typeLabel = escapeHTML(item.type || '');
  const typeCls   = typeClass(item.type);
  const statLabel = escapeHTML(item.status || '');
  const statCls   = statusClass(item.status);
  const rating    = typeof item.rating === 'number' ? item.rating : 0;
  const starsHTML = buildStarsHTML(rating);
  const coverSrc  = escapeHTML(item.cover || '');
  const synopsis  = escapeHTML(item.synopsis || '');
  const review    = escapeHTML(item.personalReview || '');
  const notes     = escapeHTML(item.notes || '');

  const pct = progressPercent(item);
  let progressHTML = '';
  if (pct !== null) {
    const watched = item.watchedEpisodes !== null && item.watchedEpisodes !== undefined ? item.watchedEpisodes : 0;
    const total   = item.totalEpisodes;
    const unit    = (item.type === 'Manga' || item.type === 'Manhwa' || item.type === 'Manhua')
                    ? 'chapters' : item.type === 'Movie' ? 'film' : 'episodes';
    progressHTML =
      '<div class="modal-progress-wrap">' +
        '<div class="modal-progress-label">' +
          '<span>Progress</span>' +
          '<span>' + watched + ' / ' + total + ' ' + escapeHTML(unit) + ' (' + pct + '%)</span>' +
        '</div>' +
        '<progress class="modal-progress-bar" value="' + pct + '" max="100" aria-label="Progress: ' + pct + '%"></progress>' +
      '</div>';
  }

  const genresHTML = (item.genres || [])
    .map(g => '<span class="modal-genre-tag">' + escapeHTML(g) + '</span>')
    .join('');

  const coverHTML = coverSrc
    ? '<img class="modal-cover" src="' + coverSrc + '" alt="' + escapeHTML(item.title || 'Cover art') + '" loading="lazy" width="180" height="270" decoding="async"/>'
    : '<div class="modal-cover modal-cover-placeholder" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 64"><rect x="4" y="4" width="40" height="56" rx="3" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/><path d="M14 28 L28 20 L28 36 Z" fill="currentColor" opacity="0.3"/></svg></div>';

  const synopsisSection = synopsis
    ? '<section class="modal-section" aria-labelledby="modal-synopsis-lbl"><h3 id="modal-synopsis-lbl" class="modal-section-title">Synopsis</h3><p class="modal-section-text">' + synopsis + '</p></section>'
    : '';

  /* ── Spoiler section ──
     If the entry is flagged as containing spoilers, the review is
     wrapped in a reveal container. Otherwise it shows directly.
     Uses a class-based toggle instead of inline onclick (CSP-safe). */
  let reviewSection = '';
  if (review) {
    if (item.hasSpoilers) {
      reviewSection =
        '<section class="modal-section" aria-labelledby="modal-review-lbl">' +
          '<h3 id="modal-review-lbl" class="modal-section-title">Personal Review</h3>' +
          '<div class="spoiler-container">' +
            '<button type="button" class="spoiler-toggle" aria-expanded="false" data-spoiler-btn>' +
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
              '<span>Spoilers \u2014 click to reveal</span>' +
            '</button>' +
            '<div class="spoiler-content" hidden>' +
              '<p class="modal-section-text">' + review + '</p>' +
            '</div>' +
          '</div>' +
        '</section>';
    } else {
      reviewSection =
        '<section class="modal-section" aria-labelledby="modal-review-lbl">' +
          '<h3 id="modal-review-lbl" class="modal-section-title">Personal Review</h3>' +
          '<p class="modal-section-text">' + review + '</p>' +
        '</section>';
    }
  }

  const notesSection = notes
    ? '<section class="modal-section" aria-labelledby="modal-notes-lbl"><h3 id="modal-notes-lbl" class="modal-section-title">Notes</h3><blockquote class="modal-notes">' + notes + '</blockquote></section>'
    : '';

  /* ── Task 5 — Rewatch/reread display ──
     Shows the rewatch count and dates below notes. */
  const rewatchCount = item.rewatchCount || 0;
  const rewatchHTML = rewatchCount > 0
    ? '<section class="modal-section" aria-labelledby="modal-rewatch-lbl">' +
        '<h3 id="modal-rewatch-lbl" class="modal-section-title">Rewatch / Reread</h3>' +
        '<p class="modal-section-text">' +
          '<strong>' + rewatchCount + '</strong> time' + (rewatchCount !== 1 ? 's' : '') + ' completed' +
          (item.rewatchDates && item.rewatchDates.length > 0
            ? '<br><span class="modal-rewatch-dates">Dates: ' + item.rewatchDates.map(d => escapeHTML(d)).join(', ') + '</span>'
            : '') +
        '</p>' +
      '</section>'
    : '';

  /* ── Task 8 — Per-episode/chapter notes display ──
     Renders as a collapsible list of notes keyed by episode number. */
  const epNotesHTML = item.episodeNotes && item.episodeNotes.length > 0
    ? '<section class="modal-section" aria-labelledby="modal-epnotes-lbl">' +
        '<h3 id="modal-epnotes-lbl" class="modal-section-title">Episode / Chapter Notes</h3>' +
        '<ul class="modal-ep-notes-list">' +
        item.episodeNotes.map(en =>
          '<li class="modal-ep-note-item">' +
            '<span class="modal-ep-note-num">Ep ' + en.episode + '</span>' +
            '<span class="modal-ep-note-text">' + escapeHTML(en.note) + '</span>' +
          '</li>'
        ).join('') +
        '</ul>' +
      '</section>'
    : '';

  /* ── Custom detail fields display ── */
  const customFieldsHTML = item.customFields && Object.keys(item.customFields).length > 0
    ? '<section class="modal-section" aria-labelledby="modal-custom-lbl">' +
        '<h3 id="modal-custom-lbl" class="modal-section-title">Details</h3>' +
        '<div class="modal-custom-fields">' +
        Object.entries(item.customFields).map(([k, v]) =>
          '<div class="modal-custom-field"><span class="modal-custom-key">' + escapeHTML(k) + ':</span> <span>' + escapeHTML(v) + '</span></div>'
        ).join('') +
        '</div>' +
      '</section>'
    : '';

  /* ── Task 1 — Linked entries display ──
     Shows related entries as clickable tags with their relationship type. */
  const linkedHTML = item.linkedEntries && item.linkedEntries.length > 0
    ? '<section class="modal-section" aria-labelledby="modal-linked-lbl">' +
        '<h3 id="modal-linked-lbl" class="modal-section-title">Related Entries</h3>' +
        '<div class="modal-linked-list">' +
        item.linkedEntries.map(le => {
          const linked = allMedia.find(m => m.id === le.entryId);
          return '<button type="button" class="modal-linked-tag" data-id="' + escapeHTML(le.entryId) + '">' +
            '<span class="modal-linked-relation">' + escapeHTML(le.relationship) + '</span> ' +
            escapeHTML(linked ? linked.title : le.entryId) +
          '</button>';
        }).join('') +
        '</div>' +
      '</section>'
    : '';

  /* ── Task 17 — Sub-ratings display ── */
  const subRatingsHTML = item.subRatings && Object.keys(item.subRatings).length > 0
    ? '<section class="modal-section" aria-labelledby="modal-subratings-lbl">' +
        '<h3 id="modal-subratings-lbl" class="modal-section-title">Detailed Ratings</h3>' +
        '<div class="modal-subratings-grid">' +
        Object.entries(item.subRatings).map(([dim, val]) =>
          '<div class="modal-subrating-item">' +
            '<span class="modal-subrating-label">' + escapeHTML(dim) + '</span>' +
            '<div class="modal-subrating-bar-track"><div class="modal-subrating-bar-fill" style="width:' + (val * 10) + '%"></div></div>' +
            '<span class="modal-subrating-val">' + escapeHTML(formatScore(val)) + '</span>' +
          '</div>'
        ).join('') +
        '</div>' +
      '</section>'
    : '';

  /* ── Task 10 — Watch time estimator display ── */
  const timeEst = estimateTimeRemaining(item);
  const timeEstHTML = timeEst
    ? '<div class="modal-time-estimate">' +
        '<span class="modal-time-icon">⏱</span> ' +
        '<span>' + timeEst.remaining + ' ' + timeEst.unit + ' remaining (~' +
          (timeEst.total >= 60 ? Math.round(timeEst.total / 60) + 'h ' + (timeEst.total % 60) + 'm' : timeEst.total + ' min') +
        ')</span>' +
      '</div>'
    : '';

  return (
    '<div class="modal-top">' +
      '<div class="modal-cover-wrap">' + coverHTML + '</div>' +
      '<div class="modal-meta">' +
        '<div>' +
          '<h2 id="modal-title" class="modal-title">' + title + '</h2>' +
          (altTitle ? '<p class="modal-alt-title">' + altTitle + '</p>' : '') +
        '</div>' +
        '<p class="modal-author">by <strong>' + author + '</strong></p>' +
        '<div class="modal-badges">' +
          '<span class="type-badge type-' + typeCls + '">' + typeLabel + '</span>' +
          '<span class="status-pill ' + statCls + '">' + statLabel + '</span>' +
        '</div>' +
        '<div class="modal-rating" aria-label="Rating: ' + formatScore(rating) + '">' +
          '<div class="modal-stars">' + starsHTML + '</div>' +
          '<span class="modal-rating-value">' + escapeHTML(formatScore(rating)) + '</span>' +
        '</div>' +
        progressHTML +
        (genresHTML ? '<div class="modal-genre-list" aria-label="Genres">' + genresHTML + '</div>' : '') +
        '<div class="modal-dates">' +
          '<div class="modal-date-item"><span class="modal-date-label">Started</span><span class="modal-date-value">' + formatDate(item.dateStarted) + '</span></div>' +
          '<div class="modal-date-item"><span class="modal-date-label">Finished</span><span class="modal-date-value">' + formatDate(item.dateFinished) + '</span></div>' +
          '<div class="modal-date-item"><span class="modal-date-label">Added</span><span class="modal-date-value">' + formatDate(item.dateAdded) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    timeEstHTML +
    subRatingsHTML +
    synopsisSection + reviewSection + notesSection +
    rewatchHTML + epNotesHTML + customFieldsHTML + linkedHTML +
    '<div class="modal-actions">' +
      '<button class="btn-secondary" id="modal-edit-btn">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Edit Entry' +
      '</button>' +
      '<button class="btn-secondary' + (getPinnedIds().includes(item.id) ? ' btn-pin-active' : '') + '" id="modal-pin-btn" aria-pressed="' + (getPinnedIds().includes(item.id) ? 'true' : 'false') + '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M16 2l5 5-4.5 4.5 1 4-3.5 3.5-4-4-5.5 5.5-1.5-1.5 5.5-5.5-4-4 3.5-3.5 4 1z" fill="' + (getPinnedIds().includes(item.id) ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        (getPinnedIds().includes(item.id) ? ' Unpin' : ' Pin') +
      '</button>' +
      '<button class="btn-danger" id="modal-delete-btn">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        ' Delete Entry' +
      '</button>' +
    '</div>' +
    '<div id="modal-delete-confirm" class="delete-confirm" hidden role="alertdialog" aria-labelledby="delete-confirm-msg">' +
      '<p id="delete-confirm-msg" class="delete-confirm-msg">Delete <strong>' + title + '</strong>? This cannot be undone.</p>' +
      '<div class="delete-confirm-btns">' +
        '<button class="btn-secondary" id="modal-cancel-delete-btn">Cancel</button>' +
        '<button class="btn-danger" id="modal-confirm-delete-btn">Yes, Delete</button>' +
      '</div>' +
    '</div>'
  );
}

function performDelete(id) {
  /* ── Task 15 — Push undo snapshot before deleting ── */
  const item = allMedia.find(m => m.id === id);
  pushUndo('Delete: ' + (item ? item.title : id));

  if (baseMediaIds.has(id)) {
    if (!storageData.deleted.includes(id)) storageData.deleted.push(id);
    delete storageData.edited[id];
  } else {
    storageData.added = storageData.added.filter(m => m.id !== id);
    delete storageData.edited[id];
  }
  /* Remove from pinned list if pinned */
  const pins = loadPinnedIds().filter(p => p !== id);
  savePinnedIds(pins);
  saveStorageData();
  refreshLibrary();
  closeModal();
  showToast('Entry deleted.', 'info');
}


/* ═══════════════════════════════════════════════════════════════
   § 12. FORM MODAL (Add / Edit)
═══════════════════════════════════════════════════════════════ */

function openFormModal(id) {
  editingId = id || null;
  const item = editingId ? allMedia.find(m => m.id === editingId) : null;

  dom.formBody.innerHTML = buildFormHTML(item);
  bindFormEvents();

  const overlay = dom.formOverlay;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const titleInput = document.getElementById('f-title');
  if (titleInput) titleInput.focus();

  overlay.addEventListener('keydown', trapFormFocus);
}

function closeFormModal() {
  const overlay = dom.formOverlay;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.removeEventListener('keydown', trapFormFocus);
  if (!openModalId) document.body.classList.remove('modal-open');
  editingId = null;
}

function trapFormFocus(e) {
  if (e.key === 'Escape') { closeFormModal(); return; }
  if (e.key !== 'Tab') return;
  const container = dom.formContainer;
  const focusable = Array.from(
    container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea')
  ).filter(el => !el.closest('[hidden]'));
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function buildFormHTML(item) {
  const isEdit = !!item;
  const v = (field, fallback) => {
    if (fallback === undefined) fallback = '';
    return escapeHTML(item ? (item[field] !== null && item[field] !== undefined ? item[field] : fallback) : fallback);
  };

  /* Convert internal 0-10 rating to the active scoring system for display.
     Default for new entries is the midpoint of the current system's range.
     The original internal value is stored as data-internal-rating on the
     slider so that low-resolution systems (letter, thumbs) don't cause
     precision loss on round-trip if the user doesn't touch the slider. */
  const sys = SCORING_SYSTEMS[settings.scoringSystem] || SCORING_SYSTEMS['1-10'];
  const rawRating = item && item.rating !== null && item.rating !== undefined ? item.rating : 5;
  const rating = Math.round(((rawRating / 10) * sys.max) / sys.step) * sys.step;
  const genres  = item ? (item.genres || []).join(', ') : '';
  const total   = item && item.totalEpisodes   !== null && item.totalEpisodes   !== undefined ? String(item.totalEpisodes)   : '';
  const watched = item && item.watchedEpisodes !== null && item.watchedEpisodes !== undefined ? String(item.watchedEpisodes) : '';

  return (
    '<form id="media-form" class="media-form" novalidate>' +
    '<h2 id="form-heading" class="form-heading">' + (isEdit ? 'Edit Entry' : 'Add New Entry') + '</h2>' +
    '<div class="form-grid">' +

      '<div class="form-group form-group--full">' +
        '<label for="f-title">Title <span class="required-star" aria-hidden="true">*</span></label>' +
        '<input type="text" id="f-title" name="title" class="form-input" value="' + v('title') + '" required aria-required="true" placeholder="Enter title"/>' +
      '</div>' +

      '<div class="form-group form-group--full">' +
        '<label for="f-altTitle">Alternative Title</label>' +
        '<input type="text" id="f-altTitle" name="alternativeTitle" class="form-input" value="' + v('alternativeTitle') + '" placeholder="Original or alternate title"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-author">Author / Studio</label>' +
        '<input type="text" id="f-author" name="author" class="form-input" value="' + v('author') + '" placeholder="Author or studio name"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-type-btn">Type <span class="required-star" aria-hidden="true">*</span></label>' +
        buildCustomSelectHTML('f-type', 'type', MEDIA_TYPES, item ? item.type : MEDIA_TYPES[0]) +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-status-btn">Status <span class="required-star" aria-hidden="true">*</span></label>' +
        buildCustomSelectHTML('f-status', 'status', MEDIA_STATUSES, item ? item.status : MEDIA_STATUSES[0]) +
      '</div>' +

      /* ── Task 11 — Rating slider adapts to the active scoring system ──
         The min/max/step values and display label change based on
         which scoring system the user selected in settings. */
      /* Rating slider — adapts min/max/step to the active scoring system.
         The stored value (0-10) is converted to the system's scale for display. */
      '<div class="form-group">' +
        '<label for="f-rating">Rating: <strong id="f-rating-display" class="form-rating-display">' + sys.display(rating) + '</strong></label>' +
        '<input type="range" id="f-rating" name="rating" class="form-range" min="' + sys.min + '" max="' + sys.max + '" step="' + sys.step + '" value="' + rating + '" aria-valuemin="' + sys.min + '" aria-valuemax="' + sys.max + '" aria-valuenow="' + rating + '" data-internal-rating="' + rawRating + '" data-touched="false"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-genres">Genres <span class="form-hint">(comma-separated)</span></label>' +
        '<input type="text" id="f-genres" name="genres" class="form-input" value="' + escapeHTML(genres) + '" placeholder="Action, Fantasy, Drama"/>' +
      '</div>' +

      '<div class="form-group form-group--full">' +
        '<label>Cover Image</label>' +
        '<label class="cover-upload-label" for="f-cover-file">' +
          '<input type="file" id="f-cover-file" accept="image/*" class="visually-hidden"/>' +
          '<div class="cover-upload-area' + (item && item.cover ? ' has-image' : '') + '" id="cover-upload-area">' +
            '<div class="cover-upload-prompt">' +
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" width="24" height="24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 8 12 3 7 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
              '<span>Click to upload image</span>' +
            '</div>' +
            '<img id="cover-preview-img" class="cover-preview-inner" src="' + (item && item.cover ? escapeHTML(item.cover) : '') + '" alt="Cover preview"/>' +
          '</div>' +
        '</label>' +
        '<button type="button" id="cover-remove-btn" class="cover-remove-btn"' + (item && item.cover ? '' : ' hidden') + '>Remove</button>' +
        '<input type="hidden" id="f-cover" name="cover" value="' + v('cover') + '"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Date Started</label>' +
        buildDatePickerHTML('f-dateStarted', 'dateStarted', item ? item.dateStarted || '' : '') +
      '</div>' +

      '<div class="form-group">' +
        '<label>Date Finished</label>' +
        buildDatePickerHTML('f-dateFinished', 'dateFinished', item ? item.dateFinished || '' : '') +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-total">Total Episodes / Chapters</label>' +
        '<input type="number" id="f-total" name="totalEpisodes" class="form-input" value="' + escapeHTML(total) + '" min="0" step="1" placeholder="Leave blank if N/A"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-watched">Watched / Read</label>' +
        '<input type="number" id="f-watched" name="watchedEpisodes" class="form-input" value="' + escapeHTML(watched) + '" min="0" step="1" placeholder="0"/>' +
      '</div>' +

      /* ── Task 5 — Rewatch / Reread counter ──
         A numeric field tracking how many times the user has completed
         this entry, with optional comma-separated dates for each rewatch. */
      '<div class="form-group">' +
        '<label for="f-rewatchCount">Rewatch / Reread Count</label>' +
        '<input type="number" id="f-rewatchCount" name="rewatchCount" class="form-input" value="' + (item && item.rewatchCount ? item.rewatchCount : '0') + '" min="0" step="1" placeholder="0"/>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="f-rewatchDates">Rewatch Dates <span class="form-hint">(comma-separated)</span></label>' +
        '<input type="text" id="f-rewatchDates" name="rewatchDates" class="form-input" value="' + escapeHTML(item && item.rewatchDates ? item.rewatchDates.join(', ') : '') + '" placeholder="2024-01-15, 2025-06-20"/>' +
      '</div>' +

      /* ── Task 1 — Linked / Related entries ──
         Lets the user connect this entry to another in their library
         with a customisable relationship type (Sequel, Prequel, etc.).
         The relationship types are managed in Settings → Library. */
      '<div class="form-group form-group--full">' +
        '<label for="f-linkedEntry-btn">Link Related Entry</label>' +
        '<div class="form-linked-row">' +
          buildSearchableSelectHTML('f-linkedEntry', 'linkedEntryId',
            allMedia.filter(m => !item || m.id !== item.id).map(m => m.title),
            '') +
          buildCustomSelectHTML('f-linkedRelation', 'linkedRelation',
            settings.relationshipTypes, settings.relationshipTypes[0]) +
          '<button type="button" id="f-addLink-btn" class="btn-primary" style="white-space:nowrap">+ Link</button>' +
        '</div>' +
        '<ul id="f-linked-list" class="form-linked-list">' +
          (item && item.linkedEntries ? item.linkedEntries.map(le => {
            const linked = allMedia.find(m => m.id === le.entryId);
            return '<li class="form-linked-item" data-entry-id="' + escapeHTML(le.entryId) + '">' +
              '<span>' + escapeHTML(linked ? linked.title : le.entryId) + '</span>' +
              '<span class="form-linked-relation">' + escapeHTML(le.relationship) + '</span>' +
              '<button type="button" class="form-linked-remove" data-entry-id="' + escapeHTML(le.entryId) + '">&times;</button>' +
            '</li>';
          }).join('') : '') +
        '</ul>' +
      '</div>' +

      /* ── Task 17 — Multi-rating dimensions ──
         Optional sub-category ratings (Story, Animation/Art, Characters,
         Soundtrack, Enjoyment). Each gets its own slider. If filled in,
         these auto-average into the main rating. */
      '<fieldset class="form-group form-group--full form-subratings-fieldset">' +
        '<legend class="form-subratings-legend">Sub-Ratings <span class="form-hint">(optional — auto-averages into main rating)</span></legend>' +
        (settings.ratingDimensions || DEFAULT_RATING_DIMENSIONS).map(dim => {
          const dimKey = dim.replace(/[^a-zA-Z]/g, '');
          /* Convert stored 0-10 sub-rating to active scoring system scale */
          const rawVal = item && item.subRatings && item.subRatings[dim] !== undefined ? item.subRatings[dim] : '';
          const scaledVal = rawVal !== '' ? Math.round(((rawVal / 10) * sys.max) / sys.step) * sys.step : '';
          const displayVal = rawVal !== '' ? sys.display(scaledVal) : '—';
          const defaultMid = Math.round(((5 / 10) * sys.max) / sys.step) * sys.step;
          return '<div class="form-subrating-row">' +
            '<label for="f-sub-' + dimKey + '">' + escapeHTML(dim) + '</label>' +
            '<input type="range" id="f-sub-' + dimKey + '" name="sub_' + escapeHTML(dim) + '" class="form-range form-subrating-range" min="' + sys.min + '" max="' + sys.max + '" step="' + sys.step + '" value="' + (scaledVal !== '' ? scaledVal : defaultMid) + '"' + (rawVal === '' ? ' data-empty="true"' : '') + ' data-internal-sub="' + (rawVal !== '' ? rawVal : '') + '"/>' +
            '<span class="form-subrating-val" id="f-sub-' + dimKey + '-val">' + displayVal + '</span>' +
          '</div>';
        }).join('') +
      '</fieldset>' +

      '<div class="form-group form-group--full">' +
        '<label for="f-synopsis">Synopsis</label>' +
        '<textarea id="f-synopsis" name="synopsis" class="form-textarea" rows="4" placeholder="Brief plot summary\u2026">' + v('synopsis') + '</textarea>' +
      '</div>' +

      '<div class="form-group form-group--full">' +
        '<label for="f-review">Personal Review</label>' +
        '<textarea id="f-review" name="personalReview" class="form-textarea" rows="4" placeholder="Your thoughts on this entry\u2026">' + v('personalReview') + '</textarea>' +
        '<label class="form-checkbox-label" style="margin-top:var(--space-2)">' +
          '<input type="checkbox" class="bingery-checkbox" name="hasSpoilers" id="f-hasSpoilers"' + (item && item.hasSpoilers ? ' checked' : '') + '/>' +
          'Contains spoilers (hide behind reveal toggle)' +
        '</label>' +
      '</div>' +

      '<div class="form-group form-group--full">' +
        '<label for="f-notes">Notes</label>' +
        '<textarea id="f-notes" name="notes" class="form-textarea" rows="3" placeholder="Any extra notes\u2026">' + v('notes') + '</textarea>' +
      '</div>' +

      /* ── Task 8 — Per-episode / chapter notes ──
         A collapsible list of notes keyed to specific episode or chapter
         numbers, e.g. "Ep 7 — the twist with the letter was incredible".
         Stored as an array of { episode: number, note: string }. */
      /* ── Custom detail fields from settings ── */
      ((settings.customFields || []).map(fieldName => {
        const fieldKey = 'custom_' + fieldName.replace(/[^a-zA-Z0-9]/g, '_');
        const fieldVal = item && item.customFields && item.customFields[fieldName] !== undefined ? item.customFields[fieldName] : '';
        return '<div class="form-group form-group--full">' +
          '<label for="f-' + escapeHTML(fieldKey) + '">' + escapeHTML(fieldName) + '</label>' +
          '<input type="text" id="f-' + escapeHTML(fieldKey) + '" name="' + escapeHTML(fieldKey) + '" class="form-input" value="' + escapeHTML(fieldVal) + '" placeholder="Enter ' + escapeHTML(fieldName) + '"/>' +
        '</div>';
      }).join('')) +

      '<div class="form-group form-group--full">' +
        '<label>Episode / Chapter Notes</label>' +
        '<div id="f-episode-notes-list" class="form-ep-notes-list">' +
          (item && item.episodeNotes ? item.episodeNotes.map((en, i) =>
            '<div class="form-ep-note-row" data-index="' + i + '">' +
              '<input type="number" class="form-input form-ep-note-num" value="' + (en.episode || '') + '" min="1" placeholder="Ep #" aria-label="Episode number"/>' +
              '<input type="text" class="form-input form-ep-note-text" value="' + escapeHTML(en.note || '') + '" placeholder="Your note for this episode\u2026" aria-label="Episode note"/>' +
              '<button type="button" class="form-ep-note-remove" aria-label="Remove note">&times;</button>' +
            '</div>'
          ).join('') : '') +
        '</div>' +
        '<button type="button" id="f-add-ep-note" class="btn-secondary" style="margin-top:var(--space-2)">+ Add Episode Note</button>' +
      '</div>' +

    '</div>' +
    '<p id="form-error" class="form-error-msg" role="alert" hidden></p>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn-secondary" id="form-cancel-btn">Cancel</button>' +
      '<button type="submit" class="btn-primary">' + (isEdit ? 'Save Changes' : 'Add Entry') + '</button>' +
    '</div>' +
    '</form>'
  );
}

function bindFormEvents() {
  const form = document.getElementById('media-form');
  if (!form) return;
  const ratingSlider  = document.getElementById('f-rating');
  const ratingDisplay = document.getElementById('f-rating-display');
  if (ratingSlider && ratingDisplay) {
    /* Show the formatted score (e.g. "A", "3.5 / 5", thumbs emoji)
       instead of the raw slider number */
    const activeSys = SCORING_SYSTEMS[settings.scoringSystem] || SCORING_SYSTEMS['1-10'];
    ratingSlider.addEventListener('input', () => {
      ratingSlider.dataset.touched = 'true';
      const val = parseFloat(ratingSlider.value) || 0;
      ratingDisplay.textContent = activeSys.display(Math.round(val / activeSys.step) * activeSys.step);
      ratingSlider.setAttribute('aria-valuenow', val);
    });
  }
  document.getElementById('form-cancel-btn')?.addEventListener('click', closeFormModal);

  const fileInput   = document.getElementById('f-cover-file');
  const hiddenCover = document.getElementById('f-cover');
  const uploadArea  = document.getElementById('cover-upload-area');
  const previewImg  = document.getElementById('cover-preview-img');
  const removeBtn   = document.getElementById('cover-remove-btn');

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = 300, MAX_H = 450;
          let w = img.width, h = img.height;
          if (w > MAX_W || h > MAX_H) {
            const ratio = Math.min(MAX_W / w, MAX_H / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (hiddenCover) hiddenCover.value = dataUrl;
          if (previewImg)  previewImg.src    = dataUrl;
          if (uploadArea)  uploadArea.classList.add('has-image');
          if (removeBtn)   removeBtn.hidden  = false;
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      if (hiddenCover) hiddenCover.value = '';
      if (previewImg)  previewImg.src    = '';
      if (uploadArea)  uploadArea.classList.remove('has-image');
      if (removeBtn)   removeBtn.hidden  = true;
      if (fileInput)   fileInput.value   = '';
    });
  }

  /* Initialise the custom-select dropdowns injected by buildFormHTML */
  initCustomSelects();

  /* Initialise the custom date pickers injected by buildFormHTML */
  initDatePickers();

  /* ── Task 8 — Episode note add/remove handlers ──
     "Add Episode Note" inserts a new row with episode number + text inputs.
     Each row's × button removes that note. */
  document.getElementById('f-add-ep-note')?.addEventListener('click', () => {
    const list = document.getElementById('f-episode-notes-list');
    if (!list) return;
    const idx = list.children.length;
    const row = document.createElement('div');
    row.className = 'form-ep-note-row';
    row.dataset.index = idx;
    row.innerHTML =
      '<input type="number" class="form-input form-ep-note-num" min="1" placeholder="Ep #" aria-label="Episode number"/>' +
      '<input type="text" class="form-input form-ep-note-text" placeholder="Your note for this episode\u2026" aria-label="Episode note"/>' +
      '<button type="button" class="form-ep-note-remove" aria-label="Remove note">&times;</button>';
    list.appendChild(row);
    row.querySelector('.form-ep-note-num')?.focus();
  });
  document.getElementById('f-episode-notes-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.form-ep-note-remove');
    if (btn) btn.closest('.form-ep-note-row')?.remove();
  });

  /* ── Task 1 — Link related entry add/remove handlers ──
     "Link" button reads the selected entry and relationship type,
     then adds a tag to the linked entries list. × removes it. */
  document.getElementById('f-addLink-btn')?.addEventListener('click', () => {
    const entrySelect    = document.getElementById('f-linkedEntry');
    const relationSelect = document.getElementById('f-linkedRelation');
    const list           = document.getElementById('f-linked-list');
    if (!entrySelect || !relationSelect || !list) return;
    const titleVal = entrySelect.value;
    const relVal   = relationSelect.value;
    if (!titleVal) { showToast('Select an entry to link.', 'info'); return; }
    const target = allMedia.find(m => m.title === titleVal);
    if (!target) { showToast('Entry not found.', 'error'); return; }
    /* Avoid duplicate links */
    if (list.querySelector('[data-entry-id="' + CSS.escape(target.id) + '"]')) {
      showToast('Already linked.', 'info'); return;
    }
    const li = document.createElement('li');
    li.className = 'form-linked-item';
    li.dataset.entryId = target.id;
    li.innerHTML =
      '<span>' + escapeHTML(target.title) + '</span>' +
      '<span class="form-linked-relation">' + escapeHTML(relVal) + '</span>' +
      '<button type="button" class="form-linked-remove" data-entry-id="' + escapeHTML(target.id) + '">&times;</button>';
    list.appendChild(li);
  });
  document.getElementById('f-linked-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.form-linked-remove');
    if (btn) btn.closest('.form-linked-item')?.remove();
  });

  /* ── Task 17 — Sub-rating slider live display ──
     Updates the value label next to each dimension slider as the
     user drags it. Also clears the "empty" flag on first interaction.
     Shows formatted value (e.g. letter grade, stars) instead of raw number. */
  const subSys = SCORING_SYSTEMS[settings.scoringSystem] || SCORING_SYSTEMS['1-10'];
  (settings.ratingDimensions || DEFAULT_RATING_DIMENSIONS).forEach(dim => {
    const dimKey = dim.replace(/[^a-zA-Z]/g, '');
    const slider = document.getElementById('f-sub-' + dimKey);
    const valEl  = document.getElementById('f-sub-' + dimKey + '-val');
    if (slider && valEl) {
      slider.addEventListener('input', () => {
        delete slider.dataset.empty;
        slider.dataset.subTouched = 'true';
        const v = parseFloat(slider.value) || 0;
        valEl.textContent = subSys.display(Math.round(v / subSys.step) * subSys.step);
      });
    }
  });

  form.addEventListener('submit', handleFormSubmit);
}

function handleFormSubmit(e) {
  e.preventDefault();
  const form    = e.target;
  const errorEl = document.getElementById('form-error');
  const title   = form.title.value.trim();

  if (!title) {
    if (errorEl) { errorEl.textContent = 'Title is required.'; errorEl.hidden = false; }
    document.getElementById('f-title')?.focus();
    return;
  }

  /* ── Task 12 — Duplicate detection ──
     When ADDING a new entry (not editing), check if a similar title
     already exists. If so, warn the user but let them proceed by
     clicking Save again (we set a flag to skip the check next time). */
  if (!editingId && !form.dataset.dupConfirmed) {
    const duplicate = allMedia.find(m => titlesAreSimilar(m.title, title));
    if (duplicate) {
      if (errorEl) {
        errorEl.innerHTML = '⚠ A similar entry already exists: <strong>' +
          escapeHTML(duplicate.title) + '</strong>. Click Save again to add anyway.';
        errorEl.hidden = false;
      }
      form.dataset.dupConfirmed = 'true';
      return;
    }
  }

  if (errorEl) errorEl.hidden = true;

  /* Convert slider value from the active scoring system back to internal 0-10.
     If the user never touched the slider, preserve the original internal value
     to avoid precision loss in low-resolution systems (letter, thumbs). */
  const ratingSliderEl = form.rating;
  const rating = ratingSliderEl.dataset.touched === 'true'
    ? scoreToInternal(parseFloat(ratingSliderEl.value) || 0)
    : parseFloat(ratingSliderEl.dataset.internalRating) || 0;
  const genreStr   = (form.genres?.value || '').trim();
  const genres     = genreStr ? genreStr.split(',').map(g => g.trim()).filter(Boolean) : [];
  const totalRaw   = (form.totalEpisodes?.value   || '').trim();
  const watchedRaw = (form.watchedEpisodes?.value || '').trim();
  const now        = new Date().toISOString().slice(0, 10);
  const existing   = editingId ? allMedia.find(m => m.id === editingId) : null;

  /* ── Task 5 — Collect rewatch count and dates ── */
  const rewatchCount = parseInt(form.rewatchCount?.value || '0', 10) || 0;
  const rewatchDatesRaw = (form.rewatchDates?.value || '').trim();
  const rewatchDates = rewatchDatesRaw
    ? rewatchDatesRaw.split(',').map(d => d.trim()).filter(Boolean)
    : [];

  /* ── Task 17 — Collect sub-ratings from dimension sliders ──
     Slider values are in the active scoring system's scale, so convert
     them back to internal 0-10 using scoreToInternal(). */
  const subRatings = {};
  (settings.ratingDimensions || DEFAULT_RATING_DIMENSIONS).forEach(dim => {
    const input = form['sub_' + dim];
    if (input && input.dataset?.empty !== 'true') {
      /* Preserve original internal sub-rating if slider wasn't touched */
      if (input.dataset?.subTouched === 'true') {
        subRatings[dim] = Math.round(scoreToInternal(parseFloat(input.value) || 0) * 10) / 10;
      } else if (input.dataset?.internalSub) {
        subRatings[dim] = parseFloat(input.dataset.internalSub) || 0;
      } else {
        subRatings[dim] = Math.round(scoreToInternal(parseFloat(input.value) || 0) * 10) / 10;
      }
    }
  });

  /* ── Task 17 — Auto-average sub-ratings if provided ── */
  const autoAvg = autoAverageSubRatings(subRatings, settings.ratingWeights);

  /* ── Task 8 — Collect per-episode notes ── */
  const episodeNoteRows = document.querySelectorAll('#f-episode-notes-list .form-ep-note-row');
  const episodeNotes = [];
  episodeNoteRows.forEach(row => {
    const epNum  = parseInt(row.querySelector('.form-ep-note-num')?.value || '0', 10);
    const epNote = (row.querySelector('.form-ep-note-text')?.value || '').trim();
    if (epNum > 0 && epNote) episodeNotes.push({ episode: epNum, note: epNote });
  });

  /* ── Task 1 — Collect linked entries from the form ── */
  const linkedItems = document.querySelectorAll('#f-linked-list .form-linked-item');
  const linkedEntries = [];
  linkedItems.forEach(li => {
    const entryId = li.dataset.entryId;
    const rel = li.querySelector('.form-linked-relation')?.textContent || 'Related';
    if (entryId) linkedEntries.push({ entryId, relationship: rel });
  });

  /* ── Task 15 — Push undo snapshot before saving ── */
  pushUndo(editingId ? 'Edit: ' + title : 'Add: ' + title);

  const entry = {
    id:               editingId || generateId(title),
    title,
    alternativeTitle: form.alternativeTitle?.value.trim() || null,
    author:           form.author?.value.trim()           || null,
    type:             form.type.value,
    status:           form.status.value,
    rating:           autoAvg !== null ? autoAvg : rating,
    genres,
    cover:            form.cover?.value.trim()            || null,
    dateStarted:      form.dateStarted?.value             || null,
    dateFinished:     form.dateFinished?.value            || null,
    dateAdded:        existing?.dateAdded                 || now,
    totalEpisodes:    totalRaw   ? parseInt(totalRaw,   10) : null,
    watchedEpisodes:  watchedRaw ? parseInt(watchedRaw, 10) : null,
    synopsis:         form.synopsis?.value.trim()         || null,
    personalReview:   form.personalReview?.value.trim()   || null,
    notes:            form.notes?.value.trim()            || null,
    /* ── New fields ── */
    rewatchCount,
    rewatchDates,
    subRatings:       Object.keys(subRatings).length > 0 ? subRatings : null,
    episodeNotes:     episodeNotes.length > 0 ? episodeNotes : null,
    linkedEntries:    linkedEntries.length > 0 ? linkedEntries : null,
    /* ── Collect custom detail fields ── */
    customFields:     (() => {
      const cf = {};
      (settings.customFields || []).forEach(fieldName => {
        const fieldKey = 'custom_' + fieldName.replace(/[^a-zA-Z0-9]/g, '_');
        const el = form[fieldKey];
        if (el && el.value.trim()) cf[fieldName] = el.value.trim();
      });
      return Object.keys(cf).length > 0 ? cf : null;
    })(),
    /* ── Spoiler flag — whether to hide the review behind spoiler toggle ── */
    hasSpoilers:      form.hasSpoilers?.checked || false,
  };

  if (editingId) {
    if (baseMediaIds.has(editingId)) {
      storageData.edited[editingId] = entry;
    } else {
      const idx = storageData.added.findIndex(m => m.id === editingId);
      if (idx !== -1) storageData.added[idx] = entry;
      else            storageData.added.push(entry);
    }
  } else {
    storageData.added.push(entry);
  }

  saveStorageData();
  refreshLibrary();
  closeFormModal();
  showToast(editingId ? 'Entry updated.' : 'Entry added.', 'success');
  openModal(entry.id);
}


/* ═══════════════════════════════════════════════════════════════
   § 13. SETTINGS PANEL
═══════════════════════════════════════════════════════════════ */

function openSettings() {
  dom.settingsOverlay.hidden = false;
  document.body.classList.add('modal-open');
  applySettings();
  renderLibraryTab();
  dom.settingsClose.focus();
  dom.settingsOverlay.addEventListener('keydown', trapSettingsFocus);
}

function closeSettings() {
  dom.settingsOverlay.hidden = true;
  document.body.classList.remove('modal-open');
  dom.settingsOverlay.removeEventListener('keydown', trapSettingsFocus);
  dom.settingsBtn.focus();
}

function trapSettingsFocus(e) {
  if (e.key === 'Escape') { closeSettings(); return; }
  if (e.key !== 'Tab') return;
  const drawer = dom.settingsDrawer;
  const focusable = Array.from(
    drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea, label[tabindex]')
  ).filter(el => !el.closest('[hidden]'));
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ── Tools panel open/close ── */
function openTools() {
  dom.toolsOverlay.hidden = false;
  document.body.classList.add('modal-open');
  dom.toolsClose.focus();
  dom.toolsOverlay.addEventListener('keydown', trapToolsFocus);
}

function closeTools() {
  dom.toolsOverlay.hidden = true;
  document.body.classList.remove('modal-open');
  dom.toolsOverlay.removeEventListener('keydown', trapToolsFocus);
  dom.toolsBtn.focus();
}

function trapToolsFocus(e) {
  if (e.key === 'Escape') { closeTools(); return; }
  if (e.key !== 'Tab') return;
  const drawer = dom.toolsDrawer;
  const focusable = Array.from(
    drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea, label[tabindex]')
  ).filter(el => !el.closest('[hidden]'));
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function handleToolsOverlayClick(e) {
  if (e.target === dom.toolsOverlay) closeTools();
}

function handleSettingToggle(e) {
  const btn = e.target.closest('.settings-toggle[data-setting]');
  if (!btn) return;
  const key = btn.dataset.setting;
  const val = btn.dataset.value;
  if (!(key in settings)) return;
  settings[key] = val;
  /* Keep themePreset and legacy theme in sync */
  if (key === 'themePreset') {
    settings.customBg = null; /* reset custom bg when changing preset */
    const preset = THEME_PRESETS[val] || THEME_PRESETS.dark;
    const bgPrimInput = document.getElementById('bg-primary-input');
    const bgSecInput  = document.getElementById('bg-secondary-input');
    const bgElevInput = document.getElementById('bg-elevated-input');
    if (bgPrimInput) bgPrimInput.value = preset.bgPrimary;
    if (bgSecInput)  bgSecInput.value  = preset.bgSecondary;
    if (bgElevInput) bgElevInput.value = preset.bgElevated;
  }
  saveSettings();
  applySettings();
  if (key === 'viewMode' || key === 'scoringSystem' || key === 'cardHover' || key === 'cardEntrance') renderGrid();
  /* ── Task 19 — Re-check CSV/MD button states when encryption changes ── */
  if (key === 'backupEncryption') renderLibraryTab();
}

function handleAccentColorChange(e) {
  settings.accentColor = e.target.value;
  saveSettings();
  applySettings();
}

function handleResetAccent() {
  settings.accentColor = DEFAULT_ACCENT;
  saveSettings();
  applySettings();
}

function showPasswordModal(mode) {
  return new Promise(resolve => {
    const overlay = document.getElementById('password-overlay');
    const body    = document.getElementById('password-body');
    if (!overlay || !body) { resolve(null); return; }
    const title = mode === 'export' ? 'Set Export Password' : 'Enter Import Password';
    const hint  = mode === 'export'
      ? 'Choose a password to encrypt your backup.'
      : 'Enter the password used when exporting.';
    const autoComp = mode === 'export' ? 'new-password' : 'current-password';
    const btnLabel = mode === 'export' ? 'Encrypt &amp; Export' : 'Decrypt &amp; Import';
    body.innerHTML =
      '<h2 class="form-heading">' + escapeHTML(title) + '</h2>' +
      '<p class="settings-hint" style="margin-bottom:var(--space-4)">' + escapeHTML(hint) + '</p>' +
      '<div class="form-group" style="margin-bottom:var(--space-4)">' +
        '<label for="pw-input">Password</label>' +
        '<input type="password" id="pw-input" class="form-input" placeholder="Enter password\u2026" autocomplete="' + autoComp + '"/>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn-secondary" id="pw-cancel-btn">Cancel</button>' +
        '<button type="button" class="btn-primary" id="pw-confirm-btn">' + btnLabel + '</button>' +
      '</div>';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.getElementById('pw-input')?.focus();
    function done(val) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      resolve(val);
    }
    document.getElementById('pw-cancel-btn').addEventListener('click', () => done(null));
    document.getElementById('pw-confirm-btn').addEventListener('click', () => {
      const pw = document.getElementById('pw-input')?.value || '';
      if (!pw) { document.getElementById('pw-input')?.focus(); return; }
      done(pw);
    });
    document.getElementById('pw-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const pw = e.target.value || '';
        if (!pw) return;
        done(pw);
      } else if (e.key === 'Escape') { done(null); }
    });
  });
}

function downloadJSON(content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'bingery-library-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleExportData() {
  /* ── Build a versioned, modular backup payload ──
     Version 2 adds: scoringSystem, relationshipTypes, ratingWeights,
     libraryConfig (types/statuses). All new fields are backwards-
     compatible — older versions simply ignore unknown keys. */
  const backup = {
    _bingery:    'backup',
    _version:    2,
    _exportedAt: new Date().toISOString(),
    settings: {
      accentColor:       settings.accentColor,
      theme:             settings.theme,
      themePreset:       settings.themePreset,
      scoringSystem:     settings.scoringSystem,
      relationshipTypes:  settings.relationshipTypes,
      ratingWeights:      settings.ratingWeights,
      ratingDimensions:   settings.ratingDimensions,
      pinLimit:           settings.pinLimit,
      customBg:           settings.customBg,
      fontScale:          settings.fontScale,
      fontFamily:         settings.fontFamily,
      cardHover:          settings.cardHover,
      animationSpeed:     settings.animationSpeed,
      borderRadius:       settings.borderRadius,
      gridGap:            settings.gridGap,
      shadowIntensity:    settings.shadowIntensity,
      cardInfo:           settings.cardInfo,
      statusColors:       settings.statusColors,
      typeColors:         settings.typeColors,
      sidebarPosition:    settings.sidebarPosition,
      headerStyle:        settings.headerStyle,
      lineHeight:         settings.lineHeight,
      cardEntrance:       settings.cardEntrance,
      customCSS:          settings.customCSS,
    },
    libraryConfig: {
      types:    MEDIA_TYPES,
      statuses: MEDIA_STATUSES,
    },
    pinnedIds: getPinnedIds(),
    media: allMedia,
  };
  const jsonStr = JSON.stringify(backup, null, 2);

  if (settings.backupEncryption === 'default') {
    if (!window.crypto?.subtle) { showToast('Encryption requires a secure context (HTTPS).', 'error'); return; }
    try {
      const key         = await getDefaultKey();
      const { iv, ct }  = await encryptJSON(jsonStr, key);
      downloadJSON(JSON.stringify({ _bingery: 'encrypted', v: 1, method: 'default', iv, ct }, null, 2));
      showToast('Encrypted library exported.', 'success');
    } catch { showToast('Encryption failed.', 'error'); }
  } else if (settings.backupEncryption === 'password') {
    if (!window.crypto?.subtle) { showToast('Encryption requires a secure context (HTTPS).', 'error'); return; }
    const password = await showPasswordModal('export');
    if (!password) return;
    try {
      const salt        = crypto.getRandomValues(new Uint8Array(16));
      const key         = await deriveKeyFromPassword(password, salt);
      const { iv, ct }  = await encryptJSON(jsonStr, key);
      downloadJSON(JSON.stringify({ _bingery: 'encrypted', v: 1, method: 'password', salt: hexEncode(salt), iv, ct }, null, 2));
      showToast('Encrypted library exported.', 'success');
    } catch { showToast('Encryption failed.', 'error'); }
  } else {
    downloadJSON(jsonStr);
    showToast('Library exported.', 'success');
  }
}

function handleImportData(e) {
  const file  = e.target.files[0];
  const input = e.target;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const raw = JSON.parse(ev.target.result);
      let data;
      if (raw && raw._bingery === 'encrypted') {
        if (!window.crypto?.subtle) { showToast('Decryption requires a secure context (HTTPS).', 'error'); return; }
        try {
          let key;
          if (raw.method === 'default') {
            key = await getDefaultKey();
          } else if (raw.method === 'password') {
            const password = await showPasswordModal('import');
            if (!password) return;
            key = await deriveKeyFromPassword(password, hexDecode(raw.salt));
          } else {
            showToast('Unknown encryption method.', 'error'); return;
          }
          data = JSON.parse(await decryptJSON(raw.ct, raw.iv, key));
        } catch { showToast('Decryption failed. Wrong password?', 'error'); return; }
      } else {
        data = raw;
      }
      /* Support both the legacy format { media:[…] } and the versioned
         format { _bingery:'backup', _version:N, settings:{…}, media:[…] }.
         Future keys inside `settings` are silently ignored so old code can
         import newer backups without error. */
      if (!data || !Array.isArray(data.media)) {
        showToast('Invalid JSON: expected a "media" array.', 'error'); return;
      }
      /* Restore settings present in the backup (flexible: only known, valid
         keys are applied; any new key added in future versions is ignored).
         This covers all visual theming keys introduced in the design overhaul
         (theme presets, custom bg, font, hover, animation, etc.) as well as
         the original keys (accentColor, theme, pinLimit, scoring, etc.). */
      if (data.settings && typeof data.settings === 'object') {
        const bs = data.settings;
        if (typeof bs.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(bs.accentColor)) {
          settings.accentColor = bs.accentColor;
        }
        if (bs.theme === 'light' || bs.theme === 'dark') {
          settings.theme = bs.theme;
        }
        if (typeof bs.pinLimit === 'number' && bs.pinLimit >= 1 && bs.pinLimit <= 20) {
          settings.pinLimit = bs.pinLimit;
        }
        /* Restore theming & design keys (safe: unknown values fall back to defaults) */
        const stringKeys = ['themePreset', 'fontScale', 'fontFamily', 'cardHover',
          'animationSpeed', 'borderRadius', 'gridGap', 'shadowIntensity',
          'sidebarPosition', 'headerStyle', 'lineHeight', 'cardEntrance', 'scoringSystem'];
        stringKeys.forEach(k => { if (typeof bs[k] === 'string') settings[k] = bs[k]; });
        if (typeof bs.customCSS === 'string') settings.customCSS = bs.customCSS;
        if (bs.customBg && typeof bs.customBg === 'object') settings.customBg = bs.customBg;
        if (bs.cardInfo && typeof bs.cardInfo === 'object') settings.cardInfo = bs.cardInfo;
        if (bs.statusColors && typeof bs.statusColors === 'object') settings.statusColors = bs.statusColors;
        if (bs.typeColors && typeof bs.typeColors === 'object') settings.typeColors = bs.typeColors;
        if (Array.isArray(bs.relationshipTypes)) settings.relationshipTypes = bs.relationshipTypes;
        if (bs.ratingWeights && typeof bs.ratingWeights === 'object') settings.ratingWeights = bs.ratingWeights;
        if (Array.isArray(bs.ratingDimensions)) settings.ratingDimensions = bs.ratingDimensions;
      }
      saveSettings();
      applySettings();

      /* Restore pinned entries if present in backup */
      if (Array.isArray(data.pinnedIds)) savePinnedIds(data.pinnedIds);

      /* ── Task 13 — Import mode selection ──
         Ask the user whether to overwrite or merge before applying. */
      const importMode = await showImportModeDialog();
      if (!importMode) { input.value = ''; return; } /* cancelled */

      pushUndo('Import (' + importMode + ')');

      if (importMode === 'overwrite') {
        /* Original behaviour: replace everything */
        const importedEdited = {};
        const importedAdded  = [];
        data.media.forEach(m => {
          if (baseMediaIds.has(m.id)) importedEdited[m.id] = m;
          else                        importedAdded.push(m);
        });
        storageData.edited  = importedEdited;
        storageData.added   = importedAdded;
        const importedIdSet = new Set(data.media.map(m => m.id));
        storageData.deleted = baseMedia.map(m => m.id).filter(id => !importedIdSet.has(id));
      } else {
        /* Merge mode: add new entries, update existing if imported data is "better" */
        data.media.forEach(m => {
          const existing = allMedia.find(e => e.id === m.id || titlesAreSimilar(e.title, m.title));
          if (existing) {
            /* Update only if the imported version has more data */
            const merged = Object.assign({}, existing);
            if (m.rating > (existing.rating || 0)) merged.rating = m.rating;
            if ((m.watchedEpisodes || 0) > (existing.watchedEpisodes || 0)) merged.watchedEpisodes = m.watchedEpisodes;
            if ((m.personalReview || '').length > (existing.personalReview || '').length) merged.personalReview = m.personalReview;
            if (!existing.cover && m.cover) merged.cover = m.cover;
            if (!existing.synopsis && m.synopsis) merged.synopsis = m.synopsis;
            if (baseMediaIds.has(existing.id)) storageData.edited[existing.id] = merged;
            else {
              const idx = storageData.added.findIndex(e => e.id === existing.id);
              if (idx !== -1) storageData.added[idx] = merged;
            }
          } else {
            /* Truly new entry — add it */
            storageData.added.push(m);
          }
        });
      }
      saveStorageData();
      refreshLibrary();
      input.value = '';
      showToast('Imported ' + data.media.length + ' entries (' + importMode + ').', 'success');
      logActivity('Imported ' + data.media.length + ' entries (' + importMode + ')');
    } catch { showToast('Failed to parse the JSON file.', 'error'); }
  };
  reader.readAsText(file);
}

function handleResetUserData() {
  // Show inline confirmation instead of window.confirm()
  const confirmDiv = document.getElementById('reset-confirm');
  if (confirmDiv) {
    confirmDiv.hidden = false;
    document.getElementById('reset-cancel-btn')?.focus();
  }
}

function performResetUserData() {
  /* Push undo snapshot before resetting so Ctrl+Z can restore */
  pushUndo('Reset user data');
  localStorage.removeItem(STORAGE_KEY);
  storageData = defaultStorageData();
  const confirmDiv = document.getElementById('reset-confirm');
  if (confirmDiv) confirmDiv.hidden = true;
  refreshLibrary();
  showToast('User data reset. Ctrl+Z to undo.', 'info');
}


/* ─── Library tab ─── */

function renderLibraryTab() {
  const typesList    = document.getElementById('types-list');
  const statusesList = document.getElementById('statuses-list');
  if (typesList) {
    typesList.innerHTML = MEDIA_TYPES.map(t =>
      '<li class="library-tag-item"><span>' + escapeHTML(t) + '</span>' +
      '<button class="library-tag-remove" data-list="types" data-value="' + escapeHTML(t) + '" aria-label="Remove ' + escapeHTML(t) + '">\u00d7</button></li>'
    ).join('');
  }
  if (statusesList) {
    statusesList.innerHTML = MEDIA_STATUSES.map(s =>
      '<li class="library-tag-item"><span>' + escapeHTML(s) + '</span>' +
      '<button class="library-tag-remove" data-list="statuses" data-value="' + escapeHTML(s) + '" aria-label="Remove ' + escapeHTML(s) + '">\u00d7</button></li>'
    ).join('');
  }

  /* ── Task 1 — Render relationship types list in the Library tab ── */
  const relationsList = document.getElementById('relations-list');
  if (relationsList) {
    relationsList.innerHTML = settings.relationshipTypes.map(r =>
      '<li class="library-tag-item"><span>' + escapeHTML(r) + '</span>' +
      '<button class="library-tag-remove" data-list="relations" data-value="' + escapeHTML(r) + '" aria-label="Remove ' + escapeHTML(r) + '">\u00d7</button></li>'
    ).join('');
  }

  /* ── Time estimates grid ── */
  const timeGrid = document.getElementById('time-est-grid');
  if (timeGrid) {
    const est = settings.timeEstimates || {};
    timeGrid.innerHTML = MEDIA_TYPES.map(t => {
      const key = t.toLowerCase();
      const val = est[key] || 23;
      return '<div class="settings-time-row">' +
        '<label class="settings-time-label">' + escapeHTML(t) + '</label>' +
        '<input type="number" class="form-input settings-time-input" data-type="' + escapeHTML(key) + '" value="' + val + '" min="1" max="999"/>' +
        '<span class="settings-time-unit">min</span>' +
      '</div>';
    }).join('');
    timeGrid.addEventListener('change', e => {
      const input = e.target.closest('.settings-time-input');
      if (!input) return;
      if (!settings.timeEstimates) settings.timeEstimates = {};
      settings.timeEstimates[input.dataset.type] = parseInt(input.value, 10) || 23;
      saveSettings();
    });
  }

  /* ── Sub-rating dimensions list ── */
  const subdimsList = document.getElementById('subdims-list');
  if (subdimsList) {
    const dims = settings.ratingDimensions || DEFAULT_RATING_DIMENSIONS;
    subdimsList.innerHTML = dims.map(d =>
      '<li class="library-tag-item"><span>' + escapeHTML(d) + '</span>' +
      '<button class="library-tag-remove" data-list="subdims" data-value="' + escapeHTML(d) + '" aria-label="Remove ' + escapeHTML(d) + '">\u00d7</button></li>'
    ).join('');
  }

  /* ── Custom detail fields list ── */
  const customFieldsList = document.getElementById('custom-fields-list');
  if (customFieldsList) {
    const fields = settings.customFields || [];
    customFieldsList.innerHTML = fields.map(f =>
      '<li class="library-tag-item"><span>' + escapeHTML(f) + '</span>' +
      '<button class="library-tag-remove" data-list="customFields" data-value="' + escapeHTML(f) + '" aria-label="Remove ' + escapeHTML(f) + '">\u00d7</button></li>'
    ).join('');
  }

  /* ── Pin limit input ── */
  const pinLimitInput = document.getElementById('pin-limit-input');
  if (pinLimitInput) {
    pinLimitInput.value = settings.pinLimit || DEFAULT_PIN_LIMIT;
  }
  const pinLimitSaveBtn = document.getElementById('pin-limit-save-btn');
  if (pinLimitSaveBtn) {
    pinLimitSaveBtn.addEventListener('click', () => {
      const val = parseInt(pinLimitInput?.value, 10);
      if (!val || val < 1 || val > 20) {
        showToast('Pin limit must be between 1 and 20.', 'error');
        return;
      }
      settings.pinLimit = val;
      /* Trim existing pins if they exceed the new limit */
      const pins = loadPinnedIds();
      if (pins.length > val) {
        savePinnedIds(pins.slice(0, val));
        renderGrid();
      }
      saveSettings();
      showToast('Pin limit updated to ' + val + '.', 'success');
    });
  }

  /* ── Task 19 — Disable CSV/Markdown export buttons when encryption is on ── */
  const csvBtn = document.getElementById('export-csv-btn');
  const mdBtn  = document.getElementById('export-md-btn');
  const hint   = document.getElementById('export-format-hint');
  const isEncrypted = settings.backupEncryption !== 'none';
  if (csvBtn) csvBtn.classList.toggle('disabled-export', isEncrypted);
  if (mdBtn)  mdBtn.classList.toggle('disabled-export', isEncrypted);
  if (hint) hint.textContent = isEncrypted
    ? 'CSV and Markdown exports are unavailable when encryption is enabled.'
    : 'Plain-text formats — not encrypted.';
}


/* ═══════════════════════════════════════════════════════════════
   § 14. TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════════ */

function showToast(msg, type) {
  const toast = dom.toast;
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast toast--' + type + ' toast--show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast--show'), 3000);
}


/* ═══════════════════════════════════════════════════════════════
   § 15. EVENT HANDLERS
═══════════════════════════════════════════════════════════════ */

function handleChipClick(e) {
  const chip      = e.currentTarget;
  const dimension = chip.dataset.dimension;
  const value     = chip.dataset.value;
  if (!dimension || !(dimension in activeFilters)) return;
  activeFilters[dimension] = value;
  syncChipActiveState(dimension, value);
  applyFiltersAndSort();
}

function handleSortChange(e) {
  activeSort = e.target.value;
  applyFiltersAndSort();
}

function handleSearchInput(e) {
  const raw = e.target.value;
  dom.searchClear.hidden = raw.length === 0;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    activeSearch = raw.toLowerCase().trim();
    applyFiltersAndSort();
  }, 300);
}

function handleSearchClear() {
  dom.searchInput.value  = '';
  dom.searchClear.hidden = true;
  activeSearch = '';
  clearTimeout(searchDebounceTimer);
  applyFiltersAndSort();
  dom.searchInput.focus();
}

function handleFilterToggle() {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (isMobile) {
    /* Mobile: slide the panel down/up via .is-open */
    const isOpen   = dom.filterToggle.getAttribute('aria-expanded') === 'true';
    const newState = !isOpen;
    dom.filterToggle.setAttribute('aria-expanded', String(newState));
    dom.filterPanel.classList.toggle('is-open', newState);
    dom.filterPanel.classList.remove('is-hidden');
  } else {
    /* Desktop: toggle sidebar visibility via .is-hidden.
       Panel starts visible. Clicking hides it, clicking again shows it. */
    const isCurrentlyHidden = dom.filterPanel.classList.contains('is-hidden');
    dom.filterPanel.classList.toggle('is-hidden', !isCurrentlyHidden);
    dom.filterToggle.setAttribute('aria-expanded', String(isCurrentlyHidden));
  }
}

function handleOutsideClick(e) {
  /* Close any open custom-select dropdowns when clicking outside them */
  document.querySelectorAll('.custom-select--open').forEach(wrap => {
    if (!wrap.contains(e.target)) closeCustomSelect(wrap);
  });

  /* Close any open date picker dropdowns when clicking outside them */
  document.querySelectorAll('.bingery-dp-dropdown:not([hidden])').forEach(d => {
    if (!d.closest('.bingery-datepicker')?.contains(e.target)) d.hidden = true;
  });

  /* ── Task 22 — Filter panel fix ──
     REMOVED: The old code closed the filter panel whenever the user
     clicked anywhere outside it. This was annoying because selecting
     text, clicking cards, or interacting with other UI elements would
     unexpectedly hide the filters.
     NOW: The filter panel ONLY closes when the user explicitly clicks
     the toggle button (handled by handleFilterToggle). The outside-click
     handler no longer touches the filter panel at all. */
}

function handleOverlayClick(e) {
  if (e.target === dom.modalOverlay) closeModal();
}

function handleFormOverlayClick(e) {
  if (e.target === dom.formOverlay) closeFormModal();
}

function handleSettingsOverlayClick(e) {
  if (e.target === dom.settingsOverlay) closeSettings();
}

function handleImportLabelKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    dom.importDataInput?.click();
  }
}


/* ═══════════════════════════════════════════════════════════════
   § 15.5  THEME IMPORT / EXPORT
   Exports only visual settings as a small shareable JSON snippet.
═══════════════════════════════════════════════════════════════ */

function exportTheme() {
  const themeData = {
    _bingery: 'theme',
    _version: 1,
    themePreset:     settings.themePreset,
    accentColor:     settings.accentColor,
    customBg:        settings.customBg,
    fontScale:       settings.fontScale,
    fontFamily:      settings.fontFamily,
    cardHover:       settings.cardHover,
    animationSpeed:  settings.animationSpeed,
    borderRadius:    settings.borderRadius,
    gridGap:         settings.gridGap,
    shadowIntensity: settings.shadowIntensity,
    cardInfo:        settings.cardInfo,
    statusColors:    settings.statusColors,
    typeColors:      settings.typeColors,
    sidebarPosition: settings.sidebarPosition,
    headerStyle:     settings.headerStyle,
    lineHeight:      settings.lineHeight,
    cardEntrance:    settings.cardEntrance,
    customCSS:       settings.customCSS,
  };
  const blob = new Blob([JSON.stringify(themeData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'bingery-theme-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Theme exported.', 'success');
}

function importTheme(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || data._bingery !== 'theme') {
        showToast('Invalid theme file.', 'error');
        return;
      }
      const themeKeys = [
        'themePreset', 'accentColor', 'customBg', 'fontScale', 'fontFamily',
        'cardHover', 'animationSpeed', 'borderRadius', 'gridGap', 'shadowIntensity',
        'cardInfo', 'statusColors', 'typeColors', 'sidebarPosition', 'headerStyle',
        'lineHeight', 'cardEntrance', 'customCSS'
      ];
      themeKeys.forEach(key => {
        if (data[key] !== undefined) settings[key] = data[key];
      });
      saveSettings();
      applySettings();
      renderGrid();
      showToast('Theme imported.', 'success');
    } catch { showToast('Failed to parse theme file.', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ═══════════════════════════════════════════════════════════════
   § 16. INITIALISATION
═══════════════════════════════════════════════════════════════ */

function bindEvents() {
  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.searchClear.addEventListener('click', handleSearchClear);
  dom.sortSelect.addEventListener('change', handleSortChange);
  dom.filterToggle.addEventListener('click', handleFilterToggle);
  dom.resetFilters.addEventListener('click', resetAll);
  dom.emptyReset.addEventListener('click', resetAll);

  /* Initialise the custom sort-select in the filter sidebar */
  initCustomSelects();

  dom.addBtn.addEventListener('click', () => openFormModal(null));
  dom.emptyLibraryAdd?.addEventListener('click', () => openFormModal(null));

  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', handleOverlayClick);

  dom.formClose.addEventListener('click', closeFormModal);
  dom.formOverlay.addEventListener('click', handleFormOverlayClick);

  dom.settingsBtn.addEventListener('click', openSettings);
  dom.settingsClose.addEventListener('click', closeSettings);
  dom.settingsOverlay.addEventListener('click', handleSettingsOverlayClick);

  dom.toolsBtn.addEventListener('click', openTools);
  dom.toolsClose.addEventListener('click', closeTools);
  dom.toolsOverlay.addEventListener('click', handleToolsOverlayClick);

  dom.settingsDrawer.addEventListener('click', handleSettingToggle);

  dom.accentInput?.addEventListener('input', handleAccentColorChange);
  dom.resetAccentBtn?.addEventListener('click', handleResetAccent);

  dom.exportDataBtn?.addEventListener('click', handleExportData);
  dom.importDataInput?.addEventListener('change', handleImportData);
  dom.resetUserDataBtn?.addEventListener('click', handleResetUserData);

  // Inline reset confirmation
  document.getElementById('reset-cancel-btn')
    ?.addEventListener('click', () => {
      const confirmDiv = document.getElementById('reset-confirm');
      if (confirmDiv) confirmDiv.hidden = true;
      dom.resetUserDataBtn?.focus();
    });
  document.getElementById('reset-confirm-btn')
    ?.addEventListener('click', performResetUserData);

  document.getElementById('import-data-label')
    ?.addEventListener('keydown', handleImportLabelKeydown);

  document.addEventListener('click', handleOutsideClick, { passive: true });

  /* ── Settings tabs — switch between General / Themes / Library panels ──
     Uses the data-panel attribute on tab buttons to match panel IDs.
     Syncs toggle active states whenever a panel becomes visible. */
  document.getElementById('settings-drawer')?.addEventListener('click', e => {
    const tab = e.target.closest('.settings-tab[data-panel]');
    if (!tab) return;
    const panelId = tab.dataset.panel;
    document.querySelectorAll('.settings-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.panel === panelId);
      t.setAttribute('aria-selected', t.dataset.panel === panelId ? 'true' : 'false');
    });
    document.querySelectorAll('.settings-tab-panel').forEach(p => {
      p.hidden = p.id !== 'settings-panel-' + panelId;
    });
    if (panelId === 'library') renderLibraryTab();
    /* Re-sync toggle highlights and colour pickers whenever switching tabs
       so the UI always reflects the current settings state */
    syncSettingsToggles();
    applySettings();
  });

  // Library tag list — remove buttons
  document.getElementById('types-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.library-tag-remove[data-list="types"]');
    if (!btn) return;
    const val = btn.dataset.value;
    MEDIA_TYPES = MEDIA_TYPES.filter(t => t !== val);
    saveLibraryConfig();
    renderLibraryTab();
    populateFilters();
  });
  document.getElementById('statuses-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.library-tag-remove[data-list="statuses"]');
    if (!btn) return;
    const val = btn.dataset.value;
    MEDIA_STATUSES = MEDIA_STATUSES.filter(s => s !== val);
    saveLibraryConfig();
    renderLibraryTab();
    populateFilters();
  });

  // Library add buttons
  document.getElementById('types-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('types-add-input');
    const val   = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    if (MEDIA_TYPES.includes(val)) { showToast('"' + val + '" already exists.', 'error'); input?.focus(); return; }
    MEDIA_TYPES.push(val);
    saveLibraryConfig();
    renderLibraryTab();
    populateFilters();
    if (input) input.value = '';
  });
  document.getElementById('statuses-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('statuses-add-input');
    const val   = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    if (MEDIA_STATUSES.includes(val)) { showToast('"' + val + '" already exists.', 'error'); input?.focus(); return; }
    MEDIA_STATUSES.push(val);
    saveLibraryConfig();
    renderLibraryTab();
    populateFilters();
    if (input) input.value = '';
  });
  document.getElementById('types-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('types-add-btn')?.click();
  });
  document.getElementById('statuses-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('statuses-add-btn')?.click();
  });

  /* ── Task 1 — Relationship types add/remove in Library tab ── */
  document.getElementById('relations-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.library-tag-remove[data-list="relations"]');
    if (!btn) return;
    const val = btn.dataset.value;
    settings.relationshipTypes = settings.relationshipTypes.filter(r => r !== val);
    saveSettings();
    renderLibraryTab();
  });
  document.getElementById('relations-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('relations-add-input');
    const val   = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    if (settings.relationshipTypes.includes(val)) { showToast('"' + val + '" already exists.', 'error'); input?.focus(); return; }
    settings.relationshipTypes.push(val);
    saveSettings();
    renderLibraryTab();
    if (input) input.value = '';
  });
  document.getElementById('relations-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('relations-add-btn')?.click();
  });

  /* ── Sub-rating dimensions add/remove ── */
  document.getElementById('subdims-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.library-tag-remove[data-list="subdims"]');
    if (!btn) return;
    const val = btn.dataset.value;
    if (!settings.ratingDimensions) settings.ratingDimensions = DEFAULT_RATING_DIMENSIONS.slice();
    settings.ratingDimensions = settings.ratingDimensions.filter(d => d !== val);
    /* Also remove the corresponding weight entry */
    if (settings.ratingWeights) delete settings.ratingWeights[val];
    saveSettings();
    renderLibraryTab();
  });
  document.getElementById('subdims-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('subdims-add-input');
    const val   = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    if (!settings.ratingDimensions) settings.ratingDimensions = DEFAULT_RATING_DIMENSIONS.slice();
    if (settings.ratingDimensions.includes(val)) { showToast('"' + val + '" already exists.', 'error'); input?.focus(); return; }
    settings.ratingDimensions.push(val);
    /* Add a default weight of 1 for the new dimension */
    if (!settings.ratingWeights) settings.ratingWeights = {};
    settings.ratingWeights[val] = 1;
    saveSettings();
    renderLibraryTab();
    if (input) input.value = '';
  });
  document.getElementById('subdims-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('subdims-add-btn')?.click();
  });

  /* ── Custom detail fields add/remove ── */
  document.getElementById('custom-fields-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.library-tag-remove[data-list="customFields"]');
    if (!btn) return;
    const val = btn.dataset.value;
    if (!settings.customFields) settings.customFields = [];
    settings.customFields = settings.customFields.filter(f => f !== val);
    saveSettings();
    renderLibraryTab();
  });
  document.getElementById('custom-fields-add-btn')?.addEventListener('click', () => {
    const input = document.getElementById('custom-fields-add-input');
    const val   = (input?.value || '').trim();
    if (!val) { input?.focus(); return; }
    if (!settings.customFields) settings.customFields = [];
    if (settings.customFields.includes(val)) { showToast('"' + val + '" already exists.', 'error'); input?.focus(); return; }
    settings.customFields.push(val);
    saveSettings();
    renderLibraryTab();
    if (input) input.value = '';
  });
  document.getElementById('custom-fields-add-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('custom-fields-add-btn')?.click();
  });

  /* ── Custom background colour pickers ── */
  ['bg-primary-input', 'bg-secondary-input', 'bg-elevated-input'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      if (!settings.customBg) settings.customBg = {};
      const key = id === 'bg-primary-input' ? 'primary' : id === 'bg-secondary-input' ? 'secondary' : 'elevated';
      settings.customBg[key] = e.target.value;
      saveSettings();
      applySettings();
    });
  });
  document.getElementById('reset-custom-bg-btn')?.addEventListener('click', () => {
    settings.customBg = null;
    saveSettings();
    applySettings();
  });

  /* ── Custom status colour pickers ── */
  ['sc-completed', 'sc-inprogress', 'sc-dropped', 'sc-planned'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      if (!settings.statusColors) settings.statusColors = {};
      const key = id === 'sc-completed' ? 'completed' : id === 'sc-inprogress' ? 'inProgress' : id === 'sc-dropped' ? 'dropped' : 'planned';
      settings.statusColors[key] = e.target.value;
      saveSettings();
      applySettings();
    });
  });
  document.getElementById('reset-status-colors-btn')?.addEventListener('click', () => {
    settings.statusColors = null;
    saveSettings();
    applySettings();
  });

  /* ── Custom type badge colour pickers ── */
  document.getElementById('type-colors-row')?.addEventListener('input', e => {
    const inp = e.target.closest('input[type="color"][data-type]');
    if (!inp) return;
    if (!settings.typeColors) settings.typeColors = {};
    settings.typeColors[inp.dataset.type] = inp.value;
    saveSettings();
    applySettings();
  });
  document.getElementById('reset-type-colors-btn')?.addEventListener('click', () => {
    settings.typeColors = null;
    saveSettings();
    applySettings();
  });

  /* ── Card info density checkboxes ── */
  document.getElementById('card-info-toggles')?.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"][data-info]');
    if (!cb) return;
    if (!settings.cardInfo) settings.cardInfo = { author: true, rating: true, statusDot: true, progressBar: true };
    settings.cardInfo[cb.dataset.info] = cb.checked;
    saveSettings();
    applySettings();
  });

  /* ── Custom CSS textarea ── */
  document.getElementById('custom-css-textarea')?.addEventListener('input', e => {
    settings.customCSS = e.target.value;
    saveSettings();
    applySettings();
  });

  /* ── Theme export / import ── */
  document.getElementById('export-theme-btn')?.addEventListener('click', exportTheme);
  document.getElementById('import-theme-input')?.addEventListener('change', importTheme);

  document.addEventListener('contextmenu', e => {
    // Allow context menus on editable elements for accessibility (spell-check, copy, etc.)
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    e.preventDefault();
  });
  /* ── Task 15 — Ctrl+Z Undo ──
     Listens for Ctrl+Z (or Cmd+Z on Mac) and pops the most recent
     undo snapshot from the stack. Only works outside text fields
     to avoid conflicting with normal text editing undo. */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

    /* Ctrl+Z / Cmd+Z — Undo */
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !inField) {
      e.preventDefault();
      popUndo();
      return;
    }

    /* Ctrl+Y / Cmd+Y — Redo
       Re-applies the last undone action. Only fires when the user is NOT
       focused inside a text input or textarea (to avoid conflicting with
       browser-native redo inside form fields). */
    if ((e.ctrlKey || e.metaKey) && e.key === 'y' && !inField) {
      e.preventDefault();
      popRedo();
      return;
    }

    /* Ctrl+S — Prevent browser save dialog */
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !inField) {
      e.preventDefault();
    }

    /* "/" — Focus search input */
    if (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
    }
  });

  /* ── Tool buttons — now in the Tools drawer, not settings ──
     Each button closes the tools panel, then opens the relevant modal. */
  document.getElementById('btn-statistics')?.addEventListener('click', () => { closeTools(); openStatistics(); });
  document.getElementById('btn-activity-log')?.addEventListener('click', () => { closeTools(); openActivityLog(); });
  document.getElementById('btn-comparison')?.addEventListener('click', () => { closeTools(); openComparisonView(); });
  document.getElementById('btn-recommendations')?.addEventListener('click', () => { closeTools(); openRecommendations(); });
  document.getElementById('btn-roulette')?.addEventListener('click', () => { closeTools(); openRouletteWheel(); });
  document.getElementById('btn-weighted-picker')?.addEventListener('click', () => { closeTools(); openWeightedPicker(); });
  document.getElementById('btn-merge-dupes')?.addEventListener('click', () => { closeTools(); openDuplicateMerger(); });

  /* ── Task 19 — Export as CSV / Markdown buttons ── */
  document.getElementById('export-csv-btn')?.addEventListener('click', exportAsCSV);
  document.getElementById('export-md-btn')?.addEventListener('click', exportAsMarkdown);

  /* ── Bulk Select toggle and toolbar actions ── */
  document.getElementById('bulk-select-btn')?.addEventListener('click', () => {
    if (bulkSelectMode) exitBulkSelect(); else enterBulkSelect();
  });
  document.getElementById('bulk-cancel-btn')?.addEventListener('click', exitBulkSelect);
  document.getElementById('bulk-status-btn')?.addEventListener('click', bulkChangeStatus);
  document.getElementById('bulk-type-btn')?.addEventListener('click', bulkChangeType);
  document.getElementById('bulk-delete-btn')?.addEventListener('click', bulkDelete);
}

/* ═══════════════════════════════════════════════════════════════
   § 17. COMPARISON VIEW  (Task 6)
   Lets the user select two entries side-by-side and compare their
   stats, ratings, genres, episode counts, and notes in a split-
   screen layout. Opened from a "Compare" button in the header.
═══════════════════════════════════════════════════════════════ */

function openComparisonView() {
  /* Build entry list for the two selectors */
  const options = allMedia.map(m => m.title);
  if (options.length < 2) { showToast('Need at least 2 entries to compare.', 'info'); return; }

  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  content.innerHTML =
    '<h2 class="modal-title">Compare Entries</h2>' +
    '<div class="compare-selectors">' +
      '<div class="compare-selector">' +
        '<label class="form-label">Entry A</label>' +
        buildCustomSelectHTML('compare-a', 'compareA', options, options[0]) +
      '</div>' +
      '<div class="compare-selector">' +
        '<label class="form-label">Entry B</label>' +
        buildCustomSelectHTML('compare-b', 'compareB', options, options.length > 1 ? options[1] : options[0]) +
      '</div>' +
    '</div>' +
    '<button type="button" class="btn-primary" id="compare-go-btn" style="margin:var(--space-4) 0">Compare</button>' +
    '<div id="compare-result"></div>';

  initCustomSelects();

  document.getElementById('compare-go-btn')?.addEventListener('click', () => {
    const titleA = document.getElementById('compare-a')?.value;
    const titleB = document.getElementById('compare-b')?.value;
    const a = allMedia.find(m => m.title === titleA);
    const b = allMedia.find(m => m.title === titleB);
    if (!a || !b) { showToast('Select two valid entries.', 'error'); return; }
    document.getElementById('compare-result').innerHTML = buildComparisonHTML(a, b);
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}

/* ── Build the side-by-side comparison HTML ── */
function buildComparisonHTML(a, b) {
  function row(label, valA, valB) {
    const highlight = valA !== valB ? ' compare-diff' : '';
    return '<tr class="compare-row' + highlight + '">' +
      '<td class="compare-val">' + escapeHTML(valA) + '</td>' +
      '<td class="compare-label">' + escapeHTML(label) + '</td>' +
      '<td class="compare-val">' + escapeHTML(valB) + '</td>' +
    '</tr>';
  }
  return '<table class="compare-table">' +
    '<thead><tr><th>' + escapeHTML(a.title) + '</th><th></th><th>' + escapeHTML(b.title) + '</th></tr></thead>' +
    '<tbody>' +
      row('Type', a.type || '—', b.type || '—') +
      row('Status', a.status || '—', b.status || '—') +
      row('Rating', formatScore(a.rating || 0), formatScore(b.rating || 0)) +
      row('Episodes', (a.totalEpisodes || '—') + '', (b.totalEpisodes || '—') + '') +
      row('Progress', (a.watchedEpisodes || 0) + '/' + (a.totalEpisodes || '?'), (b.watchedEpisodes || 0) + '/' + (b.totalEpisodes || '?')) +
      row('Genres', (a.genres || []).join(', ') || '—', (b.genres || []).join(', ') || '—') +
      row('Author', a.author || '—', b.author || '—') +
      row('Started', formatDate(a.dateStarted), formatDate(b.dateStarted)) +
      row('Finished', formatDate(a.dateFinished), formatDate(b.dateFinished)) +
      row('Rewatches', (a.rewatchCount || 0) + '', (b.rewatchCount || 0) + '') +
    '</tbody>' +
  '</table>';
}


/* ═══════════════════════════════════════════════════════════════
   § 18. BACKLOG ROULETTE WHEEL  (Task 9)
   A fun spinning wheel animation that picks from Planned entries.
   Optionally weighted by genre or rating so it biases toward
   entries the user is more likely to enjoy.
═══════════════════════════════════════════════════════════════ */

function openRouletteWheel() {
  const planned = allMedia.filter(m => m.status === 'Planned');
  if (planned.length === 0) { showToast('No Planned entries to pick from!', 'info'); return; }

  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  /* ── Build the visual wheel with coloured segments ──
     Each segment gets a slice of the 360-degree circle. We show
     up to 12 labels on the wheel; the rest are coloured segments
     without text to keep the wheel readable. */
  const SEGMENT_COLORS = [
    'var(--type-anime)', 'var(--type-manga)', 'var(--type-manhwa)',
    'var(--type-manhua)', 'var(--type-book)', 'var(--type-movie)',
    'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--danger)',
    '#7c5cbf', '#3b9c9c',
  ];

  /* Build conic-gradient stops for the wheel segments */
  const segCount = Math.min(planned.length, 24);
  const segAngle = 360 / segCount;
  let gradStops = [];
  for (let i = 0; i < segCount; i++) {
    const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
    gradStops.push(color + ' ' + (i * segAngle) + 'deg ' + ((i + 1) * segAngle) + 'deg');
  }
  const conicGrad = 'conic-gradient(' + gradStops.join(', ') + ')';

  /* Build label elements positioned around the wheel */
  const maxLabels = Math.min(segCount, 12);
  let labelsHTML = '';
  for (let i = 0; i < maxLabels; i++) {
    const angle = (i * segAngle) + (segAngle / 2);
    const labelText = planned[i].title.length > 14 ? planned[i].title.slice(0, 12) + '..' : planned[i].title;
    labelsHTML += '<div class="roulette-label" style="--angle:' + angle + 'deg"><span>' + escapeHTML(labelText) + '</span></div>';
  }

  content.innerHTML =
    '<h2 class="modal-title">Backlog Roulette</h2>' +
    '<p class="modal-section-text" style="margin-bottom:var(--space-4)">Spin the wheel to pick your next watch from ' + planned.length + ' planned entries!</p>' +
    '<div class="roulette-wheel-container">' +
      '<div class="roulette-pointer-top">\u25BC</div>' +
      '<div class="roulette-wheel" id="roulette-wheel" style="background:' + conicGrad + '">' +
        '<div class="roulette-center-dot"></div>' +
        labelsHTML +
      '</div>' +
    '</div>' +
    '<div class="roulette-controls">' +
      '<label class="form-label"><input type="checkbox" class="bingery-checkbox" id="roulette-weighted"/> Bias toward genres I like</label>' +
      '<button type="button" class="btn-primary" id="roulette-spin-btn">Spin!</button>' +
    '</div>' +
    '<div id="roulette-result" class="roulette-result" hidden></div>';

  document.getElementById('roulette-spin-btn')?.addEventListener('click', function spinHandler() {
    const btn     = document.getElementById('roulette-spin-btn');
    const wheel   = document.getElementById('roulette-wheel');
    const result  = document.getElementById('roulette-result');
    const weighted = document.getElementById('roulette-weighted')?.checked;
    if (!wheel || !btn) return;

    /* Disable the button during spin */
    btn.disabled = true;
    btn.textContent = 'Spinning\u2026';

    /* Build pool, optionally weighted by recommendations */
    let pool = planned.slice();
    if (weighted) {
      const recs = getRecommendations();
      if (recs.length > 0) pool = recs.map(r => r.entry);
    }

    /* Pick a random winner and calculate the landing angle */
    const winnerIdx  = Math.floor(Math.random() * pool.length);
    const winner     = pool[winnerIdx];
    const winSegment = winnerIdx % segCount;
    /* Angle to centre of the winning segment, measured from top */
    const targetAngle = 360 - ((winSegment * segAngle) + (segAngle / 2));
    /* Add several full rotations (4-7) for dramatic effect + the target angle */
    const fullSpins   = (4 + Math.floor(Math.random() * 4)) * 360;

    /* Reset wheel to its current angle mod 360 without animation,
       so the next spin always covers the full rotation distance */
    const prevAngle = parseFloat(wheel.style.transform.replace(/[^0-9.\-]/g, '')) || 0;
    const baseAngle = prevAngle % 360;
    wheel.style.transition = 'none';
    wheel.style.transform  = 'rotate(' + baseAngle + 'deg)';
    void wheel.offsetHeight; /* force reflow before re-enabling transition */

    const finalAngle = baseAngle + fullSpins + targetAngle;

    /* Apply CSS rotation with ease-out transition for deceleration */
    wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform  = 'rotate(' + finalAngle + 'deg)';

    /* After the spin animation completes, show the result */
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Spin Again!';
      if (result) {
        result.hidden = false;
        /* Truncate long titles at 148 characters with ellipsis */
        const displayTitle = winner.title.length > 148
          ? winner.title.slice(0, 148) + '\u2026'
          : winner.title;
        result.innerHTML =
          '<p class="roulette-winner-title">' + escapeHTML(displayTitle) + '</p>' +
          '<p class="roulette-winner-meta">' + escapeHTML(winner.type || '') + ' \u00b7 ' + (winner.totalEpisodes || '?') + ' episodes \u00b7 ' + (winner.genres || []).slice(0, 3).join(', ') + '</p>' +
          '<button type="button" class="btn-primary" id="roulette-view-btn">View Entry</button>';
        document.getElementById('roulette-view-btn')?.addEventListener('click', () => {
          closeModal();
          openModal(winner.id);
        });
      }
    }, 4200);
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 19. WEIGHTED RANDOM PICKER WITH EXCLUSIONS  (Task 16)
   A smarter random than pure shuffle — users can set rules like
   "nothing longer than 24 episodes", "only stuff added recently",
   or filter by genre before picking.
═══════════════════════════════════════════════════════════════ */

function openWeightedPicker() {
  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  const genreSet = new Set();
  allMedia.forEach(m => (m.genres || []).forEach(g => genreSet.add(g)));
  const genres = Array.from(genreSet).sort();

  content.innerHTML =
    '<h2 class="modal-title">Smart Random Picker</h2>' +
    '<p class="modal-section-text" style="margin-bottom:var(--space-4)">Set your rules, then let fate decide.</p>' +
    '<div class="form-grid">' +
      '<div class="form-group">' +
        '<label for="picker-max-eps">Max Episodes</label>' +
        '<input type="number" id="picker-max-eps" class="form-input" placeholder="No limit" min="1"/>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="picker-status-btn">Status</label>' +
        buildCustomSelectHTML('picker-status', 'pickerStatus', ['Any'].concat(MEDIA_STATUSES), 'Planned') +
      '</div>' +
      '<div class="form-group">' +
        '<label for="picker-genre-btn">Genre</label>' +
        buildCustomSelectHTML('picker-genre', 'pickerGenre', ['Any'].concat(genres), 'Any') +
      '</div>' +
      '<div class="form-group">' +
        '<label for="picker-months">Added within (months)</label>' +
        '<input type="number" id="picker-months" class="form-input" placeholder="Any time" min="1"/>' +
      '</div>' +
      '<div class="form-group form-group--full">' +
        '<label><input type="checkbox" id="picker-no-sequels" class="bingery-checkbox"/> Skip sequels (unless prequel completed)</label>' +
      '</div>' +
    '</div>' +
    '<button type="button" class="btn-primary" id="picker-go-btn" style="margin:var(--space-4) 0">Pick One</button>' +
    '<div id="picker-result"></div>';

  initCustomSelects();

  document.getElementById('picker-go-btn')?.addEventListener('click', () => {
    let pool = allMedia.slice();
    const maxEps   = parseInt(document.getElementById('picker-max-eps')?.value || '0', 10);
    const status   = document.getElementById('picker-status')?.value;
    const genre    = document.getElementById('picker-genre')?.value;
    const months   = parseInt(document.getElementById('picker-months')?.value || '0', 10);
    const noSeq    = document.getElementById('picker-no-sequels')?.checked;

    if (status && status !== 'Any') pool = pool.filter(m => m.status === status);
    if (genre && genre !== 'Any')   pool = pool.filter(m => (m.genres || []).includes(genre));
    if (maxEps > 0)                 pool = pool.filter(m => !m.totalEpisodes || m.totalEpisodes <= maxEps);
    if (months > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      pool = pool.filter(m => m.dateAdded && new Date(m.dateAdded) >= cutoff);
    }
    if (noSeq) {
      pool = pool.filter(m => {
        if (!m.linkedEntries) return true;
        return !m.linkedEntries.some(le => {
          if (le.relationship !== 'Sequel') return false;
          const prequel = allMedia.find(x => x.id === le.entryId);
          return prequel && prequel.status !== 'Completed';
        });
      });
    }

    const resultEl = document.getElementById('picker-result');
    if (pool.length === 0) {
      if (resultEl) resultEl.innerHTML = '<p class="modal-section-text">No entries match your rules. Try relaxing some filters.</p>';
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (resultEl) {
      resultEl.innerHTML =
        '<div class="picker-result-card">' +
          '<p class="roulette-winner-title">' + escapeHTML(pick.title) + '</p>' +
          '<p class="roulette-winner-meta">' + escapeHTML(pick.type || '') + ' · ' + (pick.totalEpisodes || '?') + ' eps · ' + (pick.genres || []).slice(0, 3).join(', ') + '</p>' +
          '<button type="button" class="btn-primary" id="picker-view-btn">View Details</button>' +
        '</div>';
      document.getElementById('picker-view-btn')?.addEventListener('click', () => {
        closeModal();
        openModal(pick.id);
      });
    }
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 20. SMART DUPLICATE MERGING  (Task 18)
   If two entries exist for the same show, this tool merges the
   most complete data from both: keeping the higher episode count,
   longer review, earliest start date, etc.
═══════════════════════════════════════════════════════════════ */

function openDuplicateMerger() {
  /* Find potential duplicates */
  const dupes = [];
  for (let i = 0; i < allMedia.length; i++) {
    for (let j = i + 1; j < allMedia.length; j++) {
      if (titlesAreSimilar(allMedia[i].title, allMedia[j].title)) {
        dupes.push([allMedia[i], allMedia[j]]);
      }
    }
  }

  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  if (dupes.length === 0) {
    content.innerHTML =
      '<h2 class="modal-title">Duplicate Merger</h2>' +
      '<p class="modal-section-text">No potential duplicates found in your library.</p>';
  } else {
    content.innerHTML =
      '<h2 class="modal-title">Duplicate Merger</h2>' +
      '<p class="modal-section-text" style="margin-bottom:var(--space-4)">Found ' + dupes.length + ' potential duplicate pair(s).</p>' +
      dupes.map(([a, b], idx) =>
        '<div class="merge-pair" data-idx="' + idx + '">' +
          '<div class="merge-entry"><strong>' + escapeHTML(a.title) + '</strong><br>' +
            escapeHTML(a.type || '') + ' · Rating: ' + formatScore(a.rating || 0) + ' · Eps: ' + (a.watchedEpisodes || 0) + '/' + (a.totalEpisodes || '?') +
          '</div>' +
          '<div class="merge-vs">VS</div>' +
          '<div class="merge-entry"><strong>' + escapeHTML(b.title) + '</strong><br>' +
            escapeHTML(b.type || '') + ' · Rating: ' + formatScore(b.rating || 0) + ' · Eps: ' + (b.watchedEpisodes || 0) + '/' + (b.totalEpisodes || '?') +
          '</div>' +
          '<button type="button" class="btn-primary merge-btn" data-a="' + escapeHTML(a.id) + '" data-b="' + escapeHTML(b.id) + '">Merge (keep best data)</button>' +
        '</div>'
      ).join('');

    content.querySelectorAll('.merge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const aId = btn.dataset.a;
        const bId = btn.dataset.b;
        const a = allMedia.find(m => m.id === aId);
        const b = allMedia.find(m => m.id === bId);
        if (!a || !b) return;
        pushUndo('Merge: ' + a.title + ' + ' + b.title);
        /* Merge strategy: keep the most complete data */
        const merged = Object.assign({}, a);
        merged.rating = Math.max(a.rating || 0, b.rating || 0);
        merged.totalEpisodes = Math.max(a.totalEpisodes || 0, b.totalEpisodes || 0) || null;
        merged.watchedEpisodes = Math.max(a.watchedEpisodes || 0, b.watchedEpisodes || 0) || null;
        merged.personalReview = (a.personalReview || '').length >= (b.personalReview || '').length ? a.personalReview : b.personalReview;
        merged.notes = (a.notes || '').length >= (b.notes || '').length ? a.notes : b.notes;
        merged.synopsis = (a.synopsis || '').length >= (b.synopsis || '').length ? a.synopsis : b.synopsis;
        merged.dateStarted = [a.dateStarted, b.dateStarted].filter(Boolean).sort()[0] || null;
        merged.dateFinished = [a.dateFinished, b.dateFinished].filter(Boolean).sort().pop() || null;
        merged.genres = Array.from(new Set([...(a.genres || []), ...(b.genres || [])]));
        merged.cover = a.cover || b.cover;
        merged.author = a.author || b.author;
        merged.rewatchCount = Math.max(a.rewatchCount || 0, b.rewatchCount || 0);

        /* Save merged as edit of A, delete B */
        if (baseMediaIds.has(aId)) storageData.edited[aId] = merged;
        else {
          const idx = storageData.added.findIndex(m => m.id === aId);
          if (idx !== -1) storageData.added[idx] = merged;
        }
        if (baseMediaIds.has(bId)) { if (!storageData.deleted.includes(bId)) storageData.deleted.push(bId); }
        else storageData.added = storageData.added.filter(m => m.id !== bId);

        saveStorageData();
        refreshLibrary();
        btn.closest('.merge-pair').remove();
        showToast('Merged into "' + merged.title + '".', 'success');
      });
    });
  }

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 21. EXPORT AS CSV / MARKDOWN  (Task 19)
   Extends the export system with CSV and Markdown formats.
   If encryption is enabled and the format doesn't support it,
   the buttons are visually disabled.
═══════════════════════════════════════════════════════════════ */

/* ── Export as CSV ──
   Generates a full CSV file containing every entry in the library.
   Dynamically discovers custom field names across all entries so that
   user-defined fields appear as additional columns. Includes a BOM
   prefix (\uFEFF) so Excel opens the file with proper UTF-8 encoding.
   Fields containing commas, quotes, or newlines are properly escaped
   by wrapping every value in double-quotes with internal quotes doubled. */
function exportAsCSV() {
  /* Collect all custom field names across the library */
  const customFieldNames = new Set();
  allMedia.forEach(m => {
    if (m.customFields) Object.keys(m.customFields).forEach(k => customFieldNames.add(k));
  });
  const cfNames = [...customFieldNames].sort();

  const headers = [
    'Title', 'Alt Title', 'Type', 'Status', 'Rating',
    'Genres', 'Author', 'Total Episodes', 'Watched Episodes',
    'Completion %', 'Date Started', 'Date Finished', 'Date Added',
    'Rewatches', 'Rewatch Dates',
    'Synopsis', 'Review', 'Notes',
    ...cfNames
  ];

  const rows = allMedia.map(m => {
    const completion = (m.totalEpisodes && m.totalEpisodes > 0)
      ? Math.round((m.watchedEpisodes || 0) / m.totalEpisodes * 100) + '%'
      : '';
    const cfValues = cfNames.map(name =>
      (m.customFields && m.customFields[name]) || ''
    );
    return [
      m.title, m.alternativeTitle || '', m.type, m.status, m.rating || 0,
      (m.genres || []).join('; '), m.author || '',
      m.totalEpisodes || '', m.watchedEpisodes || '',
      completion,
      m.dateStarted || '', m.dateFinished || '', m.dateAdded || '',
      m.rewatchCount || 0,
      (m.rewatchDates || []).join('; '),
      (m.synopsis || '').replace(/"/g, '""'),
      (m.personalReview || '').replace(/"/g, '""'),
      (m.notes || '').replace(/"/g, '""'),
      ...cfValues
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
  });

  /* BOM prefix for proper Unicode display in Excel */
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'bingery-library-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported ' + allMedia.length + ' entries as CSV.', 'success');
  logActivity('Exported library as CSV (' + allMedia.length + ' entries)');
}

/* ── Export as Markdown ──
   Generates a structured Markdown document with three main sections:
   1. Overview — total entry count, breakdown by status and type
   2. Type-grouped summary tables — entries sorted by rating within
      each media type, showing progress percentages and authors
   3. Detailed entries — full information for each entry including
      sub-ratings, custom fields, episode notes, and reviews.
   Pipe characters in fields are escaped so they don't break tables. */
function exportAsMarkdown() {
  const date = new Date().toISOString().slice(0, 10);
  const total = allMedia.length;
  const byStatus = {};
  const byType = {};
  allMedia.forEach(m => {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byType[m.type]     = (byType[m.type] || 0) + 1;
  });

  let md = '# Bingery Library Export\n\n';
  md += '> Exported on ' + date + ' — **' + total + '** entries\n\n';

  /* Statistics summary */
  md += '## Overview\n\n';
  md += '| Statistic | Value |\n|---|---|\n';
  Object.entries(byStatus).forEach(([s, c]) => { md += '| ' + s + ' | ' + c + ' |\n'; });
  md += '| **Total** | **' + total + '** |\n\n';

  md += '**By Type:** ' + Object.entries(byType).map(([t, c]) => t + ' (' + c + ')').join(', ') + '\n\n';
  md += '---\n\n';

  /* Group entries by type */
  const grouped = {};
  allMedia.forEach(m => {
    const t = m.type || 'Other';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  });

  /* Summary table per type group */
  Object.entries(grouped).sort().forEach(([type, items]) => {
    md += '## ' + type + ' (' + items.length + ')\n\n';
    md += '| # | Title | Status | Rating | Progress | Author |\n';
    md += '|--:|-------|--------|-------:|----------|--------|\n';
    items.sort((a, b) => (b.rating || 0) - (a.rating || 0)).forEach((m, i) => {
      const progress = m.totalEpisodes
        ? (m.watchedEpisodes || 0) + '/' + m.totalEpisodes +
          ' (' + Math.round(((m.watchedEpisodes || 0) / m.totalEpisodes) * 100) + '%)'
        : '—';
      const ratingStr = m.rating ? formatScore(m.rating) : '—';
      const title = m.title || 'Untitled';
      /* Escape pipe characters in fields so they don't break the table */
      md += '| ' + (i + 1) + ' | ' + title.replace(/\|/g, '\\|') +
        ' | ' + (m.status || '') +
        ' | ' + ratingStr +
        ' | ' + progress +
        ' | ' + (m.author || '—').replace(/\|/g, '\\|') + ' |\n';
    });
    md += '\n';
  });

  md += '---\n\n';

  /* Detailed entry sections */
  md += '## Detailed Entries\n\n';
  allMedia.forEach(m => {
    md += '### ' + (m.title || 'Untitled') + '\n\n';
    const meta = [];
    if (m.alternativeTitle) meta.push('**Alt Title:** ' + m.alternativeTitle);
    if (m.type)             meta.push('**Type:** ' + m.type);
    if (m.status)           meta.push('**Status:** ' + m.status);
    if (m.rating)           meta.push('**Rating:** ' + formatScore(m.rating));
    if (m.author)           meta.push('**Author:** ' + m.author);
    if (m.genres && m.genres.length) meta.push('**Genres:** ' + m.genres.join(', '));
    if (m.totalEpisodes)    meta.push('**Progress:** ' + (m.watchedEpisodes || 0) + '/' + m.totalEpisodes);
    if (m.dateStarted)      meta.push('**Started:** ' + m.dateStarted);
    if (m.dateFinished)     meta.push('**Finished:** ' + m.dateFinished);
    if (m.dateAdded)        meta.push('**Added:** ' + m.dateAdded);
    if (m.rewatchCount)     meta.push('**Rewatches:** ' + m.rewatchCount);
    if (m.rewatchDates && m.rewatchDates.length) meta.push('**Rewatch Dates:** ' + m.rewatchDates.join(', '));
    if (meta.length) md += meta.join(' · ') + '\n\n';

    /* Sub-ratings */
    if (m.subRatings && Object.keys(m.subRatings).length > 0) {
      md += '**Sub-Ratings:** ' + Object.entries(m.subRatings).map(([k, v]) => k + ': ' + formatScore(v)).join(', ') + '\n\n';
    }

    if (m.synopsis) md += '**Synopsis**\n\n' + m.synopsis + '\n\n';
    if (m.personalReview) md += '**Review**\n\n' + m.personalReview + '\n\n';
    if (m.notes) md += '> **Notes:** ' + m.notes + '\n\n';

    /* Custom fields */
    if (m.customFields && Object.keys(m.customFields).length > 0) {
      Object.entries(m.customFields).forEach(([k, v]) => {
        md += '**' + k + ':** ' + v + '\n\n';
      });
    }

    /* Episode notes */
    if (m.episodeNotes && m.episodeNotes.length > 0) {
      md += '**Episode Notes:**\n\n';
      m.episodeNotes.forEach(en => {
        md += '- Ep ' + en.episode + ': ' + en.note + '\n';
      });
      md += '\n';
    }

    md += '---\n\n';
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'bingery-library-' + date + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported ' + total + ' entries as Markdown.', 'success');
  logActivity('Exported library as Markdown (' + total + ' entries)');
}




/* ═══════════════════════════════════════════════════════════════
   § 23. LIBRARY STATISTICS  (Task 21)
   Computes and displays detailed statistics about the library:
   total entries, completion rate, average rating, genre breakdown,
   total watch time, most rewatched, etc.
═══════════════════════════════════════════════════════════════ */

function openStatistics() {
  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  const total     = allMedia.length;
  const completed = allMedia.filter(m => m.status === 'Completed').length;
  const inProg    = allMedia.filter(m => m.status === 'In Progress').length;
  const planned   = allMedia.filter(m => m.status === 'Planned').length;
  const dropped   = allMedia.filter(m => m.status === 'Dropped').length;

  const rated = allMedia.filter(m => m.rating > 0);
  const avgRatingInternal = rated.length > 0
    ? rated.reduce((sum, m) => sum + m.rating, 0) / rated.length
    : 0;
  const avgRating = rated.length > 0 ? formatScore(avgRatingInternal) : '\u2014';

  /* Genre frequency */
  const genreMap = {};
  allMedia.forEach(m => (m.genres || []).forEach(g => { genreMap[g] = (genreMap[g] || 0) + 1; }));
  const topGenres = Object.entries(genreMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  /* Type distribution */
  const typeMap = {};
  allMedia.forEach(m => { typeMap[m.type || 'Unknown'] = (typeMap[m.type || 'Unknown'] || 0) + 1; });
  const typeEntries = Object.entries(typeMap).sort((a, b) => b[1] - a[1]);

  /* Total watch time estimate */
  let totalMins = 0;
  allMedia.forEach(m => {
    const eps = m.watchedEpisodes || 0;
    const type = (m.type || '').toLowerCase();
    if (type === 'anime') totalMins += eps * 23;
    else if (['manga', 'manhwa', 'manhua'].includes(type)) totalMins += eps * 5;
    else if (type === 'movie') totalMins += eps * 90;
    else totalMins += eps * 23;
  });
  const totalHours = Math.round(totalMins / 60);
  const totalDays  = (totalMins / 1440).toFixed(1);

  /* Backlog time */
  let backlogMins = 0;
  allMedia.filter(m => m.status === 'Planned' || m.status === 'In Progress').forEach(m => {
    const est = estimateTimeRemaining(m);
    if (est) backlogMins += est.total;
  });
  const backlogHours = Math.round(backlogMins / 60);

  /* Total episodes watched */
  const totalEpsWatched = allMedia.reduce((s, m) => s + (m.watchedEpisodes || 0), 0);

  /* Rating distribution (1-10) */
  const ratingBuckets = new Array(10).fill(0);
  allMedia.forEach(m => {
    if (m.rating > 0) {
      const bucket = Math.min(9, Math.max(0, Math.ceil(m.rating) - 1));
      ratingBuckets[bucket]++;
    }
  });
  const maxBucket = Math.max(1, ...ratingBuckets);

  /* Most rewatched */
  const mostRewatched = allMedia.filter(m => m.rewatchCount > 0).sort((a, b) => b.rewatchCount - a.rewatchCount).slice(0, 5);

  /* Completion rate */
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  content.innerHTML =
    '<h2 class="modal-title">Library Statistics</h2>' +

    /* ── Overview cards ── */
    '<div class="stats-grid">' +
      '<div class="stats-card"><div class="stats-card-value">' + total + '</div><div class="stats-card-label">Total Entries</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + completionRate + '%</div><div class="stats-card-label">Completion Rate</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + avgRating + '</div><div class="stats-card-label">Avg Rating</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + totalEpsWatched + '</div><div class="stats-card-label">Episodes / Ch.</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + totalHours + 'h</div><div class="stats-card-label">Watch Time</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + totalDays + 'd</div><div class="stats-card-label">Days Spent</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + backlogHours + 'h</div><div class="stats-card-label">Backlog Time</div></div>' +
      '<div class="stats-card"><div class="stats-card-value">' + rated.length + '</div><div class="stats-card-label">Entries Rated</div></div>' +
    '</div>' +

    /* ── Status breakdown ── */
    '<section class="modal-section">' +
      '<h3 class="modal-section-title">Status Breakdown</h3>' +
      '<div class="stats-status-bars">' +
        '<div class="stats-status-row"><span class="stats-status-label">Completed</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill stats-bar--completed" style="width:' + (total > 0 ? Math.round((completed / total) * 100) : 0) + '%"></div></div>' +
          '<span class="stats-genre-count">' + completed + '</span></div>' +
        '<div class="stats-status-row"><span class="stats-status-label">In Progress</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill stats-bar--in-progress" style="width:' + (total > 0 ? Math.round((inProg / total) * 100) : 0) + '%"></div></div>' +
          '<span class="stats-genre-count">' + inProg + '</span></div>' +
        '<div class="stats-status-row"><span class="stats-status-label">Planned</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill stats-bar--planned" style="width:' + (total > 0 ? Math.round((planned / total) * 100) : 0) + '%"></div></div>' +
          '<span class="stats-genre-count">' + planned + '</span></div>' +
        '<div class="stats-status-row"><span class="stats-status-label">Dropped</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill stats-bar--dropped" style="width:' + (total > 0 ? Math.round((dropped / total) * 100) : 0) + '%"></div></div>' +
          '<span class="stats-genre-count">' + dropped + '</span></div>' +
      '</div>' +
    '</section>' +

    /* ── Type distribution ── */
    (typeEntries.length > 0
      ? '<section class="modal-section"><h3 class="modal-section-title">Type Distribution</h3>' +
        '<div class="stats-genre-bars">' +
        typeEntries.map(([t, c]) =>
          '<div class="stats-genre-row"><span class="stats-genre-name">' + escapeHTML(t) + '</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill stats-bar--type-' + typeClass(t) + '" style="width:' + Math.round((c / typeEntries[0][1]) * 100) + '%"></div></div>' +
          '<span class="stats-genre-count">' + c + ' (' + Math.round((c / total) * 100) + '%)</span></div>'
        ).join('') +
        '</div></section>'
      : '') +

    /* ── Rating distribution ── */
    (rated.length > 0
      ? '<section class="modal-section"><h3 class="modal-section-title">Rating Distribution</h3>' +
        '<div class="stats-rating-dist">' +
        ratingBuckets.map((count, i) => {
          /* Convert bucket's internal value (1-10) to the active scoring system for the label */
          const internalVal = i + 1;
          const bucketLabel = formatScore(internalVal);
          return '<div class="stats-rating-col">' +
            '<div class="stats-rating-bar-wrap"><div class="stats-rating-bar" style="height:' + Math.round((count / maxBucket) * 100) + '%"></div></div>' +
            '<span class="stats-rating-label">' + bucketLabel + '</span>' +
          '</div>';
        }).join('') +
        '</div></section>'
      : '') +

    /* ── Top genres ── */
    (topGenres.length > 0
      ? '<section class="modal-section"><h3 class="modal-section-title">Top Genres</h3>' +
        '<div class="stats-genre-bars">' +
        topGenres.map(([g, c]) =>
          '<div class="stats-genre-row"><span class="stats-genre-name">' + escapeHTML(g) + '</span>' +
          '<div class="stats-genre-bar-track"><div class="stats-genre-bar-fill" style="width:' + Math.round((c / topGenres[0][1]) * 100) + '%"></div></div>' +
          '<span class="stats-genre-count">' + c + '</span></div>'
        ).join('') +
        '</div></section>'
      : '') +

    /* ── Most rewatched ── */
    (mostRewatched.length > 0
      ? '<section class="modal-section"><h3 class="modal-section-title">Most Rewatched</h3>' +
        '<ol class="stats-rewatch-list">' +
        mostRewatched.map(m =>
          '<li>' + escapeHTML(m.title) + ' <strong>(' + m.rewatchCount + 'x)</strong></li>'
        ).join('') +
        '</ol></section>'
      : '');

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 24. ACTIVITY LOG VIEWER  (Task 21)
   Displays the timestamped action history from the current and
   previous sessions.
═══════════════════════════════════════════════════════════════ */

function openActivityLog() {
  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  content.innerHTML =
    '<h2 class="modal-title">Activity Log</h2>' +
    (activityLog.length === 0
      ? '<p class="modal-section-text">No activity recorded yet.</p>'
      : '<ul class="activity-log-list">' +
        activityLog.slice(0, 100).map(entry =>
          '<li class="activity-log-item">' +
            '<span class="activity-log-time">' + formatDate(entry.time ? entry.time.slice(0, 10) : '') +
              ' ' + (entry.time ? entry.time.slice(11, 16) : '') + '</span>' +
            '<span class="activity-log-action">' + escapeHTML(entry.action) + '</span>' +
          '</li>'
        ).join('') +
        '</ul>') +
    '<button type="button" class="btn-secondary" id="clear-activity-btn" style="margin-top:var(--space-4)">Clear Log</button>';

  document.getElementById('clear-activity-btn')?.addEventListener('click', () => {
    /* Show inline confirmation before clearing */
    const confirmArea = document.getElementById('clear-log-confirm');
    if (confirmArea) { confirmArea.hidden = false; return; }
    /* Create inline confirmation if it doesn't exist */
    const confirmDiv = document.createElement('div');
    confirmDiv.id = 'clear-log-confirm';
    confirmDiv.className = 'settings-reset-confirm';
    confirmDiv.setAttribute('role', 'alertdialog');
    confirmDiv.innerHTML =
      '<p class="delete-confirm-msg">Are you sure you want to clear all activity logs?</p>' +
      '<div class="delete-confirm-btns">' +
        '<button type="button" class="btn-secondary" id="clear-log-cancel">Cancel</button>' +
        '<button type="button" class="btn-danger" id="clear-log-yes">Clear Logs</button>' +
      '</div>';
    document.getElementById('clear-activity-btn').insertAdjacentElement('afterend', confirmDiv);

    document.getElementById('clear-log-cancel')?.addEventListener('click', () => {
      confirmDiv.hidden = true;
    });
    document.getElementById('clear-log-yes')?.addEventListener('click', () => {
      /* Push undo snapshot so Ctrl+Z can restore the logs */
      pushUndo('Clear activity log');
      /* Store logs in undo stack data so they can be restored */
      const lastUndo = undoStack[undoStack.length - 1];
      if (lastUndo) lastUndo.activityLogBackup = JSON.parse(JSON.stringify(activityLog));
      activityLog = [];
      try { localStorage.removeItem(ACTIVITY_LOG_KEY); } catch { /* */ }
      content.querySelector('.activity-log-list')?.remove();
      confirmDiv.hidden = true;
      showToast('Activity log cleared. Ctrl+Z to undo.', 'info');
    });
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 25. RECOMMENDATION ENGINE VIEWER  (Task 7)
   Shows a ranked list of Planned entries the user is most likely
   to enjoy, based on genre/type patterns from their highest-rated
   completed entries.
═══════════════════════════════════════════════════════════════ */

function openRecommendations() {
  const recs = getRecommendations();
  const overlay = dom.modalOverlay;
  const content = dom.modalContent;

  /* Build a human-readable "why" reason for each recommendation.
     Inspects the entry's genres, author, and linked entries to find
     which signals contributed most to its score, then assembles a
     concise string like "Genres: Action, Drama · Same author as Naruto". */
  const buildReason = (r) => {
    const reasons = [];
    const entry = r.entry;
    const matchedGenres = (entry.genres || []).filter(g => {
      const rated = allMedia.filter(m =>
        (m.status === 'Completed' || m.status === 'In Progress') && (m.rating || 0) > 0
      );
      return rated.some(m => (m.genres || []).includes(g));
    });
    if (matchedGenres.length > 0) reasons.push('Genres: ' + matchedGenres.slice(0, 3).join(', '));
    if (entry.author) {
      const authorMatch = allMedia.find(m =>
        m.author === entry.author && m.id !== entry.id && (m.rating || 0) >= 7
      );
      if (authorMatch) reasons.push('Same author as ' + authorMatch.title);
    }
    if (entry.linkedEntries && entry.linkedEntries.length > 0) {
      const linkedTitle = allMedia.find(m => m.id === entry.linkedEntries[0].entryId);
      if (linkedTitle && (linkedTitle.rating || 0) >= 7) reasons.push('Related to ' + linkedTitle.title);
    }
    return reasons.length > 0 ? reasons.join(' · ') : entry.type || '';
  };

  const maxScore = recs.length > 0 ? recs[0].score : 1;

  content.innerHTML =
    '<h2 class="modal-title">Recommendations</h2>' +
    '<p class="modal-section-text" style="margin-bottom:var(--space-4)">Based on your highest-rated entries, here\'s what you\'ll probably love from your planned list:</p>' +
    (recs.length === 0
      ? '<p class="modal-section-text">Not enough data yet. Rate some completed or in-progress entries first!</p>'
      : '<ul class="rec-list">' +
        recs.slice(0, 15).map((r, i) => {
          const pctMatch = maxScore > 0 ? Math.round((r.score / maxScore) * 100) : 0;
          return '<li class="rec-item" data-id="' + escapeHTML(r.entry.id) + '">' +
            '<div class="rec-rank">' + (i + 1) + '</div>' +
            '<div class="rec-info">' +
              '<span class="rec-title">' + escapeHTML(r.entry.title) + '</span>' +
              '<span class="rec-meta">' + escapeHTML(r.entry.type || '') + ' · ' + (r.entry.genres || []).slice(0, 3).join(', ') + '</span>' +
              '<span class="rec-reason">' + escapeHTML(buildReason(r)) + '</span>' +
            '</div>' +
            '<div class="rec-match">' + pctMatch + '%</div>' +
          '</li>';
        }).join('') +
        '</ul>');

  content.querySelectorAll('.rec-item[data-id]').forEach(li => {
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => { closeModal(); openModal(li.dataset.id); });
  });

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  dom.modalClose.focus();
  overlay.addEventListener('keydown', trapFocus);
}


/* ═══════════════════════════════════════════════════════════════
   § 26. IMPORT MODE SELECTION  (Task 13)
   When importing, presents the user with a choice: overwrite
   everything or simply add/merge with existing data.
═══════════════════════════════════════════════════════════════ */

function showImportModeDialog() {
  return new Promise(resolve => {
    const overlay = document.getElementById('password-overlay');
    const body    = document.getElementById('password-body');
    if (!overlay || !body) { resolve('overwrite'); return; }

    body.innerHTML =
      '<h2 class="form-heading">Import Mode</h2>' +
      '<p class="settings-hint" style="margin-bottom:var(--space-4)">How should the imported data be handled?</p>' +
      '<div class="form-actions" style="flex-direction:column;gap:var(--space-2)">' +
        '<button type="button" class="btn-primary" id="import-overwrite-btn" style="width:100%;justify-content:center">' +
          'Overwrite — Replace entire library' +
        '</button>' +
        '<button type="button" class="btn-secondary" id="import-merge-btn" style="width:100%;justify-content:center">' +
          'Add to List — Merge with existing' +
        '</button>' +
        '<button type="button" class="btn-secondary" id="import-cancel-btn" style="width:100%;justify-content:center">' +
          'Cancel' +
        '</button>' +
      '</div>';

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    function done(val) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      resolve(val);
    }
    document.getElementById('import-overwrite-btn')?.addEventListener('click', () => done('overwrite'));
    document.getElementById('import-merge-btn')?.addEventListener('click', () => done('merge'));
    document.getElementById('import-cancel-btn')?.addEventListener('click', () => done(null));
  });
}


function init() {
  loadSettings();
  loadLibraryConfig();
  loadActivityLog();
  applySettings();
  bindEvents();
  loadData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
