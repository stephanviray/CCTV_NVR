import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import WifiScanner from '../WifiScanner';
import NetInfo from '@react-native-community/netinfo';

const { width } = Dimensions.get('window');

const WifiSetupModal = ({ visible, onClose, onSave }) => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [networks, setNetworks] = useState([]);
  const [showNetworks, setShowNetworks] = useState(false);
  const [isWifiEnabled, setIsWifiEnabled] = useState(false);
  const [currentConnection, setCurrentConnection] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (visible) {
      checkWifiStatus();
      getCurrentConnection();
    }
  }, [visible]);

  const getCurrentConnection = async () => {
    try {
      // Use the NetInfo directly for more reliable connection info
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.type === 'wifi' && netInfo.details) {
        const networkSsid = netInfo.details.ssid || '';
        
        if (!networkSsid) {
          console.log('Could not retrieve SSID from NetInfo, attempting alternative methods');
          // If on Android, we could try alternative approaches here
          // For now, we'll use a clearer fallback message
        }
        
        setCurrentConnection({
          ssid: networkSsid || 'SSID Unavailable',
          bssid: netInfo.details.bssid,
          strength: netInfo.strength || 0,
          ipAddress: netInfo.details.ipAddress,
          frequency: netInfo.details.frequency,
          isConnected: true
        });
        
        // Auto-fill SSID with current connection only if we have an actual SSID
        if (networkSsid && !ssid) {
          setSsid(networkSsid);
        }
      } else {
        setCurrentConnection(null);
      }
    } catch (error) {
      console.error('Error getting current connection:', error);
    }
  };

  const checkWifiStatus = async () => {
    setErrorMessage('');
    try {
      const enabled = await WifiScanner.isWifiEnabled();
      setIsWifiEnabled(enabled);
      
      if (enabled) {
        scanNetworks();
      } else {
        setErrorMessage('WiFi is disabled. Please enable WiFi in your device settings.');
      }
    } catch (error) {
      console.error('Error checking WiFi status:', error);
      // Fallback to NetInfo
      try {
        const netInfo = await NetInfo.fetch();
        setIsWifiEnabled(netInfo.type === 'wifi');
        
        if (netInfo.type === 'wifi') {
          scanNetworks();
        } else {
          setErrorMessage('Cannot detect WiFi state. Please ensure WiFi is enabled.');
        }
      } catch (netInfoError) {
        setErrorMessage('Failed to check WiFi status: ' + error.message);
      }
    }
  };

  const scanNetworks = async () => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    
    setScanning(true);
    setErrorMessage('');
    try {
      const availableNetworks = await WifiScanner.getAvailableNetworks();
      
      if (!availableNetworks || availableNetworks.length === 0) {
        setErrorMessage('No networks found. Make sure WiFi is enabled and try again.');
        setNetworks([]);
        setShowNetworks(false);
        return;
      }
      
      // Remove duplicates by SSID and sort by signal strength
      const uniqueNetworks = [...new Map(availableNetworks.map(item => 
        [item.SSID, item])).values()];
      
      uniqueNetworks.sort((a, b) => b.level - a.level);
      
      setNetworks(uniqueNetworks);
      setShowNetworks(true);
      setErrorMessage('');
    } catch (error) {
      console.error('WiFi scan error:', error);
      setErrorMessage('Failed to scan WiFi networks: ' + (error.message || 'Unknown error'));
      
      // Try to at least show the current connection if available
      if (currentConnection && currentConnection.ssid) {
        const currentNetwork = {
          SSID: currentConnection.ssid,
          BSSID: currentConnection.bssid || '00:00:00:00:00:00',
          level: currentConnection.strength ? Math.floor(-50 * (1 - currentConnection.strength)) : -65,
          isCurrentNetwork: true,
          isSecured: true
        };
        setNetworks([currentNetwork]);
        setShowNetworks(true);
      }
    } finally {
      setScanning(false);
      setRefreshing(false);
    }
  };

  const handleSave = () => {
    if (!ssid.trim()) {
      Alert.alert('Error', 'Please enter the WiFi SSID');
      return;
    }

    const wifiConfig = {
      type: 'wifi',
      ssid: ssid.trim(),
      password: password.trim(),
      timestamp: new Date().toISOString(),
    };

    // Save the configuration
    onSave(wifiConfig);
    
    // Generate QR code with the same configuration
    setShowQR(true);
  };

  const handleNetworkSelect = (network) => {
    setSsid(network.SSID);
    setShowNetworks(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    checkWifiStatus();
    getCurrentConnection();
  };

  const renderNetworkItem = ({ item }) => {
    // Calculate signal strength icon based on level
    // WiFi levels typically range from -100 dBm (weak) to -50 dBm (strong)
    const getSignalIcon = () => {
      if (item.level > -50) return "wifi";
      if (item.level > -70) return "wifi-outline";
      return "wifi-weak";
    };

    return (
      <TouchableOpacity 
        style={[
          styles.networkItem, 
          item.isCurrentNetwork && styles.currentNetworkItem
        ]}
        onPress={() => handleNetworkSelect(item)}
      >
        <View style={styles.networkInfo}>
          <Text style={styles.networkName}>
            {item.SSID}
            {item.isCurrentNetwork && " (Connected)"}
          </Text>
          <View style={styles.securityContainer}>
            {item.isSecured && <Ionicons name="lock-closed" size={12} color="#999" />}
            <Text style={styles.securityText}>
              {item.isSecured ? 'Secured' : 'Open'}
            </Text>
          </View>
        </View>
        <Ionicons name={getSignalIcon()} size={20} color={item.isCurrentNetwork ? "#4caf50" : "#007FFF"} />
      </TouchableOpacity>
    );
  };

  const generateQRData = () => {
    // Format: WIFI:T:WPA;S:<SSID>;P:<password>;;
    const wifiConfig = `WIFI:T:WPA;S:${encodeURIComponent(ssid.trim())};P:${encodeURIComponent(password.trim())};;`;
    return wifiConfig;
  };

  const renderCurrentConnection = () => {
    if (!currentConnection || !currentConnection.isConnected) return null;
    
    return (
      <View style={styles.currentConnectionContainer}>
        <Text style={styles.currentConnectionTitle}>Current Connection</Text>
        <View style={styles.currentConnectionDetails}>
          <Text style={styles.currentConnectionText}>
            Network: {currentConnection.ssid}
          </Text>
          {currentConnection.ipAddress && (
            <Text style={styles.currentConnectionText}>
              IP: {currentConnection.ipAddress}
            </Text>
          )}
          <View style={styles.signalStrengthContainer}>
            <Text style={styles.currentConnectionText}>Signal: </Text>
            <View style={styles.signalBars}>
              {[0, 1, 2, 3].map(bar => (
                <View 
                  key={bar}
                  style={[
                    styles.signalBar,
                    { 
                      height: 3 + (bar * 3),
                      backgroundColor: bar < Math.ceil(currentConnection.strength * 4) 
                        ? '#4caf50' 
                        : '#666'
                    }
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>WiFi Setup</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {!showQR ? (
            <FlatList
              data={[{ key: 'content' }]}
              renderItem={() => (
                <View style={styles.formContainer}>
                  {/* Current WiFi connection info */}
                  {renderCurrentConnection()}
                  
                  {/* Error message display */}
                  {errorMessage ? (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={20} color="#FF3B30" />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}

                  {/* WiFi input fields */}
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>WiFi Name (SSID)</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter WiFi name"
                        placeholderTextColor="#999"
                        value={ssid}
                        onChangeText={setSsid}
                      />
                      <TouchableOpacity 
                        style={styles.scanButton}
                        onPress={() => setShowNetworks(!showNetworks)}
                      >
                        <Ionicons name="scan-outline" size={24} color="#007FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {showNetworks && (
                    <View style={styles.networksContainer}>
                      <Text style={styles.networkListTitle}>Available Networks</Text>
                      <FlatList
                        data={networks}
                        renderItem={renderNetworkItem}
                        keyExtractor={(item, index) => `${item.SSID}-${index}`}
                        style={styles.networkList}
                        contentContainerStyle={styles.networkListContent}
                        refreshControl={
                          <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#007FFF"
                            title="Refreshing..."
                            titleColor="#999"
                          />
                        }
                      />
                    </View>
                  )}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter WiFi password"
                        placeholderTextColor="#999"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.generateQRButton}
                    onPress={() => setShowQR(true)}
                  >
                    <Ionicons name="qr-code-outline" size={24} color="#fff" />
                    <Text style={styles.generateQRButtonText}>Generate QR Code</Text>
                  </TouchableOpacity>
                </View>
              )}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#007FFF"
                  title="Refreshing..."
                  titleColor="#999"
                />
              }
            />
          ) : (
            <View style={styles.qrContainer}>
              <QRCode
                value={generateQRData()}
                size={width * 0.6}
              />
              <Text style={styles.qrInstructions}>
                Scan this QR code with your camera to connect to WiFi
              </Text>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setShowQR(false)}
              >
                <Text style={styles.backButtonText}>Back to Setup</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 20,
    width: width * 0.9,
    maxHeight: width * 1.6, // Increased height to accommodate network list
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
  },
  input: {
    flex: 1,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
  },
  scanButton: {
    padding: 12,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  networksContainer: {
    marginBottom: 20,
    maxHeight: 200,
  },
  networkListTitle: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  networkList: {
    maxHeight: 180,
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
  },
  networkListContent: {
    padding: 4,
  },
  networkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
  },
  currentNetworkItem: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  networkInfo: {
    flex: 1,
    marginRight: 8,
  },
  networkName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  securityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityText: {
    color: '#999',
    fontSize: 12,
    marginLeft: 4,
  },
  wifiDisabledMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 10,
    marginBottom: 20,
  },
  wifiDisabledText: {
    color: '#FFC107',
    fontSize: 14,
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  currentConnectionContainer: {
    padding: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 10,
    marginBottom: 16,
  },
  currentConnectionTitle: {
    color: '#007FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  currentConnectionDetails: {
    paddingLeft: 8,
  },
  currentConnectionText: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 4,
  },
  signalStrengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 12,
    marginLeft: 4,
  },
  signalBar: {
    width: 3,
    marginHorizontal: 1,
    borderRadius: 1,
  },
  generateQRButton: {
    backgroundColor: '#007FFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  generateQRButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  qrContainer: {
    alignItems: 'center',
    padding: 20,
  },
  qrInstructions: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#2C2C2C',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default WifiSetupModal; 