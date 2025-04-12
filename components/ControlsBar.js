import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ControlsBar = ({ frameRate, handleFPSChange, toggleFullScreen, isFullScreen, onPlaybackListPress, onDetectionPress }) => {
  return (
    <View style={styles.controlsBar}>
      <TouchableOpacity
        style={styles.controlButton}
        onPress={onPlaybackListPress}
      >
        <Ionicons name="list-outline" size={24} color="#fff" />
        <Text style={styles.controlText}>Recordings</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.controlButton}
        onPress={onDetectionPress}
      >
        <Ionicons name="alert-circle-outline" size={24} color="#fff" />
        <Text style={styles.controlText}>Detection</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.controlButton}
        onPress={toggleFullScreen}
      >
        <Ionicons name={isFullScreen ? 'contract-outline' : 'expand-outline'} size={24} color="#fff" />
        <Text style={styles.controlText}>{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {
    color: '#ccc',
    marginTop: 6,
    fontSize: 12,
  },
  disabledText: {
    color: '#666',
  },
});

export default ControlsBar;