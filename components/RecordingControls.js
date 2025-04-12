import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import recordingService from './RecordingService';
import { format } from 'date-fns';

const RecordingControls = ({ camera, isAutoRecordingEnabled, onToggleAutoRecording }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timer, setTimer] = useState(null);
  const [persistentAutoRecording, setPersistentAutoRecording] = useState(false);
  const [fileSize, setFileSize] = useState('0 MB');
  const [framesRecorded, setFramesRecorded] = useState(0);
  const [recordingMode, setRecordingMode] = useState('VIDEO');

  // Check if recording is active and if auto-recording is enabled on component mount
  useEffect(() => {
    const checkRecordingState = async () => {
      const recording = recordingService.activeRecordings[camera.ip];
      setIsRecording(!!recording);
      
      if (recording) {
        setFramesRecorded(recording.frameCount);
        // Start timer to update recording duration
        const intervalId = setInterval(() => {
          setRecordingDuration(Math.floor((Date.now() - recording.startTime) / 1000));
          setFramesRecorded(recording.frameCount);
          
          // Check for fallback mode
          const stats = recordingService.getRecordingStats(camera);
          if (stats && stats.isImageFallbackMode) {
            setRecordingMode('IMAGE');
          } else {
            setRecordingMode('VIDEO');
          }
          
          // Estimate file size (rough approximation)
          const estimatedSizeKB = Math.round(recording.frameCount * 30 / 1024); // Assuming 30KB per frame
          if (estimatedSizeKB > 1024) {
            setFileSize(`${(estimatedSizeKB / 1024).toFixed(1)} MB`);
          } else {
            setFileSize(`${estimatedSizeKB} KB`);
          }
        }, 1000);
        setTimer(intervalId);
      }
      
      const isAutoEnabled = await recordingService.isAutoRecordingEnabled(camera);
      setPersistentAutoRecording(isAutoEnabled);
      
      // If auto recording is different from UI state, update UI
      if (isAutoEnabled !== isAutoRecordingEnabled) {
        onToggleAutoRecording();
      }
    };
    
    checkRecordingState();
    
    // Cleanup timer when component unmounts
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [camera]);

  // Update recording status when auto-recording is toggled
  useEffect(() => {
    const updateAutoRecording = async () => {
      // Only update if the persistent state doesn't match the UI state
      if (persistentAutoRecording !== isAutoRecordingEnabled) {
        try {
          await recordingService.setAutoRecording(camera, isAutoRecordingEnabled);
          setPersistentAutoRecording(isAutoRecordingEnabled);
          
          if (isAutoRecordingEnabled) {
            Alert.alert(
              'Auto-Recording Enabled',
              'This camera will automatically record when online, even if the app is closed.'
            );
          }
        } catch (error) {
          console.error('Failed to set auto-recording:', error);
          Alert.alert('Error', 'Failed to set auto-recording');
        }
      }

      // Start or stop recording based on auto-recording setting and camera status
      if (isAutoRecordingEnabled && camera.status === 'Online' && !isRecording) {
        startRecording();
      } else if (isAutoRecordingEnabled && camera.status === 'Offline' && isRecording) {
        stopRecording();
      }
    };
    
    updateAutoRecording();
  }, [isAutoRecordingEnabled, camera.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timer) {
        clearInterval(timer);
      }
      
      // Only stop recording if auto-recording is not enabled
      if (isRecording && !isAutoRecordingEnabled) {
        recordingService.stopRecording(camera);
      }
    };
  }, [timer, isRecording, isAutoRecordingEnabled]);

  const startRecording = async () => {
    try {
      await recordingService.startRecording(camera);
      
      const recording = recordingService.activeRecordings[camera.ip];
      if (recording) {
        setIsRecording(true);
        setRecordingDuration(0);
        setFramesRecorded(0);
        setFileSize('0 MB');
        
        // Start timer to update recording duration
        const intervalId = setInterval(() => {
          setRecordingDuration(Math.floor((Date.now() - recording.startTime) / 1000));
          setFramesRecorded(recording.frameCount);
          
          // Check for fallback mode
          const stats = recordingService.getRecordingStats(camera);
          if (stats && stats.isImageFallbackMode) {
            setRecordingMode('IMAGE');
          } else {
            setRecordingMode('VIDEO');
          }
          
          // Estimate file size (rough approximation)
          const estimatedSizeKB = Math.round(recording.frameCount * 30 / 1024); // Assuming 30KB per frame
          if (estimatedSizeKB > 1024) {
            setFileSize(`${(estimatedSizeKB / 1024).toFixed(1)} MB`);
          } else {
            setFileSize(`${estimatedSizeKB} KB`);
          }
        }, 1000);
        
        setTimer(intervalId);
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = () => {
    // Don't stop recording if auto-recording is enabled
    if (isAutoRecordingEnabled) {
      Alert.alert(
        'Auto-Recording Active',
        'Cannot stop recording while auto-recording is enabled. Please disable auto-recording first.'
      );
      return;
    }
    
    recordingService.stopRecording(camera);
    setIsRecording(false);
    
    // Clear timer
    if (timer) {
      clearInterval(timer);
      setTimer(null);
    }
    
    setRecordingDuration(0);
    setFramesRecorded(0);
    setFileSize('0 MB');
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const switchToFallbackMode = () => {
    if (!isRecording) {
      // Start recording directly in fallback mode
      try {
        recordingService.startRecording(camera, null, { useImageFallback: true });
        
        const recording = recordingService.activeRecordings[camera.ip];
        if (recording) {
          setIsRecording(true);
          setRecordingMode('IMAGE');
          setRecordingDuration(0);
          setFramesRecorded(0);
          setFileSize('0 MB');
          
          // Start timer to update recording duration
          const intervalId = setInterval(() => {
            setRecordingDuration(Math.floor((Date.now() - recording.startTime) / 1000));
            setFramesRecorded(recording.frameCount);
            
            // Estimate file size
            const estimatedSizeKB = Math.round(recording.frameCount * 30 / 1024);
            if (estimatedSizeKB > 1024) {
              setFileSize(`${(estimatedSizeKB / 1024).toFixed(1)} MB`);
            } else {
              setFileSize(`${estimatedSizeKB} KB`);
            }
          }, 1000);
          
          setTimer(intervalId);
        }
      } catch (error) {
        console.error('Failed to start recording in fallback mode:', error);
        Alert.alert('Error', 'Failed to start recording in fallback mode');
      }
    } else {
      // If already recording, just let the system switch automatically
      Alert.alert(
        'Fallback Mode',
        'The system will automatically switch to image fallback mode if it detects problems with video recording.'
      );
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentDateTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

  return (
    <View style={styles.container}>
      <View style={styles.recordingInfo}>
        {isRecording && (
          <>
            <View style={styles.recordingIndicator}/>
            <Text style={styles.recordingText}>REC {formatDuration(recordingDuration)}</Text>
            <Text style={styles.dateTimeText}>{currentDateTime}</Text>
            <Text style={styles.recordingDetails}>
              {fileSize} • {framesRecorded} frames
              {recordingMode === 'IMAGE' && (
                <Text style={styles.fallbackModeText}> • IMAGE MODE</Text>
              )}
            </Text>
          </>
        )}
      </View>
      
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isAutoRecordingEnabled && styles.activeButton]}
          onPress={onToggleAutoRecording}
        >
          <Ionicons 
            name="repeat" 
            size={20} 
            color={isAutoRecordingEnabled ? "#fff" : "#ccc"} 
          />
          <Text style={[styles.buttonText, isAutoRecordingEnabled && styles.activeButtonText]}>Auto</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.button, 
            isRecording && styles.activeButton,
            isAutoRecordingEnabled && isRecording && styles.disabledButton
          ]}
          onPress={toggleRecording}
          disabled={isAutoRecordingEnabled && isRecording}
        >
          <Ionicons 
            name={isRecording ? "stop-circle" : "recording"} 
            size={20} 
            color={isRecording 
              ? (isAutoRecordingEnabled ? "#999" : "#fff") 
              : "#ccc"} 
          />
          <Text style={[
            styles.buttonText, 
            isRecording && !isAutoRecordingEnabled && styles.activeButtonText,
            isAutoRecordingEnabled && isRecording && styles.disabledButtonText
          ]}>
            {isRecording ? 'Stop' : 'Record'}
          </Text>
        </TouchableOpacity>
        
        {!isRecording && (
          <TouchableOpacity
            style={[styles.button, styles.fallbackButton]}
            onPress={switchToFallbackMode}
          >
            <Ionicons name="images" size={20} color="#FF9500" />
            <Text style={[styles.buttonText, styles.fallbackButtonText]}>Image Mode</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    marginRight: 8,
  },
  dateTimeText: {
    color: '#ccc',
    fontSize: 12,
    marginRight: 8,
  },
  recordingDetails: {
    color: '#ccc',
    fontSize: 12,
    marginLeft: 20,
  },
  controls: {
    flexDirection: 'row',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    padding: 8,
    borderRadius: 16,
    marginLeft: 8,
  },
  activeButton: {
    backgroundColor: '#007FFF',
  },
  disabledButton: {
    backgroundColor: '#555',
    opacity: 0.7,
  },
  buttonText: {
    color: '#ccc',
    fontSize: 12,
    marginLeft: 4,
  },
  activeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  disabledButtonText: {
    color: '#999',
  },
  fallbackModeText: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  fallbackButton: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
  },
  fallbackButtonText: {
    color: '#FF9500',
  },
});

export default RecordingControls; 