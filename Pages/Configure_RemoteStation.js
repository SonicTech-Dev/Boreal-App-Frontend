import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ScrollView, Image ,ImageBackground} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function ChangePage() {
    const [serialNames, setSerialNames] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const navigation = useNavigation();

    useEffect(() => {
        fetch('http://192.168.1.101:3004/api/remote_stations')
            .then((response) => response.json())
            .then((data) => {
                const sortedData = data
                    .filter((item) => item.category === 'boreal')
                    .map((item) => ({ id: item.id, name: item.name })) // Preserve IDs
                    .sort((a, b) => a.name.localeCompare(b.name));
    
                console.log("Fetched Serial Names:", sortedData); // Debugging
                setSerialNames(sortedData);
            })
            .catch((error) => console.error(error));
    }, []);
    
    const handleNameChange = (id, newName) => {
        setSerialNames((prevNames) => 
            prevNames.map((item) => 
                item.id === id ? { ...item, name: newName } : item // Ensures only one item is updated
            )
        );
    };
    
    const handleSubmit = async () => {
        try {
            const updateNamesPromises = serialNames.map(({ id, name }) =>
                fetch(`http://192.168.1.101:3004/api/remote_stations/${id}`, {
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
         <ImageBackground
            source={require("../Assets/bg2.png")} // Change this to your image path
            style={styles.background}
            resizeMode="cover"
            >
            <View style={styles.container}>
                <Image
                    style={styles.logo}
                    source={require('../Assets/boreal.png')} // Change this to your image path
                    resizeMode="contain"
                />

                <View style={styles.card}>
                    {/* Section Title */}
                    <Text style={styles.sectionTitle}>Change Field Names</Text>

                    {/* Serial Name List */}
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
                                    <Text style={styles.indicatorName}>{name}</Text>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Edit/Save Button */}
                    <View style={styles.buttonRow}>
                        {!isEditing ? (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditing(true)}
                            >
                                <Text style={styles.buttonText}>Edit</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditing(false)}
                            >
                                <Text style={styles.buttonText}>Save</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.buttonText}>Submit</Text>
                </TouchableOpacity>
                
            </View>
            <Text style={styles.subTextdown}>Powered by SONIC</Text>
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
        alignItems: 'center',
        padding: 20,
        justifyContent: 'center',
        opacity : 0.8
    },
    logo: {
        position: 'absolute',
        width: 250,
        height: 80,
        resizeMode: 'contain',
        alignSelf: 'center',
        top: 10
    },
    subTextdown: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.88)',
        textAlign: 'center',
        marginBottom: 10,
        marginTop: 10
    },
    scrollContainer: {
        flexGrow: 1, // Makes sure content can expand within ScrollView
    },
    card: {
        width: '100%',
        backgroundColor: '#fff', // Card background for sections
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    sectionTitle: {
        fontSize: 22,
        color: '#000',
        marginBottom: 15,
        fontWeight: '500',
    },
    serialList: {
        marginBottom: 20,
    },
    serialWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        paddingBottom: 10,
    },
    serialName: {
        fontSize: 18,
        color: '#000',
        flex: 1,
    },
    textInput: {
        width: '80%',
        backgroundColor: '#f0f0f0',
        padding: 10,
        color: '#000',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
    },
    actionButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.4)', // Blue color
        paddingVertical: 12,
        paddingHorizontal: 40,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 5,
        marginHorizontal: 10,
    },
    submitButton: {
        backgroundColor: '#28a745', // Green color for action
        paddingVertical: 15,
        paddingHorizontal: 50,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        marginTop: 30,
        elevation: 5,
    },
    buttonText: {
        fontSize: 16,
        color: '#fff',
        textAlign: 'center',
    },
});