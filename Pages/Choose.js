import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ImageBackground, Image, SafeAreaView } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import Menu from 'react-native-vector-icons/Entypo';
import { useFocusEffect } from '@react-navigation/native';

export default function SerialNumberPage({ navigation }) {
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [items, setItems] = useState([]);

  const fetchSerialList = async () => {
    try {
      const res = await fetch('https://boreal.soniciot.com/api/remote_stations');
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn('serial_list returned unexpected shape', data);
        setItems([]);
        return;
      }

      const filteredData = data.filter((item) => item.category === 'boreal');
      const sortedData = filteredData.sort((a, b) => a.name.localeCompare(b.name));
      setItems(sortedData.map((item) => ({ label: item.name, value: item.serial_number })));
    } catch (error) {
      console.error('Failed to fetch serial list:', error);
      setItems([]);
    }
  };

  useEffect(() => {
    fetchSerialList();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSerialList();
    }, [])
  );

  const onTilePress = () => {
    if (!selectedSerial) {
      alert('Please select the field');
      return;
    }
    console.log('Navigating to Main with serialNumber=', selectedSerial);
    navigation.navigate('Main', { serialNumber: selectedSerial });
  };

  const tiles = [
    { title: 'Laser Readings', onPress: onTilePress },
  ];

  return (
    <ImageBackground
      source={require('../Assets/bg2.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topRow}>
          <Menu
            style={styles.settings}
            name="menu"
            size={40}
            color="rgba(255, 255, 255, 0.8)"
            onPress={() => navigation.navigate('Config')}
          />
        </View>

        <View style={styles.brandContainer}>
          <View style={[styles.logoContainer, styles.elevation]}>
            <Image
              style={styles.logo}
              source={require('../Assets/logo.png')}
              resizeMode="contain"
            />
          </View>

          <View style={[styles.borealpicContainer, styles.elevation]}>
            <Image
              style={styles.borealpic}
              source={require('../Assets/Laser.png')}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.title}>REMOTE STATION</Text>
          <Text style={styles.subText}>Choose from the list below to proceed</Text>

          <Dropdown
            data={items}
            labelField="label"
            valueField="value"
            placeholder="Select a field"
            value={selectedSerial}
            onChange={(item) => setSelectedSerial(item.value)}
            style={styles.dropdown}
            containerStyle={styles.dropdownContainer}
            selectedTextStyle={styles.dropdownText}
            flatListProps={{
              nestedScrollEnabled: true,
            }}
          />

          <View style={styles.gridContainer}>
            {tiles.map((tile, index) => (
              <TouchableOpacity
                key={index}
                style={styles.tile}
                onPress={tile.onPress}
              >
                <Text style={styles.tileText}>{tile.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.subTextdown}>Powered by SONIC</Text>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  settings: {
    padding: 4,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logoContainer: {
    width: '80%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 5,
    marginTop: 12,
    padding: 10,
  },
  borealpicContainer: {
    width: '80%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 5,
    marginTop: 12,
    marginBottom: 12,
    padding: 8,
  },
  elevation: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  logo: {
    width: 250,
    height: 120,
    resizeMode: 'contain',
  },
  borealpic: {
    width: '99%',
    height: '99%',
    opacity: 0.9,
  },
  formContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  dropdown: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    borderColor: '#444',
    paddingHorizontal: 12,
    width: '80%',
    marginBottom: 18,
    height: 50,
  },
  dropdownContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
  },
  dropdownText: {
    color: '#000',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: '10%',
  },
  tile: {
    width: '100%',
    height: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  tileText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  subTextdown: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 18,
  },
});