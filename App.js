import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  SafeAreaView, 
  StatusBar, 
  Text, 
  TouchableOpacity, 
  Alert, 
  InteractionManager,
  FlatList, 
  Dimensions, 
  RefreshControl,
  Image,
  Animated
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useWebSocket from 'react-native-use-websocket';
import { BlurView } from 'expo-blur';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import ConnectionForm from './components/ConnectionForm';
import CameraView from './components/CameraView';
import WifiSetupModal from './components/WifiSetupModal';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import { format } from 'date-fns';
import recordingService from './components/RecordingService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85;
const SPACING = width * 0.03;

const App = () => {
  const [previewFrames, setPreviewFrames] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [cameraIP, setCameraIP] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [cameraLocation, setCameraLocation] = useState('');
  const [socketUrl, setSocketUrl] = useState(null);
  const [videoConfig, setVideoConfig] = useState(null);
  const [isProcessingFrame, setIsProcessingFrame] = useState(false);
  const [frameRate, setFrameRate] = useState(30);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showWifiSetup, setShowWifiSetup] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [webViewHTML, setWebViewHTML] = useState(`
   <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Video Player</title>
    <style>
      body, html { 
        margin: 0; 
        padding: 0; 
        width: 100%; 
        height: 100%; 
        overflow: hidden; 
        background-color: #000;
        touch-action: none;
      }
      #videoPlayer {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
      }
      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        will-change: transform;
      }
      .status {
        position: absolute;
        bottom: 10px;
        left: 10px;
        color: white;
        background-color: rgba(0,0,0,0.5);
        padding: 5px 10px;
        border-radius: 20px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div id="videoPlayer">
      <img id="videoElement" src="" alt="Video stream">
      <div class="status" id="status">Waiting for video...</div>
    </div>
    
    <script>
      let statusElement = document.getElementById('status');
      let imgElement = document.getElementById('videoElement');
      let frameCount = 0;
      let lastTime = Date.now();
      let fps = 0;
      let bufferSize = 0;
      let showingFrame = false;
      
      function updateFrame(base64data) {
        if (showingFrame) return;
        
        showingFrame = true;
        requestAnimationFrame(() => {
          try {
            imgElement.src = 'data:image/jpeg;base64,' + base64data;
            frameCount++;
            showingFrame = false;
          } catch (error) {
            console.error('Error updating frame:', error);
            showingFrame = false;
          }
        });
      }

      document.addEventListener('message', function(event) {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'videoFrame') {
            updateFrame(message.data);
            
            const now = Date.now();
            if (now - lastTime >= 1000) {
              fps = frameCount / ((now - lastTime) / 1000);
              statusElement.innerText = 'FPS: ' + fps.toFixed(1);
              frameCount = 0;
              lastTime = now;
            }
          }
        } catch (error) {
          console.error('WebView error:', error);
          statusElement.innerText = 'Error: ' + error.message;
        }
      });
      
      window.addEventListener('load', function() {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'viewReady'
        }));
      });
    </script>
  </body>
  </html>
`);
  const tabBarAnimation = useRef(new Animated.Value(0)).current;
  const tabItemWidth = width / 3;
  const indicatorWidth = tabItemWidth * 0.5;

  const flatListRef = useRef(null);
  const webViewRef = useRef(null);
  const lastFrameTime = useRef(0);
  const frameQueue = useRef([]);
  const frameProcessorTimeout = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Add these refs after other refs
  const homeIconAnim = useRef(new Animated.Value(1)).current;
  const wifiIconAnim = useRef(new Animated.Value(1)).current;
  const addIconAnim = useRef(new Animated.Value(1)).current;

  // Function to check camera status
  const checkCameraStatus = useCallback(async (camera) => {
    try {
      // Format IP properly for WebSocket URL
      let formattedIP = camera.ip;
      
      // If it doesn't start with ws://, add it
      if (!formattedIP.startsWith('ws://')) {
        formattedIP = `ws://${formattedIP}`;
      }
      
      // Make sure the path ends with /ws if not already present
      if (!formattedIP.endsWith('/ws')) {
        // Check if there's already a path
        if (formattedIP.includes('/') && !formattedIP.endsWith('/')) {
          formattedIP = `${formattedIP}/ws`;
        } else {
          formattedIP = `${formattedIP}/ws`;
        }
      }
      
      const ws = new WebSocket(formattedIP);
      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.close();
          resolve(true);
        };
        ws.onerror = () => reject(false);
        setTimeout(() => reject(false), 2000); // Timeout after 2 seconds
      });
      return 'Online';
    } catch (error) {
      return 'Offline';
    }
  }, []);

  // Function to refresh camera statuses
  const refreshCameraStatuses = useCallback(async () => {
    if (!currentUser) return;
    
    setRefreshing(true);
    
    try {
      const updatedCameras = await Promise.all(
        currentUser.cameras.map(async (camera) => {
          const status = await checkCameraStatus(camera);
          return { ...camera, status };
        })
      );

      const updatedUser = { ...currentUser, cameras: updatedCameras };
      setCurrentUser(updatedUser);

      // Update users list
      const updatedUsers = users.map((user) =>
        user.username === currentUser.username ? updatedUser : user
      );
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Error refreshing camera statuses:', error);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser, users, checkCameraStatus]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(() => {
    refreshCameraStatuses();
  }, [refreshCameraStatuses]);

  // Load users from AsyncStorage on app start
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const storedUsers = await AsyncStorage.getItem('users');
        if (storedUsers) {
          setUsers(JSON.parse(storedUsers));
        }
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };
    loadUsers();
  }, []);

  // Save users to AsyncStorage whenever the users state changes
  useEffect(() => {
    const saveUsers = async () => {
      try {
        await AsyncStorage.setItem('users', JSON.stringify(users));
      } catch (error) {
        console.error('Failed to save users:', error);
      }
    };
    saveUsers();
  }, [users]);

