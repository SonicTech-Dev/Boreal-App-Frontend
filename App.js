import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import Home from './Pages/Home';
import SelectPage from './Pages/Choose';
import Settings from './Pages/Settings';
import Main from './Pages/Main';
import Config from './Pages/Configure_RemoteStation';
import PushNotification from 'react-native-push-notification';
import messaging from '@react-native-firebase/messaging';

const SERVER_SAVE_TOKEN_ENDPOINT = 'https://boreal.soniciot.com/api/save-token';

export default function App() {
  const [fcmToken, setFcmToken] = useState(null);

  // Create Android notification channel and configure PushNotification
  useEffect(() => {
    // Configure local notification library
    PushNotification.configure({
      onRegister: function (token) {
        // token for local notifications (not FCM)
        // console.log('PushNotification onRegister:', token);
      },
      onNotification: function (notification) {
        // Called when a remote or local notification is opened or received
        // console.log('LOCAL/REMOTE notification:', notification);
        // Required on iOS only - notification.finish(PushNotificationIOS.FetchResult.NoData);
      },
      // Android only
      popInitialNotification: true,
      requestPermissions: false, // we'll manage permission flow ourselves
    });

    // Create channel for Android (id used below in local notifications)
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'default-channel-id',
          channelName: 'Default Channel',
          channelDescription: 'A default channel for app notifications',
          importance: 4,
          vibrate: true,
        },
        (created) => {
          // console.log(`createChannel returned '${created}'`);
        }
      );
    }
  }, []);

  // Request notification permission and register for remote messages, then get token
  useEffect(() => {
    let tokenRefreshUnsubscribe = null;
    let messageUnsubscribe = null;

    const showEnableNotificationsAlert = () => {
      Alert.alert(
        'Enable Notifications',
        'Please enable notifications to receive alerts from this app.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              // Opening app settings requires Linking; keep it simple for the user instruction below
            },
          },
        ],
        { cancelable: true }
      );
    };

    const requestAndroidNotificationPermissionIfNeeded = async () => {
      // Android 13+ requires runtime permission POST_NOTIFICATIONS
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
      // Pre-Android13: no runtime permission needed
      return true;
    };

    const registerAndGetToken = async () => {
      try {
        // On both platforms register device for remote messages first
        await messaging().registerDeviceForRemoteMessages();

        // Ensure auto init is enabled (optional but good)
        messaging().setAutoInitEnabled(true);

        // Get current permission and request if necessary
        const androidOk = await requestAndroidNotificationPermissionIfNeeded();

        // On iOS / Android we still attempt to request messaging permission (this will prompt on iOS)
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL ||
          androidOk;

        if (!enabled) {
          // permission denied - show friendly popup (only one)
          showEnableNotificationsAlert();
          console.warn('Notification permission not granted');
          // we still continue to try getting token; on many Android devices token will still be available
        }

        // Get FCM token
        const token = await messaging().getToken();
        if (token) {
          setFcmToken(token);
          await sendTokenToBackend(token);
        } else {
          console.warn('messaging().getToken() returned empty token');
        }

        // Listen for token refresh and forward to backend
        tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (newToken) => {
          setFcmToken(newToken);
          await sendTokenToBackend(newToken);
        });

        // Foreground message handler (show local notification)
        messageUnsubscribe = messaging().onMessage(async (remoteMessage) => {
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
      } catch (err) {
        console.warn('FCM registration/token error:', err);
      }
    };

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
        } else {
          // optional: check backend response body
          // const body = await res.json();
        }
      } catch (error) {
        console.warn('Error sending token to backend:', error);
      }
    };

    registerAndGetToken();

    return () => {
      if (typeof tokenRefreshUnsubscribe === 'function') tokenRefreshUnsubscribe();
      if (typeof messageUnsubscribe === 'function') messageUnsubscribe();
    };
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