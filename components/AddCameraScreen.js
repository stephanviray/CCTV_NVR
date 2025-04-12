import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WifiManager from 'react-native-wifi-reborn';

const AddCameraScreen = ({ onClose, onCameraAdded }) => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [serial, setSerial] = useState('');

  useEffect(() => {
    const fetchSSID = async () => {
      try {
        const currentSSID = await WifiManager.getCurrentWifiSSID();
        setSsid(currentSSID);
      } catch (error) {
        Alert.alert('Error', 'Unable to fetch Wi-Fi SSID.');
      }
    };
    fetchSSID();
  }, []);

  const handleAddCamera = async () => {
    if (!ssid || !password || !serial) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    try {
      const response = await fetch('http://<YOUR_CAMERA_IP>/configure_wifi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ssid, password, serial }),
      });

      if (!response.ok) {
        throw new Error('Failed to configure Wi-Fi');
      }

      Alert.alert('Success', 'Camera added successfully!');
      onCameraAdded(serial); // Notify parent component that camera is added
      onClose(); // Close the add camera screen
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Camera</Text>
      <TextInput
        style={styles.input}
        placeholder="Camera Serial"
        value={serial}
        onChangeText={setSerial}
      />
      <TextInput
        style={styles.input}
        placeholder="Wi-Fi Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="SSID"
        value={ssid}
        editable={false} // Disable editing for SSID
      />
      <TouchableOpacity style={styles.button} onPress={handleAddCamera}>
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={styles.buttonText}>Add Camera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Ionicons name="close-circle" size={20} color="#FF3B30" />
        <Text style={styles.closeButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    color: '#fff',
  },
  button: {
    backgroundColor: '#007FFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  closeButton: {
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FF3B30',
    marginTop: 5,
  },
});

export default AddCameraScreen;