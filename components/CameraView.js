import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import ControlsBar from './ControlsBar';
import RecordingControls from './RecordingControls';
import RecordingsScreen from './RecordingsScreen';
import * as ScreenOrientation from 'expo-screen-orientation';
import recordingService from './RecordingService';

const CameraView = ({ cameraName, videoConfig, handleDisconnect, webViewRef, webViewHTML, frameRate, setFrameRate, handleLogout, camera }) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [frameData, setFrameData] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height
  });
  const [isAutoRecordingEnabled, setIsAutoRecordingEnabled] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [recordingStats, setRecordingStats] = useState(null);
  const statsTimerRef = useRef(null);

  // Update dimensions on orientation change
  useEffect(() => {
    const updateDimensions = () => {
      const { width, height } = Dimensions.get('window');
      setDimensions({ width, height });
    };

    // Add event listener for orientation changes
    Dimensions.addEventListener('change', updateDimensions);

    // Clean up event listener
    return () => {
      // Cleanup for newer RN versions
      if (Dimensions.removeEventListener) {
        Dimensions.removeEventListener('change', updateDimensions);
      }
    };
  }, []);

  // Update WebView with new frame data
  useEffect(() => {
    if (frameData && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'videoFrame', data: frameData }));
    }
  }, [frameData]);

  // Check and update recording status
  useEffect(() => {
    if (!camera) return;

    const updateRecordingStatus = async () => {
      // Check if auto-recording is enabled for this camera
      const isAutoEnabled = await recordingService.isAutoRecordingEnabled(camera);
      setIsAutoRecordingEnabled(isAutoEnabled);
      
      // Get recording stats if recording
      const isRecording = recordingService.isRecording(camera);
      if (isRecording) {
        const stats = recordingService.getRecordingStats(camera);
        setRecordingStats(stats);
      } else {
        setRecordingStats(null);
      }
    };
    
    // Initial check
    updateRecordingStatus();
    
    // Set up periodic checks while mounted
    statsTimerRef.current = setInterval(updateRecordingStatus, 1000);
    
    return () => {
      if (statsTimerRef.current) {
        clearInterval(statsTimerRef.current);
      }
    };
  }, [camera]);

  const toggleFullScreen = async () => {
    if (!isFullScreen) {
      // Lock to landscape when entering fullscreen
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      // Unlock orientation when exiting fullscreen
      await ScreenOrientation.unlockAsync();
    }
    setIsFullScreen(!isFullScreen);
  };

  // Cleanup orientation lock when component unmounts
  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  const handleFPSChange = (delta) => {
    const newFrameRate = frameRate + delta;
    if (newFrameRate >= 5 && newFrameRate <= 30) {
      setFrameRate(newFrameRate);
    }
  };

  const handlePlaybackListPress = () => {
    console.log('Opening recordings for camera:', camera.name);
    setShowRecordings(true);
  };

  const handleDetectionPress = () => {
    console.log('Detection pressed');
  };

  const handleToggleAutoRecording = () => {
    setIsAutoRecordingEnabled(!isAutoRecordingEnabled);
  };

  if (showRecordings) {
    return (
      <RecordingsScreen 
        selectedCamera={camera} 
        navigation={{ 
          setOptions: (options) => console.log('Navigation options:', options),
          goBack: () => setShowRecordings(false)
        }}
      />
    );
  }

  return (
    <View style={[
      styles.cameraContainer, 
      isFullScreen && {
        ...styles.fullScreenContainer,
        width: dimensions.width,
        height: dimensions.height
      }
    ]}>
      {/* Header */}
      {!isFullScreen && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="videocam" size={24} color="#007FFF" />
            <Text style={styles.cameraNameText}>
              {cameraName || 'IP Camera'}
            </Text>
            
            {/* Camera Status Indicator */}
            <View style={[
              styles.statusIndicator, 
              { backgroundColor: camera?.status === 'Online' ? '#4CD964' : '#FF3B30' }
            ]} />
            <Text style={styles.statusText}>
              {camera?.status || 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.headerRight}>
            {recordingStats && (
              <View style={styles.recordingStatsBadge}>
                <Ionicons name="recording" size={12} color="#FF3B30" style={styles.recordingIcon} />
                <Text style={styles.recordingStatsText}>
                  {recordingStats.frameCount} frames • {recordingStats.frameRate} fps
                </Text>
              </View>
            )}
            {videoConfig && (
              <View style={styles.resolutionBadge}>
                <Text style={styles.resolutionText}>
                  {videoConfig.width}x{videoConfig.height}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* WebView for Video Stream */}
      <View style={[
        styles.cameraView, 
        isFullScreen && {
          ...styles.fullScreenCameraView,
          width: dimensions.width,
          height: dimensions.height
        }
      ]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: webViewHTML }}
          style={styles.webview}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          javaScriptCanOpenWindowsAutomatically={false}
          startInLoadingState={false}
          renderToHardwareTextureAndroid={true}
          androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
          cacheEnabled={true}
          cacheMode="LOAD_NO_CACHE"
          onError={(err) => console.log('WebView error:', err)}
        />
      </View>

      {/* Recording Controls */}
      {!isFullScreen && camera && (
        <RecordingControls
          camera={camera}
          isAutoRecordingEnabled={isAutoRecordingEnabled}
          onToggleAutoRecording={handleToggleAutoRecording}
        />
      )}

      {/* Controls Bar */}
      {!isFullScreen && (
        <ControlsBar
          frameRate={frameRate}
          handleFPSChange={handleFPSChange}
          toggleFullScreen={toggleFullScreen}
          isFullScreen={isFullScreen}
          onPlaybackListPress={handlePlaybackListPress}
          onDetectionPress={handleDetectionPress}
        />
      )}

      {/* Exit Fullscreen Button (Visible only in Fullscreen Mode) */}
      {isFullScreen && (
        <TouchableOpacity
          style={[
            styles.exitFullScreenButton,
            { 
              top: dimensions.height - 80,
              right: 50
            }
          ]}
          onPress={toggleFullScreen}
        >
          <Ionicons name="contract-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 10,
    marginRight: 10,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#ccc',
  },
  recordingStatsBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIcon: {
    marginRight: 4,
  },
  recordingStatsText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resolutionBadge: {
    backgroundColor: '#007FFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 10,
  },
  resolutionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disconnectButton: {
    backgroundColor: '#FF3B30',
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  logoutButton: {
    backgroundColor: '#666',
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    marginLeft: 10,
  },
  cameraView: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenCameraView: {
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  exitFullScreenButton: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 24,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CameraView;