import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Switch, ScrollView, Image } from 'react-native';

export default function SettingsPage({ route, navigation }) {
    const { serialNumber, indicatorNames, reverseState, onUpdate } = route.params;
    const [indicatorname, setIndicatorname] = useState(indicatorNames);
    const [isReversed, setIsReversed] = useState(reverseState);
    const [thresholds, setThresholds] = useState({}); // State for thresholds
    const [isEditingNames, setIsEditingNames] = useState(false);
    const [isEditingThresholds, setIsEditingThresholds] = useState(false); // Separate edit mode for thresholds

    useEffect(() => {
        // Fetch thresholds from the backend when the settings page loads
        const fetchThresholds = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/thresholds/${serialNumber}`);
                const data = await response.json();
                setThresholds(data); // Initialize thresholds from the backend
            } catch (error) {
                console.error('Error fetching thresholds:', error);
            }
        };

        fetchThresholds();
    }, [serialNumber]);

    const handleThresholdChange = (key, value) => {
        setThresholds((prev) => ({
            ...prev,
            [key]: value === "" ? "" : parseFloat(value), // Keep empty string when cleared
        }));
    };

    const handleNameChange = (id, newName) => {
        setIndicatorname((prevNames) =>
            prevNames.map((item) => (item.id === id ? { ...item, name: newName } : item))
        );
    };

    const handleSubmit = async () => {
        try {
            const updateNamesPromises = indicatorname.map(({ id, name }) =>
                fetch(`https://transgaz.soniciot.com/api/indicators/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                })
            );
            await Promise.all(updateNamesPromises);

            const reverseResponse = await fetch(
                `https://transgaz.soniciot.com/api/reverse-indicator/${serialNumber}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isReversed }),
                }
            );
            await reverseResponse.json();

            // Save thresholds to the backend using DI1, DI2, etc.
            await fetch(`https://transgaz.soniciot.com/api/thresholds/${serialNumber}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(thresholds),
            });

            if (onUpdate) {
                onUpdate({
                    updatedIndicatornames: indicatorname,
                    updatedReversestate: isReversed,
                    updatedThresholds: thresholds, // Pass thresholds back to IndicatorApp
                });
            }
            navigation.goBack();
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.container}>
                <Image
                    style={styles.logo}
                    source={require('../Assets/boreal.png')}
                    resizeMode="contain"
                />
                <Text style={styles.pageTitle}>Settings</Text>

                {/* Indicator Names Section */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>INDICATOR NAMES</Text>
                    <View style={styles.indicatorList}>
                        {indicatorname.map(({ id, name }, index) => (
                            <View key={id} style={styles.indicatorWrapper}>
                                {isEditingNames ? (
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
                    <View style={styles.buttonRow}>
                        {!isEditingNames ? (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditingNames(true)}
                            >
                                <Text style={styles.buttonText}>Edit</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditingNames(false)}
                            >
                                <Text style={styles.buttonText}>Save</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Thresholds Section */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>INDICATOR THRESHOLDS</Text>
                    <View style={styles.indicatorList}>
                        {indicatorname.map(({ id, name }, index) => {
                            const diKey = `DI${index + 1}`; // Use DI1, DI2, etc.
                            return (
                                <View key={id} style={styles.indicatorWrapper}>
                                    <Text style={styles.indicatorName}>{name}</Text>
                                    {isEditingThresholds ? (
                                        <TextInput
                                            style={styles.textInput}
                                            keyboardType="numeric"
                                            placeholder="Threshold"
                                            value={thresholds[diKey]?.toString() || ""}
                                            onChangeText={(value) => handleThresholdChange(diKey, value)}
                                        />
                                    ) : (
                                        <Text style={styles.thresholdValue}>
                                            Threshold: {thresholds[diKey] || 'Not Set'}
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.buttonRow}>
                        {!isEditingThresholds ? (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditingThresholds(true)}
                            >
                                <Text style={styles.buttonText}>Edit</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setIsEditingThresholds(false)}
                            >
                                <Text style={styles.buttonText}>Save</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Reverse Indicator Section */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>REVERSE INDICATOR</Text>
                    <View style={styles.switchRow}>
                        <Switch value={isReversed} onValueChange={setIsReversed} />
                        <Text style={styles.switchLabel}>{isReversed ? 'Enabled' : 'Disabled'}</Text>
                    </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.buttonText}>Submit</Text>
                </TouchableOpacity>
                <Text style={styles.subTextdown}>Powered by SONIC</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212', // Dark background
        alignItems: 'center',
        padding: 20,
    },
    logo: {
        position: 'absolute',
        width: '45%',
        height: '5%',
        resizeMode: 'contain',
        opacity: 0.8,
        left: 10,
        top: 10,
    },
    subTextdown: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginBottom: 10,
        marginTop: 10,
    },
    pageTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginVertical: 20,
        marginTop: '15%',
    },
    scrollContainer: {
        flexGrow: 1, // Makes sure content can expand within ScrollView
    },
    card: {
        width: '100%',
        backgroundColor: '#1f1f1f', // Card background for sections
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 5,
    },
    sectionTitle: {
        fontSize: 20,
        color: '#fff',
        marginBottom: 15,
        fontWeight: '500',
    },
    indicatorList: {
        marginBottom: 20,
    },
    indicatorWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#444',
        paddingBottom: 10,
    },
    indicatorName: {
        fontSize: 15,
        color: '#fff',
        flex: 1,
    },
    textInput: {
        width: '40%',
        backgroundColor: '#333',
        padding: 10,
        color: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#888',
    },
    thresholdValue: {
        fontSize: 16,
        color: '#bbb',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
    },
    actionButton: {
        backgroundColor: '#3d3b3b', // Button background
        paddingVertical: 12,
        paddingHorizontal: 40,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
        marginHorizontal: 10,
    },
    submitButton: {
        backgroundColor: '#3d3b3b', // Submit button background
        paddingVertical: 15,
        paddingHorizontal: 50,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        marginTop: 30,
        elevation: 5,
    },
    buttonText: {
        fontSize: 16,
        color: '#fff',
        textAlign: 'center',
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    switchLabel: {
        fontSize: 16,
        color: '#bbb',
    },
});