import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  Alert, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  Animated, 
  Dimensions,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const LoginForm = ({ onLogin, onSwitchToRegister, users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  
  // Animation values for native driver (transform, opacity)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const buttonScale = useRef(new Animated.Value(0.95)).current;
  const usernameTranslateX = useRef(new Animated.Value(40)).current;
  const passwordTranslateX = useRef(new Animated.Value(60)).current;
  const usernameOpacity = useRef(new Animated.Value(0)).current;
  const passwordOpacity = useRef(new Animated.Value(0)).current;
  
  // Separate animation values for JS driver (colors, etc.)
  const usernameBgAnim = useRef(new Animated.Value(0)).current;
  const passwordBgAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // Main entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Staggered input animations with delay
    Animated.sequence([
      Animated.delay(400),
      Animated.stagger(200, [
        Animated.parallel([
          Animated.timing(usernameOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.spring(usernameTranslateX, {
            toValue: 0,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(passwordOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.spring(passwordTranslateX, {
            toValue: 0,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, []);

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      // Add success animation before login
      Animated.sequence([
        Animated.parallel([
          Animated.timing(usernameOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(passwordOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onLogin(user);
      });
    } else {
      // Shake animation for error
      const shakeAnimation = Animated.sequence([
        Animated.timing(slideAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]);
      
      shakeAnimation.start(() => {
        Alert.alert('Error', 'Invalid username or password');
      });
    }
  };

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };
  
  // Handle focus animations with JS driver
  const handleUsernameFocus = () => {
    setUsernameFocused(true);
    Animated.timing(usernameBgAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  const handleUsernameBlur = () => {
    setUsernameFocused(false);
    Animated.timing(usernameBgAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  const handlePasswordFocus = () => {
    setPasswordFocused(true);
    Animated.timing(passwordBgAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  const handlePasswordBlur = () => {
    setPasswordFocused(false);
    Animated.timing(passwordBgAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  // Interpolate background colors for inputs
  const usernameBgColor = usernameBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.15)']
  });
  
  const passwordBgColor = passwordBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.15)']
  });
  
  const usernameBorderColor = usernameBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', '#E94057']
  });
  
  const passwordBorderColor = passwordBgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', '#E94057']
  });

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradientBackground}
      />
      <Animated.View 
        style={[
          styles.formContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <Text style={styles.title}>Smart CCTV</Text>
        <Text style={styles.subtitle}>Login to your account</Text>
        
        <View style={styles.inputWrapper}>
          <Animated.View 
            style={[
              styles.inputContainer,
              {
                backgroundColor: usernameBgColor,
                borderColor: usernameBorderColor,
              }
            ]}
          >
            <Animated.View
              style={{
                opacity: usernameOpacity,
                transform: [{ translateX: usernameTranslateX }],
                width: '100%',
              }}
            >
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#a0a0a0"
                value={username}
                onChangeText={setUsername}
                onFocus={handleUsernameFocus}
                onBlur={handleUsernameBlur}
              />
            </Animated.View>
          </Animated.View>
        </View>
        
        <View style={styles.inputWrapper}>
          <Animated.View 
            style={[
              styles.inputContainer,
              {
                backgroundColor: passwordBgColor,
                borderColor: passwordBorderColor,
              }
            ]}
          >
            <Animated.View
              style={{
                opacity: passwordOpacity,
                transform: [{ translateX: passwordTranslateX }],
                width: '100%',
              }}
            >
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#a0a0a0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                onFocus={handlePasswordFocus}
                onBlur={handlePasswordBlur}
              />
            </Animated.View>
          </Animated.View>
        </View>
        
        <TouchableOpacity style={styles.forgotPassword}>
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>
        
        <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleLogin}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <LinearGradient
              colors={['#E94057', '#F27121']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>Login</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        
        <TouchableOpacity onPress={onSwitchToRegister} style={styles.switchContainer}>
          <Text style={styles.switchTextLight}>Don't have an account? </Text>
          <Text style={styles.switchTextBold}>Register here</Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  formContainer: {
    width: width * 0.9,
    maxWidth: 400,
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#1e233c',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#d1d1d1',
    marginBottom: 28,
    textAlign: 'center',
  },
  inputWrapper: {
    marginBottom: 12,
  },
  inputContainer: {
    height: 55,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: "#1e233c",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  input: {
    height: '100%',
    width: '100%',
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#fff',
  },
  button: {
    marginTop: 12,
    height: 55,
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  switchTextLight: {
    fontSize: 14,
    color: '#d1d1d1',
  },
  switchTextBold: {
    fontSize: 14,
    color: '#E94057',
    fontWeight: 'bold',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 16,
  },
  forgotPasswordText: {
    color: '#d1d1d1',
    fontSize: 14,
  }
});

export default LoginForm;