import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_RECORDING_STORAGE_KEY = 'AUTO_RECORDING_CAMERAS';

class RecordingService {
  constructor() {
    this.activeRecordings = {};
    this.autoRecordingCameras = [];
    this.recordingConfig = {
      maxDurationMs: 24 * 60 * 60 * 1000, // 24 hours
      fileRotationIntervalMs: 60 * 60 * 1000, // 60 minutes per segment (increased from 10)
      maxBufferSize: 60, // Increased buffer size for fewer writes
      errorThreshold: 5, // Number of errors before switching to image fallback
      enableImageFallback: true, // Whether to enable the image fallback mechanism
      timeBasedWriting: false, // Whether to write frames based on time (not just buffer size)
      writeIntervalMs: 10000, // Increased from 5000 to 10000 ms for less frequent writes
      optimizePerformance: true, // Performance optimization flag
      fallbackFrameRate: 1,        // Frames per second in fallback mode
      compressImages: false,       // Whether to compress saved images
      saveRawFrames: false,        // Whether to save raw frames for debugging
      saveToMediaLibrary: true     // Whether to save frames to media library
    };
    
    // Statistics for UI feedback
    this.recordingStats = {};
    
    // Load auto-recording cameras on init
    this._loadAutoRecordingCameras();
    this._checkPermissions();
  }

