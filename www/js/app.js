(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    profile: $('#screen-profile'),
    dashboard: $('#screen-dashboard'),
    settings: $('#screen-settings'),
  };

  const state = {
    profile: localStorage.getItem('cb_profile') || null,
    chargeLimit: parseInt(localStorage.getItem('cb_limit') || '85', 10),
    mode: localStorage.getItem('cb_mode') || 'balanced',
    limitNotifiedForSession: false,
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------- Profile ----------------
  function setProfile(id) {
    state.profile = id;
    localStorage.setItem('cb_profile', id);
    $('#active-profile-name').textContent = id === 'furkan' ? 'Furkan' : 'Beren (Abla)';
    showScreen('dashboard');
  }

  document.querySelectorAll('.profile-card').forEach((btn) => {
    btn.addEventListener('click', () => setProfile(btn.dataset.profile));
  });
  $('#btn-switch-profile').addEventListener('click', () => showScreen('profile'));

  // ---------------- Settings nav ----------------
  $('#btn-settings').addEventListener('click', () => showScreen('settings'));
  $('#tab-settings').addEventListener('click', () => showScreen('settings'));
  $('#btn-back-settings').addEventListener('click', () => showScreen('dashboard'));

  function initSegmented(id, current, onChange) {
    const group = document.getElementById(id);
    group.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.val === String(current));
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        onChange(b.dataset.val);
      });
    });
  }
  initSegmented('limit-segmented', state.chargeLimit, (val) => {
    state.chargeLimit = parseInt(val, 10);
    localStorage.setItem('cb_limit', val);
    state.limitNotifiedForSession = false;
    $('#health-limit').textContent = '%' + val;
    toast('Şarj sınırı %' + val + ' olarak ayarlandı');
  });
  initSegmented('mode-segmented', state.mode, (val) => {
    state.mode = val;
    localStorage.setItem('cb_mode', val);
    toast('Optimizasyon modu güncellendi');
  });
  $('#health-limit').textContent = '%' + state.chargeLimit;

  // ---------------- Battery ring ----------------
  const RING_CIRC = 2 * Math.PI * 86;
  const ringEl = $('#ring-progress');

  function paintBattery(level, isCharging) {
    const pct = Math.max(0, Math.min(100, level));
    const offset = RING_CIRC - (pct / 100) * RING_CIRC;
    ringEl.style.strokeDashoffset = offset;
    ringEl.style.stroke = pct <= 20 ? '#ff5c5c' : (isCharging ? '#3fb6ff' : '#4fe04f');
    $('#battery-percent').textContent = Math.round(pct) + '%';
    $('#battery-status').textContent = isCharging
      ? (pct >= state.chargeLimit ? 'Şarj oluyor · sınıra ulaşıldı' : 'Şarj oluyor')
      : 'Şarj bağlı değil';

    $('#health-pct').textContent = '%' + Math.max(80, 100 - Math.round((100 - pct) * 0.02));

    checkChargeLimit(pct, isCharging);
  }

  let sessionCycleFraction = 0;
  let lastLevel = null;
  function trackCycles(level) {
    if (lastLevel !== null) {
      const delta = level - lastLevel;
      if (delta > 0) sessionCycleFraction += delta / 100;
    }
    lastLevel = level;
    $('#health-cycles').textContent = sessionCycleFraction.toFixed(2);
  }

  async function checkChargeLimit(pct, isCharging) {
    if (isCharging && pct >= state.chargeLimit && !state.limitNotifiedForSession) {
      state.limitNotifiedForSession = true;
      await window.CoolBridge.notify(
        'CoolBattery A36',
        'Pil %' + state.chargeLimit + ' seviyesine ulaştı. Pil sağlığı için şarj kablosunu çıkarmanız önerilir.'
      );
      toast('Şarj sınırına ulaşıldı — kabloyu çıkarmayı unutmayın');
    }
    if (!isCharging) state.limitNotifiedForSession = false;
  }

  // ---------------- Thermal ----------------
  function paintThermal(tempC, source) {
    $('#thermal-source').textContent = 'Kaynak: ' + source;
    $('#thermal-value').textContent = (tempC != null ? tempC.toFixed(1) : '--') + ' °C';

    let pct, badgeClass, badgeText;
    if (tempC == null) {
      pct = 0; badgeClass = 'badge-ok'; badgeText = 'Bilinmiyor';
    } else if (tempC < 32) {
      pct = 20; badgeClass = 'badge-ok'; badgeText = 'Serin';
    } else if (tempC < 38) {
      pct = 50; badgeClass = 'badge-ok'; badgeText = 'Normal';
    } else if (tempC < 42) {
      pct = 75; badgeClass = 'badge-warn'; badgeText = 'Isınıyor';
    } else {
      pct = 100; badgeClass = 'badge-danger'; badgeText = 'Kritik';
    }
    $('#thermal-bar-fill').style.width = pct + '%';
    const badge = $('#thermal-badge');
    badge.className = 'badge ' + badgeClass;
    badge.textContent = badgeText;

    if (tempC != null && tempC >= 42) {
      window.CoolBridge.notify('CoolBattery A36', 'Cihaz sıcaklığı kritik seviyede (' + tempC.toFixed(1) + '°C). Ağır uygulamaları kapatıp cihazı dinlendirin.', 777);
    }
  }

  // ---------------- Data polling ----------------
  let webBatteryRef = null;

  async function refreshBattery() {
    const native = await window.CoolBridge.getRealBatteryInfo();
    if (native && typeof native.level === 'number') {
      paintBattery(native.level, !!native.isCharging);
      trackCycles(native.level);
      if (typeof native.temperatureC === 'number') {
        paintThermal(native.temperatureC, 'Android Sistem Sensörü (gerçek)');
      } else {
        paintThermal(null, 'Kullanılamıyor');
      }
      return;
    }

    if (webBatteryRef) {
      paintBattery(webBatteryRef.level * 100, webBatteryRef.charging);
      trackCycles(webBatteryRef.level * 100);
    }
    const estimate = estimateThermal(webBatteryRef);
    paintThermal(estimate, 'Tahmini (gerçek sensör yok)');
  }

  function estimateThermal(bat) {
    if (!bat) return null;
    let base = 30;
    if (bat.charging) base += 6;
    if (bat.level > 0.8 && bat.charging) base += 3;
    return base;
  }

  async function initWebBatteryFallback() {
    if (navigator.getBattery) {
      try {
        webBatteryRef = await navigator.getBattery();
        webBatteryRef.addEventListener('levelchange', refreshBattery);
        webBatteryRef.addEventListener('chargingchange', refreshBattery);
      } catch (e) {
        console.warn('Web Battery API kullanılamıyor:', e);
      }
    }
  }

  // ---------------- Quick actions ----------------
  $('#btn-cooldown').addEventListener('click', () => {
    const opened = window.CoolBridge.openDeviceCare();
    toast(opened
      ? 'Cihaz Bakımı açılıyor — arka plan uygulamalarını oradan temizleyebilirsiniz'
      : 'Öneri: Ayarlar > Cihaz Bakımı > Şimdi Optimize Et yolunu kullanın');
  });

  $('#btn-chargelimit').addEventListener('click', () => showScreen('settings'));

  $('#btn-report').addEventListener('click', () => {
    toast('Sağlık: %' + $('#health-pct').textContent.replace('%', '') + ' · Bu oturumdaki döngü: ' + $('#health-cycles').textContent);
  });

  $('#btn-devicecare').addEventListener('click', () => {
    const opened = window.CoolBridge.openDeviceCare();
    if (!opened) toast('Bu özellik Android cihazınızda kullanılabilir');
  });

  // ---------------- Boot ----------------
  async function boot() {
    await initWebBatteryFallback();
    if (state.profile) {
      setProfile(state.profile);
    } else {
      showScreen('profile');
    }
    refreshBattery();
    setInterval(refreshBattery, 15000);
  }

  boot();
})();
