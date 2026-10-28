/* =========================================================================
   網上實時時鐘 — clock.js
   -------------------------------------------------------------------------
   由 index.html 以 <script src="clock.js"> 引入。
   功能：12 小時制時間、日期＋星期、六個時區切換、四種語言、
         深色霓虹／淺色主題、秒數進度條、偏好記憶（localStorage）。
   所有時間都以所選時區為準，GMT 偏移會跟隨夏令時間自動調整。
   ========================================================================= */

(function () {
  'use strict';

  /* ======================================================================
     1. 資料區：翻譯字串、時區城市、後備資料
     ====================================================================== */

  var STRINGS = {
    zh: {
      htmlLang: 'zh-Hant',
      title: '網上實時時鐘',
      subtitle: '實時顯示{city}時間',
      lang: '語言',
      zone: '時區',
      dark: '深色霓虹',
      light: '淺色',
      toggle: '切換主題',
      options: '顯示選項'
    },
    en: {
      htmlLang: 'en',
      title: 'Live World Clock',
      subtitle: 'Live time in {city}',
      lang: 'Language',
      zone: 'Timezone',
      dark: 'Dark neon',
      light: 'Light',
      toggle: 'Toggle theme',
      options: 'Display options'
    },
    ja: {
      htmlLang: 'ja',
      title: 'リアルタイム世界時計',
      subtitle: '{city}の現在時刻',
      lang: '言語',
      zone: 'タイムゾーン',
      dark: 'ダークネオン',
      light: 'ライト',
      toggle: 'テーマを切り替え',
      options: '表示オプション'
    },
    ko: {
      htmlLang: 'ko',
      title: '실시간 세계 시계',
      subtitle: '{city} 현재 시각',
      lang: '언어',
      zone: '시간대',
      dark: '다크 네온',
      light: '라이트',
      toggle: '테마 전환',
      options: '표시 옵션'
    }
  };

  var LOCALES = { zh: 'zh-Hant', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR' };

  /* 12 小時制的上午／下午用字（隨語言切換） */
  var PERIODS = {
    zh: { am: '上午', pm: '下午' },
    en: { am: 'AM', pm: 'PM' },
    ja: { am: '午前', pm: '午後' },
    ko: { am: '오전', pm: '오후' }
  };

  /* 六個時區城市；names 的 key 對應介面語言 */
  var CITIES = [
    { key: 'hongkong',   tz: 'Asia/Hong_Kong',      names: { zh: '香港', en: 'Hong Kong', ja: '香港',   ko: '홍콩' } },
    { key: 'taipei',     tz: 'Asia/Taipei',         names: { zh: '台北', en: 'Taipei',    ja: '台北',   ko: '타이베이' } },
    { key: 'tokyo',      tz: 'Asia/Tokyo',          names: { zh: '東京', en: 'Tokyo',     ja: '東京',   ko: '도쿄' } },
    { key: 'london',     tz: 'Europe/London',       names: { zh: '倫敦', en: 'London',    ja: 'ロンドン', ko: '런던' } },
    { key: 'newyork',    tz: 'America/New_York',    names: { zh: '紐約', en: 'New York',  ja: 'ニューヨーク', ko: '뉴욕' } },
    { key: 'losangeles', tz: 'America/Los_Angeles', names: { zh: '洛杉磯', en: 'Los Angeles', ja: 'ロサンゼルス', ko: '로스앤젤레스' } }
  ];

  /* 瀏覽器不支援 Intl 時區資料時的後備：固定偏移（小時）＋手寫星期／月份名稱 */
  var FALLBACK_OFFSET_HOURS = {
    hongkong: 8,
    taipei: 8,
    tokyo: 9,
    london: 0,
    newyork: -5,
    losangeles: -8
  };

  var FALLBACK_WEEKDAYS = {
    zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ja: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
    ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  };

  var FALLBACK_MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  /* ======================================================================
     2. 小工具
     ====================================================================== */

  var pad2 = function (value) {
    return String(value).padStart(2, '0');
  };

  var STORE_KEYS = { theme: 'clock.theme', lang: 'clock.lang', zone: 'clock.zone' };

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null; /* 私隱模式等情況沒有 localStorage */
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* 忽略寫入失敗 */
    }
  }

  /* 檢查瀏覽器是否支援 Intl 時區與 formatToParts */
  var SUPPORTS_INTL_TZ = (function () {
    try {
      if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return false;
      if (typeof Intl.DateTimeFormat.prototype.formatToParts !== 'function') return false;
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo' }).format(new Date());
      return true;
    } catch (error) {
      return false;
    }
  })();

  /* ======================================================================
     3. 時區運算（Intl 優先，失敗時退回固定偏移）
     ====================================================================== */

  var formatterCache = new Map();

  function getFormatter(cacheKey, locale, options) {
    var formatter = formatterCache.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      formatterCache.set(cacheKey, formatter);
    }
    return formatter;
  }

  /* 取得指定時區的數字部分：年、月、日、時(0-23)、分、秒 */
  function getZonedParts(timeZone, date) {
    var formatter = getFormatter('parts|' + timeZone, 'en-GB', {
      timeZone: timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    var values = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') values[part.type] = part.value;
    });

    /* 個別瀏覽器在午夜會回傳 24，這裡統一成 0 */
    var hour = parseInt(values.hour, 10) % 24;

    return {
      year: parseInt(values.year, 10),
      month: parseInt(values.month, 10),
      day: parseInt(values.day, 10),
      hour: hour,
      minute: parseInt(values.minute, 10),
      second: parseInt(values.second, 10)
    };
  }

  /* 該語言的星期名稱（例：星期三 / Wednesday / 水曜日 / 수요일） */
  function getLocalizedWeekday(lang, timeZone, date) {
    var formatter = getFormatter('weekday|' + lang + '|' + timeZone, LOCALES[lang], {
      timeZone: timeZone,
      weekday: 'long'
    });
    var weekdayPart = formatter.formatToParts(date).find(function (part) {
      return part.type === 'weekday';
    });
    return weekdayPart ? weekdayPart.value : '';
  }

  /* 英文月份名稱（例：June） */
  function getEnglishMonth(timeZone, date) {
    var formatter = getFormatter('month|' + timeZone, 'en-US', {
      timeZone: timeZone,
      month: 'long'
    });
    return formatter.format(date);
  }

  /* 該時區相對 UTC 的分鐘數（夏令時間自動處理） */
  function getOffsetMinutes(timeZone, date) {
    var parts = getZonedParts(timeZone, date);
    var asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    var seconds = Math.floor(date.getTime() / 1000) * 1000;
    return Math.round((asUtc - seconds) / 60000);
  }

  /* GMT+8 / GMT-5 / GMT+5:30 這種格式 */
  function formatOffset(minutes) {
    var sign = minutes < 0 ? '-' : '+';
    var absolute = Math.abs(minutes);
    var hours = Math.floor(absolute / 60);
    var rest = absolute % 60;
    return 'GMT' + sign + hours + (rest ? ':' + pad2(rest) : '');
  }

  /* 後備用：用固定偏移算出該時區的日期時間 */
  function getFallbackParts(city, date) {
    var offsetHours = FALLBACK_OFFSET_HOURS[city.key] || 0;
    var shifted = new Date(date.getTime() + offsetHours * 3600000);

    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      weekdayIndex: shifted.getUTCDay()
    };
  }

  /* ======================================================================
     4. 畫面狀態
     ====================================================================== */

  var state = { lang: 'zh', theme: 'dark', zone: 'hongkong' };
  var els = {};
  var tickTimer = null;

  function getCity(key) {
    return CITIES.find(function (city) {
      return city.key === key;
    }) || CITIES[0];
  }

  /* 各語言的日期寫法：
     zh / ja：2025年6月18日 星期三
     en     ：Wednesday, 18 June 2025
     ko     ：2025년 6월 18일 수요일 */
  function formatDateText(lang, parts, weekday, monthNameEn) {
    if (lang === 'en') {
      return weekday + ', ' + parts.day + ' ' + monthNameEn + ' ' + parts.year;
    }
    if (lang === 'ko') {
      return parts.year + '년 ' + parts.month + '월 ' + parts.day + '일 ' + weekday;
    }
    return parts.year + '年' + parts.month + '月' + parts.day + '日 ' + weekday;
  }

  /* 主繪製：時間、日期、時區、秒數進度條 */
  function renderClock() {
    var city = getCity(state.zone);
    var lang = state.lang;
    var now = new Date();
    var parts;
    var weekday;

    if (SUPPORTS_INTL_TZ) {
      parts = getZonedParts(city.tz, now);
      weekday = getLocalizedWeekday(lang, city.tz, now);
    } else {
      parts = getFallbackParts(city, now);
      weekday = FALLBACK_WEEKDAYS[lang][parts.weekdayIndex];
    }

    /* 12 小時制：上午／下午 + 時:分:秒（時不補零、分秒補零） */
    var hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
    els.clockPeriod.textContent = PERIODS[lang][parts.hour < 12 ? 'am' : 'pm'];
    els.clockDigits.textContent =
      hour12 + ':' + pad2(parts.minute) + ':' + pad2(parts.second);

    /* 日期 + 星期 */
    var monthNameEn = '';
    if (lang === 'en') {
      monthNameEn = SUPPORTS_INTL_TZ
        ? getEnglishMonth(city.tz, now)
        : FALLBACK_MONTHS_EN[parts.month - 1];
    }
    els.clockDate.textContent = formatDateText(lang, parts, weekday, monthNameEn);

    /* GMT 偏移 + 翻譯後的城市名 */
    var offsetText;
    if (SUPPORTS_INTL_TZ) {
      offsetText = formatOffset(getOffsetMinutes(city.tz, now));
    } else {
      offsetText = formatOffset((FALLBACK_OFFSET_HOURS[city.key] || 0) * 60);
    }
    els.clockZone.textContent = offsetText + ' ' + city.names[lang];

    /* 秒數進度條（融合自舊版 clock.js） */
    if (els.secondBar && els.secondBar.style) {
      els.secondBar.style.width = (parts.second / 60 * 100) + '%';
    }
  }

  /* ======================================================================
     5. 介面文字更新
     ====================================================================== */

  function buildZoneSelect() {
    els.zoneSelect.innerHTML = '';
    CITIES.forEach(function (city) {
      var option = document.createElement('option');
      option.value = city.key;
      option.textContent = city.names[state.lang];
      els.zoneSelect.appendChild(option);
    });
    els.zoneSelect.value = state.zone;
  }

  function updateZoneOptionLabels() {
    var options = els.zoneSelect.options;
    CITIES.forEach(function (city, index) {
      if (options[index]) options[index].textContent = city.names[state.lang];
    });
    els.zoneSelect.value = state.zone;
  }

  function applyTheme() {
    var t = STRINGS[state.lang];
    var isDark = state.theme === 'dark';

    document.documentElement.dataset.theme = state.theme;
    els.themeIcon.textContent = isDark ? '🌙' : '🔆';
    els.themeText.textContent = isDark ? t.dark : t.light;
    els.themeToggle.setAttribute('aria-pressed', String(isDark));
    els.themeToggle.setAttribute('title', t.toggle);
  }

  function applyLanguage() {
    var lang = state.lang;
    var t = STRINGS[lang];
    var city = getCity(state.zone);

    document.documentElement.lang = t.htmlLang;
    document.title = t.title;

    els.siteTitle.textContent = t.title;
    els.siteSubtitle.textContent = t.subtitle.replace('{city}', city.names[lang]);
    els.langLabel.textContent = t.lang;
    els.zoneLabel.textContent = t.zone;
    els.controls.setAttribute('aria-label', t.options);

    els.langSelect.value = lang;
    updateZoneOptionLabels();

    applyTheme();
  }

  /* ======================================================================
     6. 每秒跳動（對齊真實秒數，避免累積誤差）
     ====================================================================== */

  function scheduleNextTick() {
    var delay = 1000 - (Date.now() % 1000) + 25;
    tickTimer = window.setTimeout(function () {
      renderClock();
      scheduleNextTick();
    }, delay);
  }

  function startClock() {
    if (tickTimer !== null) {
      window.clearTimeout(tickTimer);
    }
    renderClock();
    scheduleNextTick();
  }

  /* ======================================================================
     7. 偏好設定讀取與寫入
     ====================================================================== */

  function loadState() {
    var savedTheme = storageGet(STORE_KEYS.theme);
    if (savedTheme === 'dark' || savedTheme === 'light') state.theme = savedTheme;

    var savedLang = storageGet(STORE_KEYS.lang);
    if (savedLang && Object.prototype.hasOwnProperty.call(STRINGS, savedLang)) {
      state.lang = savedLang;
    }

    var savedZone = storageGet(STORE_KEYS.zone);
    if (savedZone && CITIES.some(function (city) { return city.key === savedZone; })) {
      state.zone = savedZone;
    }

    /* 網址參數可臨時指定（方便分享或截圖），不會寫入偏好：
       ?theme=light&lang=en&zone=tokyo */
    try {
      var params = new URLSearchParams(window.location.search);
      var queryTheme = params.get('theme');
      var queryLang = params.get('lang');
      var queryZone = params.get('zone');

      if (queryTheme === 'dark' || queryTheme === 'light') state.theme = queryTheme;
      if (queryLang && Object.prototype.hasOwnProperty.call(STRINGS, queryLang)) state.lang = queryLang;
      if (queryZone && CITIES.some(function (city) { return city.key === queryZone; })) {
        state.zone = queryZone;
      }
    } catch (error) {
      /* 舊瀏覽器沒有 URLSearchParams 時忽略 */
    }
  }

  /* ======================================================================
     8. 事件綁定與啟動
     ====================================================================== */

  function bindEvents() {
    els.langSelect.addEventListener('change', function () {
      state.lang = els.langSelect.value;
      storageSet(STORE_KEYS.lang, state.lang);
      applyLanguage();
      renderClock();
    });

    els.zoneSelect.addEventListener('change', function () {
      state.zone = els.zoneSelect.value;
      storageSet(STORE_KEYS.zone, state.zone);
      applyLanguage();
      renderClock();
    });

    els.themeToggle.addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      storageSet(STORE_KEYS.theme, state.theme);
      applyTheme();
    });

    /* 由其他分頁切回來時立即校正時間 */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) startClock();
    });
  }

  function boot() {
    els.controls = document.getElementById('controls');
    els.siteTitle = document.getElementById('siteTitle');
    els.siteSubtitle = document.getElementById('siteSubtitle');
    els.langSelect = document.getElementById('langSelect');
    els.zoneSelect = document.getElementById('zoneSelect');
    els.langLabel = document.getElementById('langLabel');
    els.zoneLabel = document.getElementById('zoneLabel');
    els.themeToggle = document.getElementById('themeToggle');
    els.themeIcon = document.getElementById('themeIcon');
    els.themeText = document.getElementById('themeText');
    els.clockPeriod = document.getElementById('clockPeriod');
    els.clockDigits = document.getElementById('clockDigits');
    els.clockDate = document.getElementById('clockDate');
    els.clockZone = document.getElementById('clockZone');
    els.secondBar = document.getElementById('secondBar');

    if (!els.clockDigits) return;

    loadState();
    buildZoneSelect();
    applyLanguage();
    bindEvents();
    startClock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