// Add after other useCallback functions
const fetchPreviewFrame = useCallback(async (camera) => {
  if (camera.status !== 'Online') return null;
  
  try {
    // Format IP properly for WebSocket URL
    let formattedIP = camera.ip;
    
    // If it doesn't start with ws://, add it
    if (!formattedIP.startsWith('ws://')) {
      formattedIP = `ws://${formattedIP}`;
    }
    
    // Make sure the path ends with /ws if not already present
    if (!formattedIP.endsWith('/ws')) {
      // Check if there's already a path
      if (formattedIP.includes('/') && !formattedIP.endsWith('/')) {
        formattedIP = `${formattedIP}/ws`;
      } else {
        formattedIP = `${formattedIP}/ws`;
      }
    }
    
    const ws = new WebSocket(formattedIP);
    
    return new Promise((resolve, reject) => {
      let frameReceived = false;
      
      ws.onopen = () => {
        console.log('Preview WebSocket opened for:', camera.name);
        ws.send(JSON.stringify({ command: 'getFrame' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'video' && !frameReceived) {
            frameReceived = true;
            ws.close();
            resolve(message.data);
          }
        } catch (error) {
          console.error('Preview frame parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Preview WebSocket error:', error);
        reject(error);
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!frameReceived) {
          ws.close();
          reject(new Error('Preview frame timeout'));
        }
      }, 5000);
    });
  } catch (error) {
    console.error('Failed to fetch preview frame:', error);
    return null;
  }
}, []);
// Add after other useEffects
useEffect(() => {
  const loadPreviews = async () => {
    if (currentUser?.cameras) {
      const frames = {};
      for (const camera of currentUser.cameras) {
        try {
          const frame = await fetchPreviewFrame(camera);
          if (frame) {
            frames[camera.ip] = frame;
          }
        } catch (error) {
          console.error('Error loading preview for camera:', camera.name, error);
        }
      }
      setPreviewFrames(frames);
    }
  };

  loadPreviews();
}, [currentUser?.cameras, fetchPreviewFrame]);

  // Handle login
  const handleLogin = (user) => {
    setCurrentUser({ ...user, cameras: user.cameras || [] });
    // Refresh camera statuses on login
    setTimeout(() => {
      if (user.cameras && user.cameras.length > 0) {
        refreshCameraStatuses();
      }
    }, 500);
  };

  // Handle registration
  const handleRegister = (newUser) => {
    const updatedUsers = [...users, { ...newUser, cameras: [] }];
    setUsers(updatedUsers);
    setCurrentUser({ ...newUser, cameras: [] });
    setShowLogin(true);
  };

  // Handle logout
  const handleLogout = () => {
    setCurrentUser(null);
    setIsConnected(false);
    setSocketUrl(null);
    setVideoConfig(null);
    frameQueue.current = [];
    setSelectedCamera(null);
    setSelectedCameras([]);
    setIsSelectionMode(false);
  };

  // Handle switching to the registration form
  const handleSwitchToRegister = () => {
    setShowLogin(false);
  };

  // Handle switching to the login form
  const handleSwitchToLogin = () => {
    setShowLogin(true);
  };

  // Handle adding a new camera
  // Replace the existing handleAddCamera function with this fixed version:

