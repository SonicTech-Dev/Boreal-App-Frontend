import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './Pages/Home'
import SelectPage from './Pages/Choose';
import Settings from './Pages/Settings';
import Main from './Pages/Main';
import Config from './Pages/Configure_RemoteStation';

export default function App() {
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
