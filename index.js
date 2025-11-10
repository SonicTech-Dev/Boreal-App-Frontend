/**
 * Permission + AppState guard changes to avoid repeated prompts
 */

import { AppRegistry, Platform, AppState, Alert, Linking, PermissionsAndroid } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

// ... keep your createNotificationChannel() and messaging().setBackgroundMessageHandler(...) unchanged ...

// ----- Guards to avoid repeated prompts / blinking -----
let permissionPromptInProgress = false; // prevents re-entering permission flow while a prompt is visible
let lastPromptAt = 0;
const PROMPT_THROTTLE_MS = 20_000; // don't prompt more than once every 20s
let appStateSubscription = null; // store subscription so we don't add multiple listeners

const openAppSettings = () => {
  Linking.openSettings().catch(() => console.warn('Unable to open settings'));
};

const showEnableNotificationsAlert = () => {
  // If another prompt is already visible, skip
  if (permissionPromptInProgress) return;

  permissionPromptInProgress = true;
  lastPromptAt = Date.now();

  Alert.alert(
    'Enable Notifications',
    'Please enable notifications in Settings to receive alerts and messages.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          permissionPromptInProgress = false; // allow future prompts
        },
      },
      {
        text: 'Open Settings',
        onPress: () => {
          openAppSettings();
          // give user time to switch to Settings; once they return we will allow re-prompt (throttled)
          setTimeout(() => { permissionPromptInProgress = false; }, 3000);
        },
      },
    ],
    { cancelable: true }
  );

  // Safety: in case alert callbacks never fire (rare), reset after 15s
  setTimeout(() => { permissionPromptInProgress = false; }, 15_000);
};

const checkAndRequestNotificationPermission = async () => {
  try {
    // Throttle: avoid calling too frequently (helps prevent loops)
    if (Date.now() - lastPromptAt < PROMPT_THROTTLE_MS) {
      return false;
    }

    if (Platform.OS === 'ios') {
      // Only request once at a time
      if (permissionPromptInProgress) return false;
      permissionPromptInProgress = true;

      try {
        const authStatus = await messaging().requestPermission();
        const granted =
          authStatus === messaging.AuthorizationStatus?.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus?.PROVISIONAL ||
          authStatus === 1 ||
          authStatus === 2;

        permissionPromptInProgress = false;
        if (granted) {
          console.log('✅ iOS: Notification permission granted');
          lastPromptAt = Date.now();
          return true;
        } else {
          showEnableNotificationsAlert();
          return false;
        }
      } catch (err) {
        permissionPromptInProgress = false;
        console.error('requestPermission error', err);
        showEnableNotificationsAlert();
        return false;
      }
    }

    if (Platform.OS === 'android') {
      // Android 13+ needs runtime permission
      const apiLevel = Platform.Version;
      if (apiLevel >= 33) {
        // don't spam the runtime dialog either
        if (permissionPromptInProgress) return false;
        permissionPromptInProgress = true;

        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        try {
          const result = await PermissionsAndroid.request(permission);
          permissionPromptInProgress = false;
          lastPromptAt = Date.now();

          if (result === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ Android: POST_NOTIFICATIONS granted');
            return true;
          }

          // denied / never_ask_again -> show in-app settings alert (once)
          showEnableNotificationsAlert();
          return false;
        } catch (err) {
          permissionPromptInProgress = false;
          console.error('PermissionsAndroid.request error', err);
          showEnableNotificationsAlert();
          return false;
        }
      }

      // Pre-Android13: no runtime permission required
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error requesting notification permission', err);
    permissionPromptInProgress = false;
    return false;
  }
};

// Initial check at cold start (but throttled)
checkAndRequestNotificationPermission();

// Add a single AppState listener (guard against adding more than once, important in dev with hot reload)
if (!appStateSubscription) {
  // RN AppState.addEventListener returns a subscription object with .remove()
  appStateSubscription = AppState.addEventListener('change', nextAppState => {
    if (nextAppState === 'active') {
      // Only attempt if not currently showing a prompt and not recently prompted
      if (!permissionPromptInProgress && (Date.now() - lastPromptAt) > PROMPT_THROTTLE_MS) {
        checkAndRequestNotificationPermission();
      }
    }
  });
}

// If you ever need to remove the listener (example cleanup):
// appStateSubscription?.remove();

AppRegistry.registerComponent(appName, () => App);