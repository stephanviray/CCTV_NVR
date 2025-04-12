import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ConnectionForm = ({
  cameraName,
  setCameraName,
  cameraIP,
  setCameraIP,
  cameraLocation,
  setCameraLocation,
  handleConnect,
  handleCancel,
}) => {
  const [ipError, setIpError] = useState('');

  const validateIP = (ip) => {
    // Check for just IP address format (like 192.168.1.1)
    const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // Check for IP with optional port (like 192.168.1.1:8080)
    const ipWithPortRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\:[0-9]{1,5})?$/;
    
    // More permissive hostname regex (allows for single-word hostnames and domain names)
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/;
    
    // Check for websocket URL format (like ws://192.168.1.1:8080)
    const wsRegex = /^ws:\/\/((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\:[0-9]{1,5})?$/;
    
    // If it's just digits, assume it's a valid hostname or IP component
    if (/^\d+$/.test(ip)) return true;
    
    return ipv4Regex.test(ip) || ipWithPortRegex.test(ip) || hostnameRegex.test(ip) || wsRegex.test(ip);
  };

  const handleConnectPress = () => {
    if (!cameraName.trim()) {
      Alert.alert('Error', 'Please enter a camera name.');
      return;
    }

    if (!cameraIP.trim()) {
      Alert.alert('Error', 'Please enter the camera IP address.');
      return;
    }

    if (!validateIP(cameraIP)) {
      setIpError('Please enter a valid address format: IP (192.168.1.100), IP with port (192.168.1.100:8080), hostname (camera1) or full domain (camera.local)');
      return;
    }

    if (!cameraLocation.trim()) {
      Alert.alert('Error', 'Please enter the camera location.');
      return;
    }

    setIpError('');
    handleConnect();
  };

  return (
    <Modal
      transparent={true}
      animationType="slide"
      visible={true}
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.formContainer}>
            <View style={styles.card}>
              <Text style={styles.formTitle}>Add Camera</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Camera Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="pricetag-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter camera name (e.g., Front Door)"
                    placeholderTextColor="#999"
                    value={cameraName}
                    onChangeText={setCameraName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Camera IP Address</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="globe-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter IP address (e.g., 192.168.1.100:8000)"
                    placeholderTextColor="#999"
                    value={cameraIP}
                    onChangeText={(text) => {
                      setCameraIP(text);
                      setIpError('');
                    }}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
                {ipError ? <Text style={styles.errorText}>{ipError}</Text> : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Camera Location</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="location-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter location (e.g., Living Room)"
                    placeholderTextColor="#999"
                    value={cameraLocation}
                    onChangeText={setCameraLocation}
                  />
                </View>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.connectButton}
                  onPress={handleConnectPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="link-outline" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>Add</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
  },
  formContainer: {
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
    color: '#ccc',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputIcon: {
    padding: 12,
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: '#fff',
  },
  buttonContainer: {
    marginTop: 10,
  },
  connectButton: {
    backgroundColor: '#007FFF',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#007FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 14,
    marginTop: 8,
  },
});

export default ConnectionForm;
