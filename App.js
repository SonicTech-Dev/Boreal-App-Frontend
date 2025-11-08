import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './Pages/Home'
import SelectPage from './Pages/Choose';
import Settings from './Pages/Settings';
import Main from './Pages/Main';
import Config from './Pages/Configure_RemoteStation';
import PushNotification from 'react-native-push-notification';
import messaging from '@react-native-firebase/messaging';
export default function App() {
    useEffect(() => {
    const requestUserPermission = async () => {
      const authStatus = await messaging().requestPermission();
      if (authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL) {
        console.log('✅ Notification permission granted.');
      } else {
        console.log('❌ Notification permission denied.');
      }
    };

    const getTokenAndSendToBackend = async () => {
      try {
        const token = await messaging().getToken();
        console.log('🔑 FCM Token:', token);
  
        // Send the token to the backend
        await fetch('http://192.168.1.106/api/save-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });
  
      } catch (error) {
        console.error('🔥 Error getting FCM token:', error);
      }
    };
  

    requestUserPermission();
    getTokenAndSendToBackend();
  }, []);

  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('📩 Foreground Notification Received:', remoteMessage);

      PushNotification.localNotification({
        channelId: 'default-channel-id',
        title: remoteMessage.notification.title,
        message: remoteMessage.notification.body,
        playSound: true,
        soundName: 'default',
        vibrate: true,
        importance: 4,
      });
    });

    return unsubscribe; // Cleanup function
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
