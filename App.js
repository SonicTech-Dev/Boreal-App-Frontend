import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, PermissionsAndroid, Alert, AppState } from 'react-native';
import Home from './Pages/Home';
import SelectPage from './Pages/Choose';
import Settings from './Pages/Settings';
import Main from './Pages/Main';
import Config from './Pages/Configure_RemoteStation';
import PushNotification from 'react-native-push-notification';
import messaging from '@react-native-firebase/messaging';

const SERVER_SAVE_TOKEN_ENDPOINT = 'https://boreal-2.soniciot.com/api/save-token';

export default function App() {
  const [fcmToken, setFcmToken] = useState(null);

  // Refs to manage single registration + unsubscribe functions
  const registeredRef = useRef(false);
  const tokenRefreshUnsubscribeRef = useRef(null);
  const messageUnsubscribeRef = useRef(null);
  const lastForegroundCheckRef = useRef(0);
  const APPSTATE_THROTTLE_MS = 2000; // don't re-check too frequently when coming to foreground

  // Configure local notification / channel once
  useEffect(() => {
    PushNotification.configure({
      onRegister: function (token) {
        // local notification token
      },
      onNotification: function (notification) {
        // handle opened/received local/remote notifications
      },
      popInitialNotification: true,
      requestPermissions: false,
    });

    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'default-channel-id',
          channelName: 'Default Channel',
          channelDescription: 'A default channel for app notifications',
          importance: 4,
          vibrate: true,
        },
        (created) => {}
      );
    }
  }, []);

  // Helper: send token to backend
  const sendTokenToBackend = async (token) => {
    if (!token) return;
    try {
      const res = await fetch(SERVER_SAVE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        console.warn('Failed to save token to backend; status:', res.status);
      }
    } catch (error) {
      console.warn('Error sending token to backend:', error);
    }
  };

  // Helper: Android 13+ permission request/check
  const requestAndroidNotificationPermissionIfNeeded = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Notification Permission',
            message: 'This app needs notification permission to show alerts.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('PermissionsAndroid.request error', err);
        return false;
      }
    }
    return true; // pre-Android13
  };

  // Helper: check current permission state without forcing a user prompt
  const checkCurrentNotificationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const check = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          return check;
        }
        return true;
      } else {
        // On iOS (and Android) requestPermission resolves immediately with current status
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL ||
          authStatus === 1 ||
          authStatus === 2;
        return !!enabled;
      }
    } catch (err) {
      console.warn('Error checking notification permission:', err);
      return false;
    }
  };

  // Centralized register function (safe to call multiple times)
  const ensureRegistered = async ({ allowPrompt = false } = {}) => {
    try {
      // avoid rapid repeated calls (throttle)
      if (Date.now() - lastForegroundCheckRef.current < APPSTATE_THROTTLE_MS) {
        return;
      }
      lastForegroundCheckRef.current = Date.now();

      const permissionOk = allowPrompt
        ? await requestAndroidNotificationPermissionIfNeeded()
        : await checkCurrentNotificationPermission();

      // If not allowed, don't try to register; caller can show UI or prompt separately
      if (!permissionOk) {
        return;
      }

      // If already registered, still re-check token (some devices may rotate token)
      if (!registeredRef.current) {
        await messaging().registerDeviceForRemoteMessages();
        messaging().setAutoInitEnabled(true);

        // Get token
        const token = await messaging().getToken();
        if (token) {
          setFcmToken(token);
          await sendTokenToBackend(token);
        } else {
          console.warn('messaging().getToken() returned empty token');
        }

        // Subscribe handlers and save unsubscribes
        tokenRefreshUnsubscribeRef.current = messaging().onTokenRefresh(async (newToken) => {
          try {
            setFcmToken(newToken);
            await sendTokenToBackend(newToken);
          } catch (e) {
            console.warn('onTokenRefresh handler error', e);
          }
        });

        messageUnsubscribeRef.current = messaging().onMessage(async (remoteMessage) => {
          try {
            const notification = remoteMessage.notification || {};
            PushNotification.localNotification({
              channelId: 'default-channel-id',
              title: notification.title ?? 'Notification',
              message: notification.body ?? '',
              playSound: true,
              soundName: 'default',
              vibrate: true,
              importance: 4,
            });
          } catch (e) {
            console.warn('Error showing local notification:', e);
          }
        });

        registeredRef.current = true;
      } else {
        // Already registered: refresh token once to be safe
        try {
          const token = await messaging().getToken();
          if (token && token !== fcmToken) {
            setFcmToken(token);
            await sendTokenToBackend(token);
          }
        } catch (e) {
          console.warn('Error refreshing token after becoming active', e);
        }
      }
    } catch (err) {
      console.warn('FCM registration/token error in ensureRegistered:', err);
    }
  };

  // Effect: initial registration on mount (allow prompting for Android at cold start)
  useEffect(() => {
    ensureRegistered({ allowPrompt: true });

    return () => {
      // cleanup on unmount
      if (typeof tokenRefreshUnsubscribeRef.current === 'function') {
        try {
          tokenRefreshUnsubscribeRef.current();
        } catch {}
      }
      if (typeof messageUnsubscribeRef.current === 'function') {
        try {
          messageUnsubscribeRef.current();
        } catch {}
      }
    };
  }, []);

  // Effect: re-check when app comes to foreground (helps when user enables notifications in Settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // ensureRegistered won't prompt on Android if allowPrompt=false; it will only check current state.
        // If you want to open the runtime request when returning from settings, call ensureRegistered({ allowPrompt: true })
        // but avoid calling allowPrompt too eagerly since it triggers system dialogs.
        ensureRegistered({ allowPrompt: false });
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Stack = createNativeStackNavigator();

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="SelectPage" component={SelectPage} />
        <Stack.Screen name="Settings" component={Settings} />
        <Stack.Screen name="Main" component={Main} />
        <Stack.Screen name="Config" component={Config} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}