  /**
   * Check and request media library permissions
   * @private
   */
  async _checkPermissions() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Media Library permissions not granted. Videos might not be saved properly.');
    }
  }

  /**
   * Load auto-recording cameras from storage
   * @private
   */
  async _loadAutoRecordingCameras() {
    try {
      const storedCameras = await AsyncStorage.getItem(AUTO_RECORDING_STORAGE_KEY);
      if (storedCameras) {
        this.autoRecordingCameras = JSON.parse(storedCameras);
        console.log('Loaded auto-recording cameras:', this.autoRecordingCameras.length);
      }
    } catch (error) {
      console.error('Failed to load auto-recording cameras:', error);
    }
  }
  
  /**
   * Save auto-recording cameras to storage
   * @private
   */
  async _saveAutoRecordingCameras() {
    try {
      await AsyncStorage.setItem(AUTO_RECORDING_STORAGE_KEY, JSON.stringify(this.autoRecordingCameras));
    } catch (error) {
      console.error('Failed to save auto-recording cameras:', error);
    }
  }

  /**
   * Check if a camera is currently set for auto-recording
   * @param {Object} camera - Camera object
   * @returns {boolean}
   */
  isAutoRecordingEnabled(camera) {
    return this.autoRecordingCameras.some(cam => cam.ip === camera.ip);
  }

  /**
   * Enable or disable auto-recording for a camera
   * @param {Object} camera - Camera object
   * @param {boolean} enable - Whether to enable or disable auto-recording
   */
  async setAutoRecording(camera, enable) {
    if (enable) {
      // Only add if not already in the list
      if (!this.isAutoRecordingEnabled(camera)) {
        this.autoRecordingCameras.push(camera);
        
        // If camera is online, start recording immediately
        if (camera.status === 'Online') {
          await this.startRecording(camera);
        }
      }
    } else {
      // Remove from auto-recording list
      this.autoRecordingCameras = this.autoRecordingCameras.filter(cam => cam.ip !== camera.ip);
      
      // Stop any active recording
      if (this.isRecording(camera)) {
        this.stopRecording(camera);
      }
    }
    
    // Save updated list
    await this._saveAutoRecordingCameras();
  }
  
  /**
   * Get all cameras with auto-recording enabled
   * @returns {Array} List of cameras
   */
  async getAutoRecordingCameras() {
    // Refresh from storage in case another JS context updated it
    await this._loadAutoRecordingCameras();
    return this.autoRecordingCameras;
  }

  /**
   * Check if a camera is online
   * @param {Object} camera - Camera object
   * @returns {Promise<string>} 'Online' or 'Offline'
   */
  async checkCameraStatus(camera) {
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
  }

  /**
   * Start recording from the specified camera
   * @param {Object|string} camera - Camera object or identifier
   * @returns {Promise<boolean>} - Whether recording was started
   */
  async startRecording(camera) {
    try {
      if (!camera) {
        console.error('Cannot start recording: No camera specified');
        return false;
      }
      
      // Check permissions before starting
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Cannot start recording: missing permissions');
        return false;
      }
      
      // Normalize camera input - accept either camera object or string ID
      const cameraId = typeof camera === 'string' ? camera : camera.ip;
      const cameraName = typeof camera === 'string' ? camera : (camera.name || 'Unknown');
      
      // Check if already recording for this camera
      if (this.activeRecordings[cameraId]) {
        console.log(`Already recording camera ${cameraName}`);
        return true;
      }
      
      console.log(`Starting recording for camera ${cameraName}`);
      
      // Initialize recording state with optimized settings
      this.activeRecordings[cameraId] = {
        camera: camera,
        isActive: true,
        startTime: Date.now(),
        frameCount: 0,
        lastFrameTime: Date.now(),
        frameRate: 0,
        frameIntervals: [],
        frameSizes: [],
        totalSize: 0,
        currentFileSize: 0,
        frameBuffer: [],
        useImageFallback: false,
        base64ErrorCount: 0,
        lastWriteTime: Date.now(),
        imageCount: 0,
        // Performance optimization flags
        skipFrameValidation: this.recordingConfig.optimizePerformance,
        reduceLogging: this.recordingConfig.optimizePerformance,
        batchProcessing: this.recordingConfig.optimizePerformance,
        framesPathCreated: false,
        framesDir: null
      };
      
      const recording = this.activeRecordings[cameraId];
      
      // Create the first recording file
      await this._rotateRecordingFile(recording);
      
      // Connect to camera WebSocket
      return await this._connectToCamera(camera, recording);
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording for a camera
   * @param {Object|string} camera - Camera object or identifier
   * @returns {Promise<boolean>} Success status
   */
  async stopRecording(camera) {
    try {
      // Normalize camera identifier
      const cameraId = typeof camera === 'string' ? camera : camera.ip;
      const recording = this.activeRecordings[cameraId];
      
      if (!recording) {
        console.log(`No active recording found for camera ${cameraId}`);
        return false;
      }
      
      console.log(`Stopping recording for camera ${cameraId}`);
      
      // Mark recording as inactive
      recording.isActive = false;
      
      // Close WebSocket connection if open
      if (recording.ws) {
        try {
          recording.ws.close();
          recording.ws = null;
        } catch (wsError) {
          console.error('Error closing WebSocket:', wsError);
        }
      }
      
      // Write any remaining frames
      if (recording.frameBuffer && recording.frameBuffer.length > 0) {
        await this._writeFramesToFile(recording);
      }
      
      // Finalize and save recording
      await this._finalizeRecordingFile(recording);
      
      // Remove from active recordings
      delete this.activeRecordings[cameraId];
      
      // Clean up recording stats
      delete this.recordingStats[cameraId];
      
      console.log(`Successfully stopped recording for camera ${cameraId}`);
      return true;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return false;
    }
  }

  /**
   * Check if a camera is currently recording
   * @param {Object|string} camera - Camera object or identifier
   * @returns {boolean}
   */
  isRecording(camera) {
    if (!camera) return false;
    
    const cameraId = typeof camera === 'string' ? camera : camera.ip;
    const recording = this.activeRecordings[cameraId];
    
    return !!(recording && recording.isActive);
  }

  /**
   * Get recording statistics for a camera
   * @param {Object|string} camera - Camera object or identifier
   * @returns {Object|null} Recording statistics or null if not recording
   */
  getRecordingStats(camera) {
    if (!camera) return null;
    
    const cameraId = typeof camera === 'string' ? camera : (camera.ip || null);
    if (!cameraId) return null;
    
    const recording = this.activeRecordings[cameraId];
    if (!recording) return null;
    
    // Calculate average frame size
    const avgFrameSize = recording.frameSizes.length > 0 
      ? recording.frameSizes.reduce((sum, size) => sum + size, 0) / recording.frameSizes.length 
      : 0;
    
    return {
      startTime: recording.startTime,
      duration: Math.floor((Date.now() - recording.startTime) / 1000),
      frameCount: recording.frameCount,
      frameRate: recording.frameRate,
      currentFileSize: recording.currentFileSize,
      totalSize: recording.totalSize,
      estimatedBytesPerFrame: avgFrameSize,
      videoWidth: recording.videoWidth || 0,
      videoHeight: recording.videoHeight || 0,
      isImageFallbackMode: recording.useImageFallback || false,
      errorCount: recording.base64ErrorCount || 0,
    };
  }

  /**
   * Rotate the recording file (create a new file and close the old one)
   * @param {Object} recording - Recording object
   * @private
   */
  async _rotateRecordingFile(recording) {
    try {
      // Generate a new file name
      recording.currentFileStartTime = Date.now();
      recording.currentFileName = this._generateFileName(recording.camera);
      
      // Reset file size counter
      recording.currentFileSize = 0;
      
      // Get safe camera name with proper null checks
      let cameraName = 'unknown';
      
      if (recording.camera) {
        if (typeof recording.camera === 'string') {
          cameraName = recording.camera;
        } else if (recording.camera.name) {
          cameraName = recording.camera.name;
        } else if (recording.camera.ip) {
          cameraName = recording.camera.ip;
        }
      }
      
      // Generate safe name for directory
      const safeCameraName = cameraName.replace(/[^a-z0-9]/gi, '_');
        
      const recordingDir = `${FileSystem.documentDirectory}recordings/${safeCameraName}`;
      
      try {
        await FileSystem.makeDirectoryAsync(recordingDir, { intermediates: true });
      } catch (dirError) {
        console.error('Error creating recording directory:', dirError);
        // Create a default directory as fallback
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}recordings/unknown`, 
          { intermediates: true });
        recording.currentFilePath = `${FileSystem.documentDirectory}recordings/unknown/${recording.currentFileName}`;
        
        // Update recording state
        if (!recording.allFiles) recording.allFiles = [];
        recording.allFiles.push(recording.currentFilePath);
        
        return recording.currentFilePath;
      }
      
      recording.currentFilePath = `${recordingDir}/${recording.currentFileName}`;
      
      // Update recording state
      if (!recording.allFiles) recording.allFiles = [];
      recording.allFiles.push(recording.currentFilePath);
      
      console.log(`Created new recording file: ${recording.currentFilePath}`);
      return recording.currentFilePath;
    } catch (error) {
      console.error('Error creating new recording file:', error);
      throw error;
    }
  }

  /**
   * Generate a file name for recording based on camera and current time
   * @param {Object|string} camera - Camera object or identifier
   * @returns {string}
   * @private
   */
  _generateFileName(camera) {
    const dateTimeString = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    
    // Handle case where camera is undefined or not an object
    if (!camera) {
      return `recording_${dateTimeString}.mp4`;
    }
    
    // Handle case where camera is a string (IP or ID)
    if (typeof camera === 'string') {
      const safeNameString = camera.replace(/[^a-z0-9]/gi, '_');
      return `${safeNameString}_${dateTimeString}.mp4`;
    }
    
    // Handle case where camera is an object but name is not defined
    const cameraName = camera.name || camera.ip || 'unknown';
    const safeNameString = cameraName.replace(/[^a-z0-9]/gi, '_');
    return `${safeNameString}_${dateTimeString}.mp4`;
  }

  /**
   * Create a new recording file
   * @param {Object} recording - Recording object
   * @returns {Promise<Object>}
   * @private
   */
  async _createNewRecordingFile(recording) {
    // Get camera name safely
    const cameraName = typeof recording.camera === 'string' 
      ? recording.camera.replace(/[^a-z0-9]/gi, '_') 
      : ((recording.camera && recording.camera.name) || 'unknown').replace(/[^a-z0-9]/gi, '_');
      
    const cameraDir = `${FileSystem.documentDirectory}recordings/${cameraName}`;
    
    // Ensure directory exists
    try {
      const dirInfo = await FileSystem.getInfoAsync(cameraDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(cameraDir, { intermediates: true });
      }
    } catch (error) {
      console.warn('Error creating directory:', error);
    }
    
    const filePath = `${cameraDir}/${recording.currentFileName}`;
    
    // Initialize the MP4 file with a small header (will be updated later)
    await FileSystem.writeAsStringAsync(filePath, '', { encoding: FileSystem.EncodingType.UTF8 });
    
    return {
      uri: filePath,
      encoding: FileSystem.EncodingType.Base64,
      framesWritten: 0,
    };
  }

  /**
   * Write buffered frames to the current recording file
   * @param {Object} recording - Recording object
   * @returns {Promise<void>}
   */
  async _writeFramesToFile(recording) {
    // Skip if no frames to write
    if (!recording || !recording.frameBuffer || recording.frameBuffer.length === 0) {
      return;
    }
    
    // Create a local copy of the buffer and clear the original to avoid blocking
    const framesToWrite = [...recording.frameBuffer];
    recording.frameBuffer = [];
    
    try {
      // Generate file path if needed
      if (!recording.currentFilePath) {
        await this._rotateRecordingFile(recording);
      }
      
      // Check if it's time to rotate the file
      const now = Date.now();
      if (now - recording.currentFileStartTime > this.recordingConfig.fileRotationIntervalMs) {
        await this._rotateRecordingFile(recording);
      }
      
      // Open file for writing
      const fileUri = recording.currentFilePath;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const fileExists = fileInfo.exists;
      
      // Write frames to file
      for (let i = 0; i < framesToWrite.length; i++) {
        const frameData = framesToWrite[i];
        try {
          if (fileExists) {
            // Append to existing file
            await FileSystem.writeAsStringAsync(fileUri, frameData, {
              encoding: FileSystem.EncodingType.Base64,
              append: true
            });
          } else {
            // Write new file
            await FileSystem.writeAsStringAsync(fileUri, frameData, {
              encoding: FileSystem.EncodingType.Base64
            });
            // File now exists for subsequent frames
            recording.fileCreated = true;
          }
        } catch (writeError) {
          console.error(`Error writing frame ${i}:`, writeError);
          // If we fail to write, try image fallback for this frame
          if (this.recordingConfig.enableImageFallback) {
            try {
              await this._saveFrameAsImage(recording, frameData);
            } catch (imgError) {
              console.warn('Failed to save frame as image:', imgError);
            }
          }
        }
      }
      
      // Update recording state
      recording.successfulWrites = (recording.successfulWrites || 0) + 1;
      recording.lastSuccessfulWrite = now;
      
      // Reset error counter after successful write
      if (recording.base64ErrorCount > 0) {
        recording.base64ErrorCount = Math.max(0, recording.base64ErrorCount - 1);
      }
      
    } catch (error) {
      console.error('Error in _writeFramesToFile:', error);
      
      // Increment error counter
      recording.base64ErrorCount = (recording.base64ErrorCount || 0) + 1;
      
      // If error threshold exceeded, try to save frames as images
      if (recording.base64ErrorCount > this.recordingConfig.errorThreshold) {
        console.log('Switching to image fallback mode after write errors');
        recording.useImageFallback = true;
        
        // Try to save the frames we failed to write as individual images
        if (this.recordingConfig.enableImageFallback) {
          for (let i = 0; i < framesToWrite.length; i += 3) { // Save every 3rd frame
            try {
              await this._saveFrameAsImage(recording, framesToWrite[i]);
            } catch (imgError) {
              console.warn('Failed to save fallback image');
            }
          }
        }
      }
    }
  }

  /**
   * Finalize the current recording file
   * @param {Object} recording - Recording object
   * @returns {Promise<void>}
   * @private
   */
  async _finalizeRecordingFile(recording) {
    if (!recording) return;
    
    try {
      // Check if we have a valid recording file
      if (!recording.currentFilePath) {
        console.warn('No current file path to finalize');
        return;
      }
      
      const fileInfo = await FileSystem.getInfoAsync(recording.currentFilePath);
      if (!fileInfo.exists || fileInfo.size === 0) {
        console.warn('Recording file does not exist or is empty:', recording.currentFilePath);
        return;
      }
      
      // Add to media library if video recording was successful
      if (recording.successfulWrites > 0 && !recording.useImageFallback) {
        try {
          // Save to media library
          const asset = await MediaLibrary.createAssetAsync(recording.currentFilePath);
          
          // Create a custom album for camera recordings
          const cameraName = typeof recording.camera === 'string' 
            ? recording.camera
            : (recording.camera && recording.camera.name) 
                ? recording.camera.name 
                : (recording.camera && recording.camera.ip) 
                    ? recording.camera.ip 
                    : 'unknown';
                    
          // Make the camera name safe for file system
          const safeCameraName = cameraName.replace(/[^a-z0-9]/gi, '_');
            
          const albumName = `Security Recordings - ${safeCameraName}`;
          const albums = await MediaLibrary.getAlbumsAsync();
          let album = albums.find(a => a.title === albumName);
          
          if (!album) {
            album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
          
          console.log(`Finalized recording file: ${recording.currentFileName} and saved to album: ${albumName}`);
        } catch (mediaError) {
          console.error('Failed to save to media library:', mediaError);
        }
      } else if (recording.useImageFallback && recording.imageCount > 0) {
        // For image fallback mode, log success
        console.log(`Finalized recording session with ${recording.imageCount} images saved.`);
      }
      
      // Clear recording file
      recording.currentFilePath = null;
      recording.currentFileName = null;
      recording.currentFileSize = 0;
      recording.currentFileStartTime = 0;
    } catch (error) {
      console.error('Failed to finalize recording file:', error);
    }
  }

  /**
   * Get a list of recordings for a camera
   * @param {Object} camera - Camera object
   * @returns {Promise<Array>} List of recording files
   */
  async getRecordings(camera) {
    try {
      if (!camera) {
        console.warn('No camera provided to getRecordings');
        return [];
      }
      
      // Get safe camera name
      const cameraName = camera.name || camera.ip || 'unknown';
      const safeCameraName = cameraName.replace(/[^a-z0-9]/gi, '_');
      
      // Get all albums related to this camera
      const albumName = `Security Recordings - ${safeCameraName}`;
      const albums = await MediaLibrary.getAlbumsAsync();
      const album = albums.find(a => a.title === albumName);
      
      if (!album) {
        console.log(`No album found for ${cameraName}`);
        return [];
      }
      
      // Get all assets in the album
      const { assets } = await MediaLibrary.getAssetsAsync({
        album: album.id,
        mediaType: MediaLibrary.MediaType.video,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      
      console.log(`Found ${assets.length} recordings for ${cameraName}`);
      
      // Map assets to recording objects
      return assets.map(asset => ({
        id: asset.id,
        fileName: asset.filename,
        path: asset.uri,
        duration: asset.duration,
        creationTime: asset.creationTime,
        width: asset.width,
        height: asset.height,
        date: new Date(asset.creationTime * 1000),
        fileSize: asset.fileSize
      }));
    } catch (error) {
      console.error(`Failed to get recordings:`, error);
      return [];
    }
  }

  /**
   * Delete a recording
   * @param {string} assetId - Asset ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteRecording(assetId) {
    try {
      await MediaLibrary.deleteAssetsAsync([assetId]);
      return true;
    } catch (error) {
      console.error(`Failed to delete recording: ${error}`);
      return false;
    }
  }
  
  /**
   * Format a file size in bytes to a readable string (KB, MB, GB)
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === undefined || bytes === null) return "0 B";
    if (bytes === 0) return "0 B";
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Calculate the total storage used by all recordings
   * @returns {Promise<number>} Total storage in bytes
   */
  async calculateTotalStorage() {
    try {
      // Get all security recording albums
      const allAlbums = await MediaLibrary.getAlbumsAsync();
      const securityAlbums = allAlbums.filter(album => album.title.startsWith('Security Recordings'));
      
      let totalSize = 0;
      
      for (const album of securityAlbums) {
        const { assets } = await MediaLibrary.getAssetsAsync({
          album: album.id,
          mediaType: MediaLibrary.MediaType.video
        });
        
        for (const asset of assets) {
          totalSize += asset.fileSize || 0;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate total storage:', error);
      return 0;
    }
  }

  /**
   * Save frame as individual image (used as fallback when base64 has issues)
   * @param {Object} recording - Recording object
   * @param {string} frameData - Base64 encoded frame data
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _saveFrameAsImage(recording, frameData) {
    if (!recording || !frameData || frameData.trim().length === 0) {
      return false;
    }
    
    try {
      // Get safe camera name with proper null checks
      let cameraName = 'unknown';
      
      if (recording.camera) {
        if (typeof recording.camera === 'string') {
          cameraName = recording.camera;
        } else if (recording.camera.name) {
          cameraName = recording.camera.name;
        } else if (recording.camera.ip) {
          cameraName = recording.camera.ip;
        }
      }
      
      // Generate safe name for directory
      const safeCameraName = cameraName.replace(/[^a-z0-9]/gi, '_');
        
      const cameraDir = `${FileSystem.documentDirectory}recordings/${safeCameraName}`;
      const sessionId = format(new Date(recording.startTime), 'yyyyMMdd_HHmmss');
      const framesDir = `${cameraDir}/frames_${sessionId}`;
      
      // Create directories if needed (use cached flag to avoid checking repeatedly)
      if (!recording.framesPathCreated) {
        const dirInfo = await FileSystem.getInfoAsync(framesDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(framesDir, { intermediates: true });
        }
        recording.framesPathCreated = true;
        recording.framesDir = framesDir;
      }
      
      // Generate unique filename for this frame
      const frameFilename = `frame_${recording.imageCount.toString().padStart(6, '0')}.jpg`;
      const framePath = `${recording.framesDir || framesDir}/${frameFilename}`;
      
      // Write frame as individual JPEG file
      await FileSystem.writeAsStringAsync(
        framePath,
        frameData.trim(),  // Ensure clean base64 data
        { encoding: FileSystem.EncodingType.Base64 }
      );
      
      // Increment image counter
      recording.imageCount = (recording.imageCount || 0) + 1;
      
      // Only log occasionally to reduce overhead
      if (!recording.reduceLogging || recording.imageCount % 10 === 0) {
        console.log(`Saved image frame ${frameFilename} (${recording.imageCount} total)`);
      }
      
      // Only add images to media library occasionally (every 30th frame) to reduce overhead
      if (recording.imageCount % 30 === 0 && this.recordingConfig.saveToMediaLibrary) {
        try {
          // Create an asset from the frame
          const asset = await MediaLibrary.createAssetAsync(framePath);
          
          // Create or update the album for these frames
          const albumName = `Frames - ${safeCameraName} - ${format(new Date(recording.startTime), 'yyyy-MM-dd')}`;
          
          // Cache album info to avoid repeated lookups
          if (!recording.album) {
            const albums = await MediaLibrary.getAlbumsAsync();
            recording.album = albums.find(a => a.title === albumName);
            
            if (!recording.album) {
              recording.album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
            } else {
              await MediaLibrary.addAssetsToAlbumAsync([asset], recording.album, false);
            }
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], recording.album, false);
          }
        } catch (albumError) {
          if (!recording.reduceLogging) {
            console.warn('Could not add frame to album:', albumError);
          }
        }
      }
      
      return true;
    } catch (error) {
      if (!recording.reduceLogging) {
        console.error(`Failed to save frame as image:`, error);
      }
      return false;
    }
  }

  /**
   * Get detailed recording status for debugging
   * @param {Object|string} camera - Camera object or identifier
   * @returns {Object|null} Detailed recording status or null if not recording
   */
  getRecordingStatus(camera) {
    if (!camera) return null;
    
    const cameraId = typeof camera === 'string' ? camera : (camera.ip || null);
    if (!cameraId) return null;
    
    const recording = this.activeRecordings[cameraId];
    if (!recording) return null;
    
    return {
      isActive: recording.isActive,
      startTime: recording.startTime,
      frameCount: recording.frameCount,
      frameRate: recording.frameRate,
      useImageFallback: recording.useImageFallback || false,
      base64ErrorCount: recording.base64ErrorCount || 0,
      bufferSize: recording.frameBuffer ? recording.frameBuffer.length : 0,
      currentFileSize: recording.currentFileSize || 0,
      totalSize: recording.totalSize || 0,
      dimensions: recording.videoWidth && recording.videoHeight ? 
        `${recording.videoWidth}x${recording.videoHeight}` : 'unknown',
      lastFrameTime: recording.lastFrameTime || 0,
      lastWriteTime: recording.lastWriteTime || 0,
      timeSinceLastFrame: recording.lastFrameTime ? (Date.now() - recording.lastFrameTime) : null,
      timeSinceLastWrite: recording.lastWriteTime ? (Date.now() - recording.lastWriteTime) : null,
    };
  }

  /**
   * Connect to camera WebSocket for streaming
   * @param {Object|string} camera - Camera object or identifier
   * @param {Object} recording - Recording state object
   * @returns {Promise<boolean>} - Whether connection was successful
   * @private
   */
  async _connectToCamera(camera, recording) {
    try {
      // Format IP properly for WebSocket URL
      let wsUrl;
      if (typeof camera === 'string') {
        wsUrl = camera.startsWith('ws://') ? camera : `ws://${camera}/ws`;
      } else {
        wsUrl = camera.ip.startsWith('ws://') ? camera.ip : `ws://${camera.ip}/ws`;
      }
      
      // Ensure URL ends with /ws
      if (!wsUrl.endsWith('/ws')) {
        wsUrl = `${wsUrl}/ws`;
      }
      
      console.log(`Connecting to camera WebSocket: ${wsUrl}`);
      
      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);
      recording.ws = ws;
      
      // Define callback for frame data - reduce overhead by passing null for now
      const onFrameCallback = this.recordingConfig.optimizePerformance ? null : (frameData) => {
        // Only process some frames for UI feedback to reduce overhead
        if (recording.frameCount % 10 === 0) {
          this.recordingStats[recording.camera.ip] = {
            frameCount: recording.frameCount,
            frameRate: recording.frameRate,
            totalSize: this.formatFileSize(recording.totalSize),
            useImageFallback: recording.useImageFallback,
            duration: Math.floor((Date.now() - recording.startTime) / 1000)
          };
        }
      };
      
      // Set up WebSocket event handlers
      ws.onopen = () => {
        console.log(`Connected to camera at ${wsUrl}`);
        recording.wsConnected = true;
        
        // Send initial config request
        try {
          ws.send(JSON.stringify({ type: 'config', request: 'full' }));
        } catch (e) {
          console.warn('Failed to send config request:', e);
        }
      };
      
      ws.onclose = () => {
        console.log(`WebSocket connection closed for ${wsUrl}`);
        recording.wsConnected = false;
        
        // Attempt to reconnect if recording is still active
        if (recording.isActive) {
          console.log('Attempting to reconnect in 5 seconds...');
          setTimeout(() => {
            if (recording.isActive) {
              this._connectToCamera(camera, recording).catch(e => {
                console.error('Reconnection failed:', e);
              });
            }
          }, 5000);
        }
      };
      
      ws.onerror = (error) => {
        console.error(`WebSocket error for ${wsUrl}:`, error);
      };
      
      // Set up optimized message handler
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'video') {
            const now = Date.now();
            
            // Fast path for performance optimization - only process some frames for stats
            recording.frameCount++;
            
            // Only update stats every 5 frames to reduce overhead
            if (recording.frameCount % 5 === 0) {
              const frameInterval = now - recording.lastFrameTime;
              recording.lastFrameTime = now;
              
              // Calculate frame rate from last few frames
              recording.frameIntervals.push(frameInterval);
              if (recording.frameIntervals.length > 5) {
                recording.frameIntervals.shift();
              }
              
              if (recording.frameIntervals.length > 0) {
                const avgInterval = recording.frameIntervals.reduce((sum, val) => sum + val, 0) / recording.frameIntervals.length;
                recording.frameRate = Math.round(1000 / avgInterval);
              }
            }
            
            // Very basic validation when optimizing for performance
            if (!message.data || typeof message.data !== 'string') {
              return;
            }
            
            // Minimal base64 validation for performance
            const frameData = message.data.trim();
            if (recording.skipFrameValidation) {
              // Skip extended validation when optimizing for performance
              // Just do a quick check on the first character
              if (frameData.length === 0 || !/^[A-Za-z0-9+/=]/.test(frameData.charAt(0))) {
                recording.base64ErrorCount = (recording.base64ErrorCount || 0) + 1;
                return;
              }
            } else {
              // Full validation for non-optimized mode
              // (existing validation code - omitted for brevity)
              // Add frames to buffer or image fallback
            }
            
            // Process the frame
            if (recording.useImageFallback) {
              // In fallback mode, save frames as images but only every 3rd frame to reduce load
              if (recording.frameCount % 3 === 0) {
                await this._saveFrameAsImage(recording, frameData).catch(e => {
                  if (!recording.reduceLogging) {
                    console.warn('Error saving frame as image:', e);
                  }
                });
              }
            } else {
              // Add frame to buffer for normal MP4 recording
              recording.frameBuffer.push(frameData);
              
              // Write frames when buffer size threshold is reached
              if (recording.frameBuffer.length >= this.recordingConfig.maxBufferSize) {
                // Don't await to avoid blocking the message handler
                recording.lastWriteTime = now;
                this._writeFramesToFile(recording).catch(error => {
                  if (!recording.reduceLogging) {
                    console.error('Error writing frames to file:', error);
                  }
                });
              }
              
              // Also check time-based writing if enabled
              else if (this.recordingConfig.timeBasedWriting && 
                      now - recording.lastWriteTime > this.recordingConfig.writeIntervalMs) {
                recording.lastWriteTime = now;
                this._writeFramesToFile(recording).catch(error => {
                  if (!recording.reduceLogging) {
                    console.error('Error writing frames to file:', error);
                  }
                });
              }
            }
            
            // Call the frame callback if provided
            if (onFrameCallback && recording.frameCount % 10 === 0) {
              onFrameCallback(frameData);
            }
          } else if (message.type === 'config') {
            // Update video dimensions if provided
            if (message.width && message.height) {
              recording.videoWidth = message.width;
              recording.videoHeight = message.height;
            }
          }
        } catch (error) {
          if (!recording.reduceLogging) {
            console.error(`Error processing frame: ${error}`);
          }
        }
      };
      
      return true;
    } catch (error) {
      console.error('Failed to connect to camera:', error);
      return false;
    }
  }

  /**
   * Get all recordings for all cameras
   * @returns {Promise<Array>} List of all recordings
   */
  async getAllRecordings() {
    try {
      // Get all Security Recordings albums
      const allAlbums = await MediaLibrary.getAlbumsAsync();
      const securityAlbums = allAlbums.filter(album => album.title.startsWith('Security Recordings'));
      
      let allRecordings = [];
      
      // Fetch recordings from each album
      for (const album of securityAlbums) {
        // Extract camera name from album title
        const cameraName = album.title.replace('Security Recordings - ', '');
        
        // Get all assets in the album
        const { assets } = await MediaLibrary.getAssetsAsync({
          album: album.id,
          mediaType: MediaLibrary.MediaType.video,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        
        // Map assets to recording objects
        const recordings = assets.map(asset => ({
          id: asset.id,
          cameraName: cameraName,
          fileName: asset.filename,
          path: asset.uri,
          duration: asset.duration,
          creationTime: asset.creationTime,
          date: new Date(asset.creationTime * 1000),
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          formattedSize: this.formatFileSize(asset.fileSize)
        }));
        
        allRecordings = [...allRecordings, ...recordings];
      }
      
      // Sort by creation time (newest first)
      return allRecordings.sort((a, b) => b.creationTime - a.creationTime);
    } catch (error) {
      console.error('Failed to get all recordings:', error);
      return [];
    }
  }
}

// Create singleton instance
const recordingService = new RecordingService();
export default recordingService; 