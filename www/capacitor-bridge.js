/**
 * CoolBattery A36 - Capacitor Bridge
 * Native (Android) çalıştırılırken gerçek pil/ısı verisine güvenli erişim sağlar.
 * Native plugin bulunamazsa (örn. tarayıcıda test ederken) fonksiyonlar null döner,
 * app.js bu durumda Web Battery API'ye veya "tahmini" moda düşer.
 */
window.CoolBridge = (function () {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Plugins = window.Capacitor ? window.Capacitor.Plugins : {};

  async function getRealBatteryInfo() {
    if (isNative && Plugins.BatteryInfo) {
      try {
        const res = await Plugins.BatteryInfo.getInfo();
        return res;
      } catch (e) {
        console.warn('BatteryInfo native plugin hata verdi:', e);
        return null;
      }
    }
    return null;
  }

  async function notify(title, body, id) {
    if (isNative && Plugins.LocalNotifications) {
      try {
        const perm = await Plugins.LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await Plugins.LocalNotifications.requestPermissions();
        }
        await Plugins.LocalNotifications.schedule({
          notifications: [{
            id: id || Date.now() % 100000,
            title,
            body,
            smallIcon: 'ic_stat_coolbattery',
            iconColor: '#4fe04f'
          }]
        });
        return true;
      } catch (e) {
        console.warn('Bildirim gönderilemedi:', e);
        return false;
      }
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
        return true;
      } else if (Notification.permission !== 'denied') {
        const p = await Notification.requestPermission();
        if (p === 'granted') {
          new Notification(title, { body, icon: 'icons/icon-192.png' });
          return true;
        }
      }
    }
    return false;
  }

  function openDeviceCare() {
    if (isNative && Plugins.BatteryInfo && Plugins.BatteryInfo.openDeviceCare) {
      Plugins.BatteryInfo.openDeviceCare().catch(() => {});
      return true;
    }
    return false;
  }

  return { isNative, getRealBatteryInfo, notify, openDeviceCare };
})();
