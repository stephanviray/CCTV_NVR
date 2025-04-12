import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { format, parseISO } from 'date-fns';
import { Video } from 'expo-av';
import recordingService from './RecordingService';

const RecordingsScreen = ({ camera, selectedCamera, navigation, onBack }) => {
  // Use camera or selectedCamera (for compatibility with both prop patterns)
  const currentCamera = selectedCamera || camera;
  const [recordings, setRecordings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState({});
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [storageStats, setStorageStats] = useState({ totalSize: 0 });
  const videoRef = useRef(null);

  // Handle navigation functions based on what's available
  const handleBack = useCallback(() => {
    if (navigation && navigation.goBack) {
      navigation.goBack();
    } else if (onBack) {
      onBack();
    }
  }, [navigation, onBack]);

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return format(date, 'MMM dd, yyyy HH:mm');
  };

  const loadRecordings = useCallback(async () => {
    if (!currentCamera) {
      setIsLoading(false);
      setRecordings([]);
      return;
    }
    
    try {
      // Check for permissions first
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Media Library permissions are required to view recordings.');
        setIsLoading(false);
        return;
      }
      
      const recordingsList = await recordingService.getRecordings(currentCamera);
      // Sort by date, newest first
      recordingsList.sort((a, b) => b.date - a.date);
      setRecordings(recordingsList);
      
      // Get total storage usage
      const totalStorage = await recordingService.calculateTotalStorage();
      setStorageStats({
        totalSize: totalStorage,
        formattedSize: recordingService.formatFileSize(totalStorage)
      });
      
    } catch (error) {
      console.error('Failed to load recordings:', error);
      Alert.alert('Error', 'Failed to load recordings');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [currentCamera]);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // Update navigation title if navigation is available
  useEffect(() => {
    if (navigation && navigation.setOptions && currentCamera) {
      navigation.setOptions({
        title: `${currentCamera.name} Recordings`
      });
    }
  }, [navigation, currentCamera]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecordings();
  }, [loadRecordings]);

  const toggleSelection = (recording) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedRecordings([recording]);
      return;
    }

    const isSelected = selectedRecordings.some(item => item.id === recording.id);
    
    if (isSelected) {
      setSelectedRecordings(selectedRecordings.filter(item => item.id !== recording.id));
      if (selectedRecordings.length === 1) {
        setIsSelectionMode(false);
      }
    } else {
      setSelectedRecordings([...selectedRecordings, recording]);
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedRecordings([]);
  };

  const deleteSelected = async () => {
    Alert.alert(
      'Delete Recordings',
      `Are you sure you want to delete ${selectedRecordings.length} recording(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              
              // Delete each selected recording
              for (const recording of selectedRecordings) {
                await recordingService.deleteRecording(recording.id);
              }
              
              // Refresh the recordings list
              await loadRecordings();
              setIsSelectionMode(false);
              setSelectedRecordings([]);
            } catch (error) {
              console.error('Failed to delete recordings:', error);
              Alert.alert('Error', 'Failed to delete recordings');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const playVideo = async (recording) => {
    if (isSelectionMode) {
      toggleSelection(recording);
      return;
    }
    
    console.log('Playing video:', recording.path);
    
    try {
      // Check if the file exists
      const fileInfo = await FileSystem.getInfoAsync(recording.path);
      if (fileInfo.exists) {
        // Set the selected video and start playing
        setSelectedVideo(recording);
        setIsPlaying(true);
      } else {
        Alert.alert('Error', 'Recording file not found');
      }
    } catch (error) {
      console.error('Error playing video:', error);
      Alert.alert('Error', 'Could not play the recording: ' + error.message);
    }
  };

  const closePlayer = () => {
    if (videoRef.current) {
      videoRef.current.stopAsync();
    }
    setSelectedVideo(null);
    setIsPlaying(false);
    setPlaybackPosition(0);
  };

  const handlePlaybackStatusUpdate = (status) => {
    setPlaybackStatus(status);
    if (status.didJustFinish) {
      // Video playback completed
      setIsPlaying(false);
    }
    if (status.positionMillis) {
      setPlaybackPosition(status.positionMillis);
    }
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // Debug function to check recording paths
  const debugRecordings = async () => {
    try {
      // Check media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log('Media Library permissions:', status);
      
      if (status === 'granted') {
        // Get all video media
        const { assets } = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.video,
          first: 20,
        });
        
        console.log('Found videos in media library:', assets.length);
        
        // Get all albums
        const albums = await MediaLibrary.getAlbumsAsync();
        console.log('Found albums:', albums.map(a => a.title).join(', '));
        
        // Check for camera specific album
        if (currentCamera) {
          const albumName = `Security Recordings - ${currentCamera.name}`;
          const album = albums.find(a => a.title === albumName);
          
          if (album) {
            console.log('Found camera album:', album.title, 'with', album.assetCount, 'assets');
            
            // Get assets in album
            const albumAssets = await MediaLibrary.getAssetsAsync({
              album: album.id,
              mediaType: MediaLibrary.MediaType.video,
            });
            
            console.log('Album assets:', albumAssets.assets.length);
          } else {
            console.log('No camera album found');
          }
        } else {
          console.log('No camera selected for album search');
        }
      }
      
      Alert.alert('Debug Info', 'Check console for recording path information');
    } catch (error) {
      console.error('Debug error:', error);
      Alert.alert('Debug Error', error.message);
    }
  };

  // Create a test recording
  const createTestRecording = async () => {
    if (!currentCamera) {
      Alert.alert('Error', 'No camera selected');
      return;
    }
    
    Alert.alert(
      'Create Test Recording',
      'This will start a real recording from the camera. A 10-second clip will be recorded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Recording',
          onPress: async () => {
            try {
              setIsLoading(true);
              
              // Check if the camera is already being recorded
              if (recordingService.isRecording(currentCamera)) {
                Alert.alert('Recording Active', 'This camera is already being recorded. Please stop the existing recording first.');
                setIsLoading(false);
                return;
              }
              
              // Start recording
              await recordingService.startRecording(currentCamera);
              Alert.alert('Recording Started', 'Recording for 10 seconds...');
              
              // Set a timeout to stop recording after 10 seconds
              setTimeout(() => {
                try {
                  // Only stop if still recording (could have been stopped by error)
                  if (recordingService.isRecording(currentCamera)) {
                    recordingService.stopRecording(currentCamera);
                    console.log('Test recording completed');
                    
                    // Wait a bit for the file to be processed and added to the media library
                    setTimeout(async () => {
                      await loadRecordings();
                      setIsLoading(false);
                      Alert.alert('Recording Complete', 'Test recording saved successfully.');
                    }, 2000);
                  } else {
                    console.log('Recording already stopped');
                    setIsLoading(false);
                    loadRecordings();
                  }
                } catch (stopError) {
                  console.error('Error stopping test recording:', stopError);
                  setIsLoading(false);
                  Alert.alert('Error', 'Failed to stop recording: ' + stopError.message);
                  loadRecordings();
                }
              }, 10000);
              
            } catch (error) {
              console.error('Error creating test recording:', error);
              Alert.alert('Error', 'Failed to create test recording: ' + error.message);
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderRecordingItem = ({ item }) => {
    const isSelected = selectedRecordings.some(recording => recording.id === item.id);
    
    const recordingDate = format(item.date, 'MMM dd, yyyy HH:mm:ss');
    const duration = item.duration 
      ? `${Math.floor(item.duration / 60)}:${Math.floor(item.duration % 60).toString().padStart(2, '0')}`
      : '00:00';
      
    const fileSize = item.fileSize 
      ? recordingService.formatFileSize(item.fileSize)
      : 'Unknown';
    
    return (
      <TouchableOpacity
        style={[styles.recordingItem, isSelected && styles.selectedItem]}
        onPress={() => isSelectionMode ? toggleSelection(item) : playVideo(item)}
        onLongPress={() => toggleSelection(item)}
      >
        <View style={styles.recordingItemContent}>
          <View style={styles.thumbnailContainer}>
            <Ionicons 
              name="videocam" 
              size={24} 
              color={isSelected ? "#fff" : "#007FFF"} 
              style={styles.videoIcon}
            />
          </View>
          
          <View style={styles.recordingInfo}>
            <Text style={[styles.recordingName, isSelected && styles.selectedText]}>
              {item.fileName}
            </Text>
            <Text style={styles.recordingDate}>
              {recordingDate}
            </Text>
            <Text style={styles.recordingDetails}>
              {duration} • {item.width}x{item.height} • {fileSize}
            </Text>
          </View>
          
          {isSelectionMode ? (
            <Ionicons 
              name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
              size={24} 
              color={isSelected ? "#007FFF" : "#666"} 
            />
          ) : (
            <Ionicons name="play-circle-outline" size={24} color="#007FFF" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const formatProgress = (progress) => {
    if (!selectedVideo || !playbackStatus.durationMillis) return '00:00 / 00:00';
    
    const position = Math.floor(progress / 1000);
    const duration = Math.floor((playbackStatus.durationMillis || 0) / 1000);
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return `${formatTime(position)} / ${formatTime(duration)}`;
  };

  const getCameraName = () => {
    if (currentCamera && currentCamera.name) {
      return currentCamera.name;
    }
    return 'Camera';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={isSelectionMode ? cancelSelection : handleBack} style={styles.backButton}>
          <Ionicons name={isSelectionMode ? "close" : "arrow-back"} size={24} color="#fff" />
        </TouchableOpacity>
        
        <Text style={styles.title}>
          {isSelectionMode 
            ? `${selectedRecordings.length} selected` 
            : `${getCameraName()} Recordings`}
        </Text>
        
        {isSelectionMode ? (
          <TouchableOpacity onPress={deleteSelected} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={createTestRecording} style={styles.headerButton}>
              <Ionicons name="add-circle-outline" size={24} color="#4CAF50" />
            </TouchableOpacity>
            <TouchableOpacity onPress={debugRecordings} style={styles.headerButton}>
              <Ionicons name="bug-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* Show storage info if available */}
      {storageStats.totalSize > 0 && (
        <View style={styles.storageInfo}>
          <Text style={styles.storageText}>
            Total Storage: {storageStats.formattedSize}
          </Text>
        </View>
      )}
      
      {/* Recordings List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007FFF" />
        </View>
      ) : (
        <FlatList
          data={recordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.recordingsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#007FFF"]}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="videocam-off" size={48} color="#666" />
              <Text style={styles.emptyText}>No recordings found</Text>
              <Text style={styles.emptySubtext}>
                {currentCamera ? 'Tap the + button to create a test recording' : 'Please select a camera first'}
              </Text>
            </View>
          )}
        />
      )}

      {/* Video Player Modal */}
      <Modal
        visible={isPlaying}
        transparent={true}
        animationType="fade"
        onRequestClose={closePlayer}
      >
        <View style={styles.modalContainer}>
          <View style={styles.videoPlayerContainer}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerTitle}>
                {selectedVideo?.fileName || 'Recording Playback'}
              </Text>
              <View style={styles.playerControls}>
                <Text style={styles.durationText}>
                  {formatProgress(playbackPosition)}
                </Text>
                <TouchableOpacity 
                  style={styles.playerControlButton}
                  onPress={closePlayer}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {selectedVideo ? (
              <Video
                ref={videoRef}
                source={{ uri: selectedVideo.path }}
                rate={1.0}
                volume={1.0}
                isMuted={false}
                resizeMode="contain"
                shouldPlay={isPlaying}
                useNativeControls
                style={styles.videoPlayer}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={error => {
                  console.error('Video error:', error);
                  Alert.alert(
                    'Video Error',
                    'Failed to load the video file',
                    [{ text: 'OK', onPress: closePlayer }]
                  );
                }}
              />
            ) : (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007FFF" />
                <Text style={styles.loadingText}>Loading video...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginLeft: 16,
  },
  deleteButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingsList: {
    padding: 16,
  },
  recordingItem: {
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    marginBottom: 12,
    overflow: 'hidden',
  },
  selectedItem: {
    backgroundColor: '#2C5282',
  },
  recordingItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  thumbnailContainer: {
    width: 50,
    height: 50,
    borderRadius: 4,
    backgroundColor: 'rgba(0,127,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIcon: {
    opacity: 0.8,
  },
  recordingInfo: {
    flex: 1,
    marginLeft: 16,
  },
  recordingName: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  selectedText: {
    fontWeight: 'bold',
  },
  recordingDate: {
    fontSize: 12,
    color: '#999',
  },
  recordingDetails: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayerContainer: {
    width: '90%',
    height: '70%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#121212',
  },
  playerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerControlButton: {
    padding: 8,
  },
  durationText: {
    color: '#fff',
    fontSize: 14,
    marginRight: 16,
  },
  videoPlayer: {
    width: '100%',
    height: '90%',
    backgroundColor: '#000',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  storageInfo: {
    backgroundColor: '#1A1A1A',
    padding: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  storageText: {
    color: '#aaa',
    fontSize: 14,
  },
});

export default RecordingsScreen; 