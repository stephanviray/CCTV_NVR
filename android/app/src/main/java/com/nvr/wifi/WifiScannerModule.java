package com.nvr.wifi;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.List;

public class WifiScannerModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private WifiManager wifiManager;

    public WifiScannerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.wifiManager = (WifiManager) reactContext.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    }

    @NonNull
    @Override
    public String getName() {
        return "WifiScanner";
    }

    @ReactMethod
    public void getAvailableNetworks(final Promise promise) {
        try {
            if (!wifiManager.isWifiEnabled()) {
                promise.reject("WIFI_DISABLED", "Wi-Fi is not enabled");
                return;
            }

            // Register the broadcast receiver
            BroadcastReceiver wifiScanReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent.getAction().equals(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)) {
                        reactContext.unregisterReceiver(this);
                        
                        List<ScanResult> scanResults = wifiManager.getScanResults();
                        WritableArray wifiList = Arguments.createArray();
                        
                        for (ScanResult result : scanResults) {
                            if (result.SSID != null && !result.SSID.isEmpty()) {
                                WritableMap wifiObject = Arguments.createMap();
                                wifiObject.putString("SSID", result.SSID);
                                wifiObject.putString("BSSID", result.BSSID);
                                wifiObject.putInt("level", result.level);
                                wifiObject.putInt("frequency", result.frequency);
                                wifiObject.putString("capabilities", result.capabilities);
                                
                                // Determine if network is secured
                                boolean isSecured = result.capabilities.toUpperCase().contains("WEP") ||
                                                  result.capabilities.toUpperCase().contains("WPA") ||
                                                  result.capabilities.toUpperCase().contains("PSK");
                                wifiObject.putBoolean("isSecured", isSecured);
                                
                                wifiList.pushMap(wifiObject);
                            }
                        }
                        
                        promise.resolve(wifiList);
                    }
                }
            };

            // Register the receiver
            IntentFilter intentFilter = new IntentFilter();
            intentFilter.addAction(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            reactContext.registerReceiver(wifiScanReceiver, intentFilter);

            // Start the scan
            boolean success = wifiManager.startScan();
            if (!success) {
                reactContext.unregisterReceiver(wifiScanReceiver);
                promise.reject("SCAN_FAILURE", "Failed to start WiFi scan");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isWifiEnabled(Promise promise) {
        try {
            boolean isEnabled = wifiManager.isWifiEnabled();
            promise.resolve(isEnabled);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getCurrentWifiSSID(Promise promise) {
        try {
            if (!wifiManager.isWifiEnabled()) {
                promise.reject("WIFI_DISABLED", "Wi-Fi is not enabled");
                return;
            }

            String ssid = null;
            
            // Method 1: Try standard API first
            ssid = getSSIDFromWifiInfo();
            System.out.println("Method 1 SSID: " + ssid);
            
            // Method 2: Try from scan results if Method 1 failed
            if (isNullOrEmpty(ssid)) {
                ssid = getSSIDFromScanResults();
                System.out.println("Method 2 SSID: " + ssid);
            }
            
            // Method 3: Try Android hidden API with reflection as last resort
            if (isNullOrEmpty(ssid)) {
                ssid = getSSIDUsingReflection();
                System.out.println("Method 3 SSID: " + ssid);
            }
            
            // If we have a valid SSID, return it
            if (!isNullOrEmpty(ssid)) {
                WritableMap result = Arguments.createMap();
                result.putString("SSID", ssid);
                result.putString("BSSID", wifiManager.getConnectionInfo().getBSSID());
                result.putInt("rssi", wifiManager.getConnectionInfo().getRssi());
                result.putBoolean("available", true);
                promise.resolve(result);
            } else {
                // No valid SSID found
                WritableMap result = Arguments.createMap();
                result.putString("SSID", "");
                result.putBoolean("available", false);
                result.putString("error", "Could not retrieve SSID with any method");
                promise.resolve(result);
            }
        } catch (Exception e) {
            System.out.println("Error in getCurrentWifiSSID: " + e.getMessage());
            WritableMap errorResult = Arguments.createMap();
            errorResult.putString("SSID", "");
            errorResult.putBoolean("available", false);
            errorResult.putString("error", e.getMessage());
            promise.resolve(errorResult);
        }
    }
    
    // Helper method to get SSID from WifiInfo
    private String getSSIDFromWifiInfo() {
        String ssid = wifiManager.getConnectionInfo().getSSID();
        
        // SSID is usually wrapped in quotes, remove them if present
        if (ssid != null && ssid.startsWith("\"") && ssid.endsWith("\"")) {
            ssid = ssid.substring(1, ssid.length() - 1);
        }
        
        // Check if it's a valid SSID
        if (ssid == null || ssid.equals("<unknown ssid>") || ssid.isEmpty()) {
            return null;
        }
        
        return ssid;
    }
    
    // Helper method to get SSID from scan results by matching BSSID
    private String getSSIDFromScanResults() {
        try {
            // Start a scan to get fresh results
            wifiManager.startScan();
            Thread.sleep(500); // Give it a moment to scan
            
            List<ScanResult> scanResults = wifiManager.getScanResults();
            String bssid = wifiManager.getConnectionInfo().getBSSID();
            
            if (bssid == null) {
                return null;
            }
            
            System.out.println("Looking for BSSID: " + bssid + " in " + scanResults.size() + " scan results");
            
            for (ScanResult result : scanResults) {
                System.out.println("Scan result: SSID=" + result.SSID + " BSSID=" + result.BSSID);
                if (result.BSSID != null && result.BSSID.equals(bssid)) {
                    return result.SSID;
                }
            }
        } catch (Exception e) {
            System.out.println("Error getting SSID from scan results: " + e.getMessage());
        }
        
        return null;
    }
    
    // Helper method to get SSID using reflection (last resort)
    private String getSSIDUsingReflection() {
        try {
            // This is a hack that uses reflection to access hidden methods
            // It might not work on all Android versions
            Class<?> wifiManagerClass = WifiManager.class;
            java.lang.reflect.Method getConnectionInfo = wifiManagerClass.getDeclaredMethod("getConnectionInfo");
            Object wifiInfo = getConnectionInfo.invoke(wifiManager);
            
            if (wifiInfo != null) {
                Class<?> wifiInfoClass = wifiInfo.getClass();
                java.lang.reflect.Method getSSID = wifiInfoClass.getDeclaredMethod("getSSID");
                Object ssidObj = getSSID.invoke(wifiInfo);
                
                if (ssidObj != null) {
                    String ssid = ssidObj.toString();
                    
                    // SSID is usually wrapped in quotes, remove them if present
                    if (ssid.startsWith("\"") && ssid.endsWith("\"")) {
                        ssid = ssid.substring(1, ssid.length() - 1);
                    }
                    
                    // Check if it's a valid SSID
                    if (!ssid.equals("<unknown ssid>") && !ssid.isEmpty()) {
                        return ssid;
                    }
                }
            }
        } catch (Exception e) {
            System.out.println("Error getting SSID using reflection: " + e.getMessage());
        }
        
        return null;
    }
    
    // Helper to check if string is null or empty
    private boolean isNullOrEmpty(String str) {
        return str == null || str.isEmpty() || str.equals("<unknown ssid>");
    }
} 