const handleAddCamera = async (newCamera) => {
  try {
    // Ensure currentUser.cameras exists
    const currentCameras = currentUser.cameras || [];
    
    // Check initial camera status
    const initialStatus = await checkCameraStatus(newCamera);
    const cameraWithStatus = {
      ...newCamera,
      status: initialStatus
    };

    // Create updated user object with new camera
    const updatedUser = {
      ...currentUser,
      cameras: [...currentCameras, cameraWithStatus],
    };

    // Update current user state
    setCurrentUser(updatedUser);

    // Update users array with new camera
    const updatedUsers = users.map((user) =>
      user.username === currentUser.username ? updatedUser : user
    );
    
    setUsers(updatedUsers);

    // Save to AsyncStorage immediately
    await AsyncStorage.setItem('users', JSON.stringify(updatedUsers));
    
    // Close add camera form
    setShowAddCamera(false);

    // Fetch preview frame for the new camera
    try {
      const frame = await fetchPreviewFrame(cameraWithStatus);
      if (frame) {
        setPreviewFrames(prev => ({
          ...prev,
          [cameraWithStatus.ip]: frame
        }));
      }
    } catch (error) {
      console.error('Error fetching preview frame:', error);
    }

  } catch (error) {
    console.error('Error adding camera:', error);
    Alert.alert('Error', 'Failed to save camera. Please try again.');
  }
};

  // Handle selecting/deselecting a camera
  const handleSelectCamera = (camera) => {
    if (isSelectionMode) {
      if (selectedCameras.includes(camera)) {
        setSelectedCameras(selectedCameras.filter((cam) => cam.ip !== camera.ip));
      } else {
        setSelectedCameras([...selectedCameras, camera]);
      }
    } else {
      setSelectedCamera(camera);
      
      // Format IP properly for WebSocket URL
      let formattedIP = camera.ip;
      
      // If it doesn't start with ws://, add it
      if (!formattedIP.startsWith('ws://')) {
        formattedIP = `ws://${formattedIP}`;
      }
      
      // Make sure the path ends with /ws if not already present
      if (!formattedIP.endsWith('/ws')) {
        // Check if there's already a path
        if (formattedIP.includes('/') && !formattedIP.endsWith('/')) {
          formattedIP = `${formattedIP}/ws`;
        } else {
          formattedIP = `${formattedIP}/ws`;
        }
      }
      
      setSocketUrl(formattedIP);
      
      // Setup HTML template for WebView
      const htmlTemplate = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <style>
              body {
                margin: 0;
                padding: 0;
                background-color: black;
                overflow: hidden;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                width: 100vw;
              }
              #videoContainer {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
              }
              #videoElement {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <div id="videoContainer">
              <img id="videoElement" src="" alt="Camera Stream"/>
            </div>

            <script>
              const videoElement = document.getElementById('videoElement');
              const imageCache = new Map();
              
              document.addEventListener('message', function(event) {
                try {
                  const message = JSON.parse(event.data);
                  if (message.type === 'videoFrame') {
                    const frameData = message.data;
                    
                    // Use cached image if available
                    if (imageCache.has(frameData)) {
                      videoElement.src = imageCache.get(frameData);
                    } else {
                      const imageUrl = 'data:image/jpeg;base64,' + frameData;
                      videoElement.src = imageUrl;
                      
                      // Cache the image (limit cache size)
                      imageCache.set(frameData, imageUrl);
                      if (imageCache.size > 10) {
                        const firstKey = imageCache.keys().next().value;
                        imageCache.delete(firstKey);
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error processing message:', error);
                }
              });
            </script>
          </body>
        </html>
      `;
      
      setVideoConfig(null);
      setWebViewHTML(htmlTemplate);
      setIsConnected(true);
    }
  };

  // Handle long press to enter selection mode
  const handleLongPressCamera = (camera) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedCameras([camera]);
    }
  };

  // Handle removing selected cameras
  const handleRemoveSelectedCameras = () => {
    Alert.alert(
      'Remove Cameras',
      `Are you sure you want to remove ${selectedCameras.length} camera(s)?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // Filter out the selected cameras
            const updatedUser = {
              ...currentUser,
              cameras: currentUser.cameras.filter(
                (cam) => !selectedCameras.some((selected) => selected.ip === cam.ip)
              ),
            };

            // Update the currentUser state
            setCurrentUser(updatedUser);

            // Update the users state
            const updatedUsers = users.map((user) =>
              user.username === currentUser.username ? updatedUser : user
            );
            setUsers(updatedUsers);

            // Save the updated users to AsyncStorage
            try {
              await AsyncStorage.setItem('users', JSON.stringify(updatedUsers));
            } catch (error) {
              console.error('Failed to save users:', error);
            }

            // Clear selected cameras and exit selection mode
            setSelectedCameras([]);
            setIsSelectionMode(false);
          },
        },
      ]
    );
  };

  // Handle connecting to the camera
  const handleConnect = () => {
    // Create a new camera object
    const newCamera = {
      name: cameraName || 'IP Camera',
      ip: cameraIP,
      location: cameraLocation || '',
      status: 'Online'
    };
    
    // Add the camera to user's cameras list
    handleAddCamera(newCamera);
    
    // Clear form fields
    setCameraName('');
    setCameraIP('');
    setCameraLocation('');
    
    // Close the add camera form
    setShowAddCamera(false);
    handleTabChange('home');
  };

  // Process video frames
  const processNextFrame = useCallback(() => {
    if (frameQueue.current.length > 0 && webViewRef.current && !isProcessingFrame) {
      const now = Date.now();
      const timeSinceLastFrame = now - lastFrameTime.current;
      const frameInterval = 1000 / frameRate;

      if (timeSinceLastFrame >= frameInterval) {
        setIsProcessingFrame(true);

        let frameToProcess;
        if (frameQueue.current.length > 3) {
          frameToProcess = frameQueue.current.pop();
          frameQueue.current = [];
        } else {
          frameToProcess = frameQueue.current.shift();
        }

        InteractionManager.runAfterInteractions(() => {
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
              type: 'videoFrame',
              data: frameToProcess,
            }));
          }
          lastFrameTime.current = now;
          setIsProcessingFrame(false);
        });
      }
    }

    frameProcessorTimeout.current = setTimeout(processNextFrame, 1000 / frameRate);
  }, [frameRate, isProcessingFrame]);

  useEffect(() => {
    processNextFrame();
    return () => {
      if (frameProcessorTimeout.current) {
        clearTimeout(frameProcessorTimeout.current);
      }
    };
  }, [processNextFrame, isConnected]);

  // WebSocket connection - removed auto-reconnect
  const { sendMessage, readyState } = useWebSocket(socketUrl, {
    onOpen: () => {
      console.log('WebSocket connection opened');
      setIsConnected(true);
      setSelectedCamera((prevCamera) => ({
        ...prevCamera,
        status: 'Online', // Update status to Online
      }));
      sendMessage(JSON.stringify({ command: 'setVideoQuality', quality: 'medium' }));
    },
    onClose: () => {
      console.log('WebSocket connection closed');
      setIsConnected(false);
      setSelectedCamera((prevCamera) => ({
        ...prevCamera,
        status: 'Offline', // Update status to Offline
      }));
      setVideoConfig(null);
      frameQueue.current = [];
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      Alert.alert('Connection Error', 'Failed to connect to the camera. Please check the IP address and try again.');
      setIsConnected(false);
      setSelectedCamera((prevCamera) => ({
        ...prevCamera,
        status: 'Offline', // Update status to Offline
      }));
    },
    onMessage: (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'config') {
          console.log('Received video config:', message);
          setVideoConfig(message);

          if (message.width && message.height) {
            const pixels = message.width * message.height;
            if (pixels > 1000000) {
              setFrameRate(15);
            } else if (pixels > 500000) {
              setFrameRate(20);
            } else {
              setFrameRate(30);
            }
          }
        } else if (message.type === 'video') {
          frameQueue.current.push(message.data);

          if (frameQueue.current.length > 10) {
            frameQueue.current = frameQueue.current.slice(-5);
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    },
    // Removed auto-reconnect options:
    // shouldReconnect: (closeEvent) => true,
    // reconnectInterval: 3000,
    // reconnectAttempts: 0,
    enabled: socketUrl !== null,
  });

  // Function to render individual camera cards
 // Replace your existing renderCameraCard function
const renderCameraCard = ({ item: camera, index }) => {
  const isSelected = selectedCameras.includes(camera);
  const previewFrame = previewFrames[camera.ip];
  
  // Calculate animations for each card
  const inputRange = [
    (index - 1) * (CARD_WIDTH + SPACING),
    index * (CARD_WIDTH + SPACING),
    (index + 1) * (CARD_WIDTH + SPACING)
  ];
  
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.85, 1.02, 0.85],
    extrapolate: 'clamp'
  });
  
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.6, 1, 0.6],
    extrapolate: 'clamp'
  });
  
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [15, -5, 15],
    extrapolate: 'clamp'
  });
  
  const blurIntensity = scrollX.interpolate({
    inputRange,
    outputRange: [90, 0, 90],
    extrapolate: 'clamp'
  });
  
  return (
    <Animated.View
      style={[
        styles.cameraCardContainer,
        {
          transform: [{ scale }, { translateY }],
          opacity,
          width: CARD_WIDTH,
          marginHorizontal: SPACING / 2
        }
      ]}
    >
      <TouchableOpacity
        style={[
          styles.cameraCard,
          isSelected && styles.selectedCameraCard
        ]}
        onPress={() => handleSelectCamera(camera)}
        onLongPress={() => handleLongPressCamera(camera)}
        activeOpacity={0.9}
      >
        <View style={styles.cardContainer}>
          {previewFrame ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${previewFrame}` }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noPreviewContainer}>
              <Ionicons name="videocam-off" size={48} color="#666" />
              <Text style={styles.noPreviewText}>No Preview</Text>
            </View>
          )}
          
          <Animated.View 
            style={[
              StyleSheet.absoluteFill,
              {
                overflow: 'hidden',
                opacity: 0.5
              }
            ]}
          >
            <BlurView 
              intensity={90} 
              tint="dark" 
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
            style={styles.cardOverlay}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cameraIcon}>
                <Ionicons name="videocam" size={28} color="#fff" />
              </View>
              <View style={[
                styles.statusIndicator,
                camera.status === 'Online' ? styles.onlineIndicator : styles.offlineIndicator
              ]} />
            </View>
            
            <View style={styles.cameraDetails}>
              <Text style={styles.cameraName}>{camera.name}</Text>
              <View style={styles.locationContainer}>
                <Ionicons name="location-outline" size={16} color="#ccc" />
                <Text style={styles.cameraLocation}>{camera.location}</Text>
              </View>
              <View style={styles.statusContainer}>
                <Text style={[
                  styles.cameraStatus,
                  camera.status === 'Online' ? styles.onlineStatus : styles.offlineStatus,
                ]}>
                  {camera.status}
                </Text>
              </View>
            </View>
          </LinearGradient>
          
          {isSelected && (
            <View style={styles.checkmarkContainer}>
              <Ionicons name="checkmark-circle" size={28} color="#007FFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

  // Function to handle snap to card
  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  // Configure viewability
  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50
  };

  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged: handleViewableItemsChanged }
  ]);

  // Function to render empty camera list message
  const renderEmptyCameraList = () => (
    <View style={styles.emptyCameraContainer}>
      <Ionicons name="videocam-outline" size={64} color="#666" />
      <Text style={styles.emptyCameraText}>No cameras added yet</Text>
      <Text style={styles.emptyCameraSubtext}>Add your first camera to get started</Text>
    </View>
  );

  // Render pagination dots
  const renderPaginationDots = () => {
    if (!currentUser?.cameras || currentUser.cameras.length <= 1) return null;
    
    return (
      <View style={styles.paginationContainer}>
        {currentUser.cameras.map((_, index) => {
          const inputRange = [
            (index - 1) * (CARD_WIDTH + SPACING),
            index * (CARD_WIDTH + SPACING),
            (index + 1) * (CARD_WIDTH + SPACING)
          ];
          
          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.5, 1, 0.5],
            extrapolate: 'clamp'
          });
          
          const dotColor = scrollX.interpolate({
            inputRange,
            outputRange: ['#666', '#007FFF', '#666'],
            extrapolate: 'clamp'
          });
          
          return (
            <Animated.View
              key={index}
              style={[
                styles.paginationDot,
                { 
                  opacity: dotOpacity,
                  backgroundColor: dotColor,
                  width: index === activeIndex ? 16 : 8
                }
              ]}
            />
          );
        })}
      </View>
    );
  };

  const handleWifiSetup = (wifiConfig) => {
    // Here you would typically save the WiFi configuration
    console.log('WiFi configuration saved:', wifiConfig);
    Alert.alert('Success', 'WiFi configuration saved successfully!');
  };

  // Modify the function to handle tab changes with improved animation
  const handleTabChange = (tab) => {
    const tabIndex = tab === 'home' ? 0 : tab === 'wifi' ? 1 : 2;
    
    // First, animate the tab indicator
    Animated.spring(tabBarAnimation, {
      toValue: tabIndex,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
    
    // Then, animate the icon pop effect
    const iconAnim = tab === 'home' ? homeIconAnim : 
                     tab === 'wifi' ? wifiIconAnim : addIconAnim;
    
    // Pop out animation sequence
    Animated.sequence([
      Animated.timing(iconAnim, {
        toValue: 1.5, // Scale up more dramatically
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(iconAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      })
    ]).start();
    
    // Update the active tab state
    setActiveTab(tab);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {!currentUser ? (
        showLogin ? (
          <LoginForm
            onLogin={handleLogin}
            onSwitchToRegister={handleSwitchToRegister}
            users={users}
          />
        ) : (
          <RegisterForm
            onRegister={handleRegister}
            onSwitchToLogin={handleSwitchToLogin}
            users={users}
          />
        )
      ) : selectedCamera ? (
        <CameraView
          cameraName={selectedCamera.name}
          videoConfig={videoConfig}
          handleDisconnect={() => setSelectedCamera(null)}
          webViewRef={webViewRef}
          webViewHTML={webViewHTML}
          frameRate={frameRate}
          setFrameRate={setFrameRate}
          handleLogout={handleLogout}
          camera={selectedCamera}
        />
      ) : (
        <View style={styles.dashboardContainer}>
          <BlurView intensity={80} tint="dark" style={styles.headerBlur}>
            <View style={styles.header}>
              <Text style={styles.greeting}>Hello, {currentUser.username}</Text>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={24} color="red" />
              </TouchableOpacity>
            </View>
          </BlurView>

          <View style={styles.cameraSection}>
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>Your Cameras</Text>
              {isSelectionMode && (
                <TouchableOpacity
                  style={styles.cancelSelectionButton}
                  onPress={() => {
                    setIsSelectionMode(false);
                    setSelectedCameras([]);
                  }}
                >
                  <Text style={styles.cancelSelectionText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {currentUser.cameras && currentUser.cameras.length > 0 ? (
              <View style={styles.cameraSliderContainer}>
                <Animated.FlatList
                  ref={flatListRef}
                  data={currentUser.cameras}
                  renderItem={renderCameraCard}
                  keyExtractor={(item, index) => `camera-${index}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sliderContentContainer}
                  snapToInterval={CARD_WIDTH + SPACING}
                  snapToAlignment="center"
                  decelerationRate={0.8}
                  bounces={true}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true }
                  )}
                  scrollEventThrottle={16}
                  viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
                  ListEmptyComponent={renderEmptyCameraList}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      colors={['#007FFF']}
                      tintColor="#007FFF"
                      title="Refreshing..."
                      titleColor="#ccc"
                    />
                  }
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                  initialNumToRender={3}
                />
                {renderPaginationDots()}
              </View>
            ) : (
              renderEmptyCameraList()
            )}
            
            {isSelectionMode && selectedCameras.length > 0 && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={handleRemoveSelectedCameras}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.removeButtonText}>Remove Selected ({selectedCameras.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          <BlurView intensity={90} tint="dark" style={styles.navbarBlur}>
            <View style={styles.navbar}>
              <Animated.View 
                style={[
                  styles.tabIndicator,
                  {
                    width: indicatorWidth,
                    transform: [{
                      translateX: tabBarAnimation.interpolate({
                        inputRange: [0, 1, 2],
                        outputRange: [
                          (tabItemWidth - indicatorWidth) / 2,
                          tabItemWidth + (tabItemWidth - indicatorWidth) / 2,
                          2 * tabItemWidth + (tabItemWidth - indicatorWidth) / 2
                        ]
                      })
                    }]
                  }
                ]} 
              />
              
              <TouchableOpacity
                style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]}
                onPress={() => handleTabChange('home')}
              >
                <Animated.View style={[
                  styles.navIconContainer,
                  activeTab === 'home' && styles.activeNavIconContainer,
                  {
                    transform: [
                      { scale: homeIconAnim },
                      { scale: activeTab === 'home' ? 1.1 : 1 }
                    ]
                  }
                ]}>
                  <Ionicons 
                    name="home" 
                    size={24} 
                    color={activeTab === 'home' ? '#007FFF' : '#666'} 
                  />
                </Animated.View>
                <Animated.Text style={[
                  styles.navText,
                  activeTab === 'home' && styles.activeNavText,
                  {
                    transform: [{
                      scale: activeTab === 'home' ? 1.1 : 1
                    }]
                  }
                ]}>
                  Home
                </Animated.Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navItem, activeTab === 'wifi' && styles.activeNavItem]}
                onPress={() => {
                  handleTabChange('wifi');
                  setShowWifiSetup(true);
                }}
              >
                <Animated.View style={[
                  styles.navIconContainer,
                  activeTab === 'wifi' && styles.activeNavIconContainer,
                  {
                    transform: [
                      { scale: wifiIconAnim },
                      { scale: activeTab === 'wifi' ? 1.1 : 1 }
                    ]
                  }
                ]}>
                  <Ionicons 
                    name="wifi" 
                    size={24} 
                    color={activeTab === 'wifi' ? '#34C759' : '#666'} 
                  />
                </Animated.View>
                <Animated.Text style={[
                  styles.navText,
                  activeTab === 'wifi' && styles.activeNavText,
                  {
                    transform: [{
                      scale: activeTab === 'wifi' ? 1.1 : 1
                    }]
                  }
                ]}>
                  WiFi
                </Animated.Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navItem, activeTab === 'add' && styles.activeNavItem]}
                onPress={() => {
                  handleTabChange('add');
                  setShowAddCamera(true);
                }}
              >
                <Animated.View style={[
                  styles.navIconContainer,
                  activeTab === 'add' && styles.activeNavIconContainer,
                  {
                    transform: [
                      { scale: addIconAnim },
                      { scale: activeTab === 'add' ? 1.1 : 1 }
                    ]
                  }
                ]}>
                  <Ionicons 
                    name="add-circle" 
                    size={24} 
                    color={activeTab === 'add' ? '#007FFF' : '#666'} 
                  />
                </Animated.View>
                <Animated.Text style={[
                  styles.navText,
                  activeTab === 'add' && styles.activeNavText,
                  {
                    transform: [{
                      scale: activeTab === 'add' ? 1.1 : 1
                    }]
                  }
                ]}>
                  Add Camera
                </Animated.Text>
              </TouchableOpacity>
            </View>
          </BlurView>

          {showAddCamera && (
            <ConnectionForm
              cameraName={cameraName}
              setCameraName={setCameraName}
              cameraIP={cameraIP}
              setCameraIP={setCameraIP}
              cameraLocation={cameraLocation}
              setCameraLocation={setCameraLocation}
              handleConnect={handleConnect}
              handleCancel={() => {
                setShowAddCamera(false);
                handleTabChange('home');
              }}
            />
          )}

          <WifiSetupModal
            visible={showWifiSetup}
            onClose={() => {
              setShowWifiSetup(false);
              handleTabChange('home');
            }}
            onSave={handleWifiSetup}
            blurIntensity={wifiIconAnim.interpolate({
              inputRange: [1, 1.5],
              outputRange: [80, 100],
              extrapolate: 'clamp'
            })}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgb(14, 14, 14)',
  },
  dashboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 35,
    backgroundColor: 'transparent',
    width: '100%',
    height: 100,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
    
  },
  cameraSection: {
    flex: 1,
    padding: 20,
    paddingTop: 120, // Added padding to account for the header
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelSelectionButton: {
    padding: 8,
    top: 525,
    right: 5,
  },
  cancelSelectionText: {
    color: '#007FFF',
    fontWeight: '600',
  },
  cameraSliderContainer: {
    height: 450,
    marginBottom: 15,
  },
  sliderContentContainer: {
    paddingHorizontal: (width - CARD_WIDTH) / 10 - SPACING / 2,
    paddingVertical: 10,
  },
  cameraCard: {
    height: 400,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  selectedCameraCard: {
    borderColor: '#007FFF',
    borderWidth: 2,
  },
  cardGradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: 'absolute',
    top: 0,
    right: 0,
  },
  onlineIndicator: {
    backgroundColor: '#4CAF50',
  },
  offlineIndicator: {
    backgroundColor: '#FF3B30',
  },
  cameraDetails: {
    marginTop: 'auto',
  },
  cameraName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cameraLocation: {
    fontSize: 14,
    color: '#ccc',
    marginLeft: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  onlineStatus: {
    color: '#4CAF50',
  },
  offlineStatus: {
    color: '#FF3B30',
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 350,
    right: 16,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#007FFF',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyCameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyCameraText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  emptyCameraSubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    width: 250,
    left: 5,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
    fontWeight: 'bold',
  },
  cardContainer: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
    },
    previewImage: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      backgroundColor: '#1E1E1E',
    },
    cardOverlay: {
      flex: 1,
      padding: 16,
      justifyContent: 'space-between',
    },
    noPreviewContainer: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1E1E1E',
    },
    noPreviewText: {
      color: '#666',
      marginTop: 8,
      fontSize: 14,
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(44, 44, 44, 0.3)',
    width: '100%',
    height: 65,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 4,
    backgroundColor: '#007FFF',
    borderRadius: 4,
    // width is now set dynamically
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: width / 3,
  },
  navIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeNavIconContainer: {
    backgroundColor: 'rgba(0, 127, 255, 0.1)',
    transform: [{ scale: 1.1 }],
  },
  navText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#007FFF',
    fontWeight: '600',
  },
  navbarBlur: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  cameraCardContainer: {
    height: 400,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

export default App;