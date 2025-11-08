/**
 * @format
 */

import { AppRegistry,Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import PushNotification from 'react-native-push-notification';
import PushNotificationIOS from '@react-native-community/push-notification-ios';

// ✅ Function to create notification channel (Android only)
const createNotificationChannel = () => {
  PushNotification.createChannel(
    {
      channelId: 'default-channel-id',
      channelName: 'Default Channel',
      channelDescription: 'A default channel for notifications',
      soundName: 'default',
      vibrate: true,
      importance: 4,
    },
    created => console.log(`🔔 CreateChannel returned: ${created}`)
  );
};

// ✅ Ensure notification channel is created before usage
if (Platform.OS === 'android') {
  createNotificationChannel();
}

// ✅ Handle Background & Quit-State Notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📩 Background Notification Received:', remoteMessage);

  // ✅ Android: Show notification in system tray & popup
  if (Platform.OS === 'android') {
    PushNotification.localNotification({
      channelId: 'default-channel-id', // Ensure this matches the created channel
      title: remoteMessage.notification?.title || 'Default Title',
      message: remoteMessage.notification?.body || 'Default Message',
      playSound: true,
      soundName: 'default',
      vibrate: true,
      priority: 'high',
      importance: 4,
    });
  }

  // ✅ iOS: Show popup for background messages
  if (Platform.OS === 'ios') {
    PushNotificationIOS.presentLocalNotification({
      alertTitle: remoteMessage.notification?.title || 'Default Title',
      alertBody: remoteMessage.notification?.body || 'Default Message',
    });
  }
});


AppRegistry.registerComponent(appName, () => App);
