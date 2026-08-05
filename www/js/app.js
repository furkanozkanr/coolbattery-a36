(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    intro: $('#screen-intro'),
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

  // ---------------- Termal Kalp ----------------
  let wasCritical = false;
  let cooldownActive = false;
  const heartEl = $('#heart-icon');

  function setHeartRate(tempC) {
    if (!heartEl) return;
    let duration;
    if (tempC == null) duration = 1.8;
    else if (tempC < 32) duration = 2.2;
    else if (tempC < 38) duration = 1.6;
    else if (tempC < 42) duration = 1.0;
    else duration = 0.55;
    heartEl.style.animationDuration = duration + 's';
  }

  function showCriticalOverlay(tempC) {
    $('#critical-temp').textContent = tempC.toFixed(1) + ' °C';
    $('#critical-overlay').classList.add('show');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  }

  function hideCriticalOverlay() {
    $('#critical-overlay').classList.remove('show');
  }

  function setCooldownMode(active) {
    cooldownActive = active;
    document.body.classList.toggle('cooldown-active', active);
    $('#btn-cooldown-mode').classList.toggle('active', active);
    $('#cooldown-toggle-label').textContent = 'Acil Soğutma Modu · ' + (active ? 'Açık' : 'Kapalı');
    if (active) {
      toast('Acil soğutma modu açık — uygulama kendi animasyon ve arka plan yükünü azaltıyor');
    }
  }

  $('#btn-cooldown-mode').addEventListener('click', () => setCooldownMode(!cooldownActive));
  $('#btn-critical-dismiss').addEventListener('click', hideCriticalOverlay);
  $('#btn-critical-devicecare').addEventListener('click', () => {
    window.CoolBridge.openDeviceCare();
    hideCriticalOverlay();
  });

  function paintThermal(tempC, source) {
    $('#thermal-source').textContent = 'Kaynak: ' + source;
    $('#thermal-value').textContent = (tempC != null ? tempC.toFixed(1) : '--') + ' °C';
    setHeartRate(tempC);

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

    const isCriticalNow = tempC != null && tempC >= 42;
    if (isCriticalNow && !wasCritical) {
      window.CoolBridge.notify('CoolBattery A36', 'Cihaz sıcaklığı kritik seviyede (' + tempC.toFixed(1) + '°C). Ağır uygulamaları kapatıp cihazı dinlendirin.', 777);
      showCriticalOverlay(tempC);
      setCooldownMode(true);
    } else if (isCriticalNow) {
      $('#critical-temp').textContent = tempC.toFixed(1) + ' °C';
    } else if (!isCriticalNow && wasCritical) {
      hideCriticalOverlay();
    }
    wasCritical = isCriticalNow;
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
  function finishIntro() {
    screens.intro.classList.add('fade-out');
    setTimeout(() => {
      if (state.profile) {
        setProfile(state.profile);
      } else {
        showScreen('profile');
      }
    }, 400);
  }

  async function boot() {
    await initWebBatteryFallback();
    setTimeout(finishIntro, 1900);
    refreshBattery();
    setInterval(refreshBattery, 15000);
  }

  boot();
})();
