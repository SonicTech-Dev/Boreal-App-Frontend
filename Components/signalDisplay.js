import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import io from 'socket.io-client';

const SignalDisplay = ({ serialNo }) => {
  const [signal, setSignal] = useState(null);
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    const socket = io('http://3.227.99.254:3006'); // Replace with your server address

    socket.on('signal', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received signal data:', data);
        console.log('Serial No:', serialNo);

        // Check if serial number matches before updating state
        if (data.serial === serialNo) {
          setSignal(data.signal);
          setIsMatching(true);
          console.log(`Matched Serial No: ${serialNo}, Signal: ${data.signal}`);
        } else {
          setIsMatching(false);
        }
      } catch (error) {
        console.error('Error parsing signal data:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [serialNo]); // Re-run effect if serialNo changes


  return (
    <View style={styles.serialbox}>
      <Text style={styles.serialno}>
        GSM Signal : {signal !== null ? `${signal}%` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  serialbox: {
    width: 110,
    height: 40,
    backgroundColor: '#000',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#888',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 5,
  },
  serialno: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: '#16b800',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
  },
});

export default SignalDisplay;