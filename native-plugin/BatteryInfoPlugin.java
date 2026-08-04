package com.ozkan.coolbatterya36;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BatteryInfo")
public class BatteryInfoPlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        Context ctx = getContext();
        IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent battery = ctx.registerReceiver(null, filter);

        JSObject ret = new JSObject();
        if (battery == null) {
            call.reject("Pil verisi okunamadı");
            return;
        }

        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        int tempTenths = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
        int voltage = battery.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);

        double levelPct = (level >= 0 && scale > 0) ? (level * 100.0 / scale) : -1;
        boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;

        ret.put("level", levelPct);
        ret.put("isCharging", isCharging);
        if (tempTenths != Integer.MIN_VALUE) {
            ret.put("temperatureC", tempTenths / 10.0);
        }
        ret.put("voltageMV", voltage);

        call.resolve(ret);
    }

    @PluginMethod
    public void openDeviceCare(PluginCall call) {
        Context ctx = getContext();
        boolean launched = false;

        try {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"
            ));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.getPackageManager().getPackageInfo("com.samsung.android.lool", 0);
            ctx.startActivity(intent);
            launched = true;
        } catch (PackageManager.NameNotFoundException | android.content.ActivityNotFoundException e) {
            launched = false;
        }

        if (!launched) {
            try {
                Intent fallback = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
                launched = true;
            } catch (Exception ignored) {}
        }

        JSObject ret = new JSObje
