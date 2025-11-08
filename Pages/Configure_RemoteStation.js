import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ImageBackground,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function ChangePage() {
  const [serialNames, setSerialNames] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    fetch('http://3.227.99.254:3004/api/remote_stations')
      .then((response) => response.json())
      .then((data) => {
        const sortedData = data
          .filter((item) => item.category === 'boreal')
          .map((item) => ({ id: item.id, name: item.name })) // Preserve IDs
          .sort((a, b) => a.name.localeCompare(b.name));

        console.log('Fetched Serial Names:', sortedData); // Debugging
        setSerialNames(sortedData);
      })
      .catch((error) => console.error(error));
  }, []);

  const handleNameChange = (id, newName) => {
    setSerialNames((prevNames) =>
      prevNames.map((item) => (item.id === id ? { ...item, name: newName } : item))
    );
  };

  const handleSubmit = async () => {
    try {
      const updateNamesPromises = serialNames.map(({ id, name }) =>
        fetch(`http://3.227.99.254:3004/api/remote_stations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      );
      await Promise.all(updateNamesPromises);

      console.log('Serial names updated successfully');
      navigation.goBack(); // Navigate back to the previous page
    } catch (error) {
      console.error('Error updating serial names:', error);
    }
  };

  return (
    <ImageBackground source={require('../Assets/bg2.png')} style={styles.background} resizeMode="cover">
      <View style={styles.container}>
        {/* Top row: page title (first row) */}
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>Configure Remote Station Name</Text>
        </View>

        {/* Second row: logo centered */}
        <View style={styles.logoRow}>
          <Image style={styles.logo} source={require('../Assets/boreal.png')} resizeMode="contain" />
        </View>

        {/* Centered area: card + submit centered on screen */}
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.centerContainer}>
            <View style={styles.card}>
              {/* keep the card heading unchanged */}
              <Text style={styles.sectionTitle}>Configure Remote Station Name</Text>

              <View style={styles.serialList}>
                {serialNames.map(({ id, name }) => (
                  <View key={id} style={styles.serialWrapper}>
                    {isEditing ? (
                      <TextInput
                        style={styles.textInput}
                        value={name}
                        onChangeText={(newName) => handleNameChange(id, newName)}
                      />
                    ) : (
                      <Text style={styles.serialName}>{name}</Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={styles.buttonRow}>
                {!isEditing ? (
                  <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditing(true)}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditing(false)}>
                    <Text style={styles.actionButtonText}>Save</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Text style={styles.subTextdown}>Powered by SONIC</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
  },

  // Page title (first row)
  pageTitleRow: {
    width: '100%',
    paddingTop: 18,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  // Logo row (second row)
  logoRow: {
    width: '100%',
    paddingTop: 6,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 140,
    height: 44,
    opacity: 0.95,
  },

  // Scroll area that centers content
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', // center card and submit vertically in available scroll area
  },

  // Card (kept heading inside)
  card: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#000',
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'left',
  },

  // Serial list
  serialList: {
    marginBottom: 10,
  },
  serialWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  serialName: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  textInput: {
    width: '100%',
    backgroundColor: '#f7f7f7',
    padding: 10,
    color: '#000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  // card buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  actionButton: {
    backgroundColor: '#2a8f2a',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 24,
    elevation: 3,
    marginHorizontal: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },

  // Submit button centered below card
  submitButton: {
    backgroundColor: '#28a745',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 28,
    elevation: 4,
    marginTop: 10,
    alignSelf: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  subTextdown: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 10,
  },
});