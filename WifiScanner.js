import { NativeModules, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// Check if we're running in bridgeless mode
const isBridgeless = Object.keys(NativeModules).length === 0;
console.log('Running in bridgeless mode:', isBridgeless);

// Extract the WifiScanner module, if available
const { WifiScanner } = NativeModules;

// REAL-TIME WiFi implementation
const WifiScannerModule = {
  // Get available networks using actual hardware when possible
  getAvailableNetworks: async () => {
    // First try using NetInfo which works in bridgeless mode
    try {
      // Get real network info (works with or without bridge)
      const netInfo = await NetInfo.fetch();
      
      // If we have WiFi connection, create a real entry for it
      if (netInfo.type === 'wifi' && netInfo.details) {
        const wifiDetails = netInfo.details;
        console.log('ACTUAL CONNECTED NETWORK:', wifiDetails);
        
        let networkSsid = wifiDetails.ssid || '';
        let networkBssid = wifiDetails.bssid || '';
        
        // If SSID is not available from NetInfo, try to get it from the native module
        if (!networkSsid && Platform.OS === 'android' && WifiScanner && !isBridgeless) {
          try {
            // Call the native module directly to avoid circular reference
            const currentWifi = await WifiScanner.getCurrentWifiSSID();
            if (currentWifi && currentWifi.SSID) {
              networkSsid = currentWifi.SSID;
              // If BSSID was also provided, use it
              if (currentWifi.BSSID) {
                networkBssid = currentWifi.BSSID;
              }
              console.log('Retrieved SSID from native module:', networkSsid);
            }
          } catch (ssidError) {
            console.error('Failed to get SSID from native module:', ssidError);
          }
        }
        
        // Return the actually connected network with real data
        const realWifiNetwork = {
          SSID: networkSsid || '',
          BSSID: networkBssid || '00:00:00:00:00:00', 
          level: netInfo.strength ? Math.floor(-50 * (1 - netInfo.strength)) : -60,
          frequency: wifiDetails.frequency || 2462,
          capabilities: wifiDetails.ipAddress ? 'CONNECTED' : 'UNKNOWN',
          isSecured: true,
          isCurrentNetwork: true
        };
        
        // Now try to get neighboring networks if bridge is available
        if (Platform.OS === 'android' && WifiScanner && !isBridgeless) {
          try {
            // Get additional networks from native module
            const nativeNetworks = await WifiScanner.getAvailableNetworks();
            
            // Filter out the current network to avoid duplicates
            const otherNetworks = nativeNetworks.filter(n => n.BSSID !== realWifiNetwork.BSSID);
            
            // Return current network first, then other networks
            return [realWifiNetwork, ...otherNetworks];
          } catch (error) {
            console.log('Native WiFi scan failed, returning only current connection:', error.message);
            return [realWifiNetwork];
          }
        }
        
        // If native scanning isn't available, just return the current network
        return [realWifiNetwork];
      }
      
      // Fall back to native scanning if no WiFi info from NetInfo
      if (Platform.OS === 'android' && WifiScanner && !isBridgeless) {
        try {
          return await WifiScanner.getAvailableNetworks();
        } catch (error) {
          console.error('Native WiFi scan failed:', error.message);
          throw new Error('Cannot access WiFi hardware: ' + error.message);
        }
      }
      
      // No WiFi connection and no native scanning available
      throw new Error('No WiFi connection available and cannot scan for networks');
    } catch (error) {
      console.error('Error scanning WiFi networks:', error);
      throw error;
    }
  },
  
  // Check if WiFi is enabled using real hardware info
  isWifiEnabled: async () => {
    try {
      // Use NetInfo to check real connection state (works in bridgeless mode)
      const netInfo = await NetInfo.fetch();
      
      // If we're on WiFi, it's definitely enabled
      if (netInfo.type === 'wifi') {
        return true;
      }
      
      // If NetInfo says we're connected but not on WiFi, check if WiFi is just disabled
      if (Platform.OS === 'android' && WifiScanner && !isBridgeless) {
        try {
          return await WifiScanner.isWifiEnabled();
        } catch (error) {
          console.error('Native WiFi state check failed:', error.message);
          // Best guess based on netInfo
          return netInfo.isConnected && netInfo.isInternetReachable;
        }
      }
      
      // Best guess if we can't check native state
      return netInfo.isConnected && netInfo.type !== 'cellular';
    } catch (error) {
      console.error('Error checking WiFi state:', error);
      throw error;
    }
  },
  
  // Get details about current connection
  getCurrentConnection: async () => {
    try {
      const netInfo = await NetInfo.fetch();
      if (netInfo.type === 'wifi' && netInfo.details) {
        return {
          ...netInfo.details,
          strength: netInfo.strength || 0,
          isConnected: true,
          timestamp: new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting current WiFi connection:', error);
      throw error;
    }
  },
  
  // Get current WiFi SSID directly from the device
  getCurrentWifiSSID: async () => {
    try {
      // Try with NetInfo first (most reliable on iOS)
      const netInfo = await NetInfo.fetch();
      if (netInfo.type === 'wifi' && netInfo.details && netInfo.details.ssid) {
        console.log('Got SSID from NetInfo:', netInfo.details.ssid);
        return {
          SSID: netInfo.details.ssid,
          BSSID: netInfo.details.bssid || '',
          available: true
        };
      }
      
      // If NetInfo doesn't provide SSID and native module is available (better for Android)
      if (WifiScanner && !isBridgeless) {
        try {
          console.log('Trying native getCurrentWifiSSID method...');
          const wifiInfo = await WifiScanner.getCurrentWifiSSID();
          console.log('Native SSID result:', wifiInfo);
          return wifiInfo;
        } catch (error) {
          console.error('Native WiFi SSID retrieval failed:', error.message);
          
          // Try one more approach - get from scan results if available
          try {
            console.log('Trying to get SSID from scan results...');
            const networks = await WifiScanner.getAvailableNetworks();
            
            // Find the network marked as current
            const connectedNetwork = networks.find(n => n.isCurrentNetwork);
            if (connectedNetwork && connectedNetwork.SSID) {
              console.log('Found SSID from scan results:', connectedNetwork.SSID);
              return {
                SSID: connectedNetwork.SSID,
                BSSID: connectedNetwork.BSSID || '',
                available: true
              };
            }
            
            // If no current network found, check the strongest network
            if (networks.length > 0) {
              // Networks are already sorted by signal strength
              console.log('Using strongest network as best guess:', networks[0].SSID);
              return {
                SSID: networks[0].SSID,
                BSSID: networks[0].BSSID || '',
                available: true,
                isGuess: true
              };
            }
          } catch (scanError) {
            console.error('Scan results approach failed:', scanError);
          }
          
          return { SSID: '', available: false };
        }
      }
      
      return { SSID: '', available: false };
    } catch (error) {
      console.error('Error getting current WiFi SSID:', error);
      return { SSID: '', available: false };
    }
  }
};

export default WifiScannerModule; 