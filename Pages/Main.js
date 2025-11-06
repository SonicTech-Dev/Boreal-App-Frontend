import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Animated, StyleSheet, TouchableOpacity, Text, SafeAreaView, Image, FlatList, TextInput, ActivityIndicator } from 'react-native';
const { io } = require("socket.io-client");
import Icon from 'react-native-vector-icons/Ionicons';
import SignalDisplay from '../Components/signalDisplay';


const IndicatorApp = ({ route, navigation }) => {
    const [tableData, setTableData] = useState([]);
    const [alarmData, setAlarmData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [indicatorColors, setIndicatorColors] = useState({});
    const [connectionState, setConnectionState] = useState({ color: '#ff2323', serialNo: null });
    const [isReversed, setIsReversed] = useState(false);
    const [indicatorname, setIndicatorname] = useState(['DI1', 'DI2', 'DI3', 'DI4']);
    const [currentView, setCurrentView] = useState('live');
    const iconNames = ['DI1', 'DI2', 'DI3', 'DI4']
    const flatListRef = useRef(null);
    const serialNumber = route.params?.serialNumber;
    const [activeButton, setActiveButton] = useState('live')
    const [isCleared, setIsCleared] = useState(false);
    const [thresholds, setThresholds] = useState({
        DI1: 100, 
        DI3: 1, 
        DI4: 5000, 
    });

    const handlePressIn = (buttonName) => {
        setActiveButton(buttonName);
    };
    const getScaleValue = (buttonName) => {
        return activeButton === buttonName ? 1.2 : 1;
    };
    const handleButtonPress = (buttonName) => {
        setCurrentView(buttonName);
        setActiveButton(buttonName); // Set the button as active when clicked
    };

    const clearTableData = () => {
        if (currentView === 'live') {
            setTableData([]);
            setIsCleared(true); // Mark as cleared for live data
        } else if (currentView === 'alarms') {
            setAlarmData([]);
        }
    };

    // Add refs for thresholds and indicatorColors
    const thresholdsRef = useRef(thresholds);
    const indicatorColorsRef = useRef(indicatorColors);

    // Update refs whenever these values change
    useEffect(() => {
        thresholdsRef.current = thresholds;
    }, [thresholds]);

    useEffect(() => {
        indicatorColorsRef.current = indicatorColors;
    }, [indicatorColors]);

    //check device online using ping mechanism

    useEffect(() => {
        let pingInterval = null;
    
        const checkDeviceStatus = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/ping/${serialNumber}`);
                if (response.ok) {
                    // If the ping is successful, mark the device as online
                    setConnectionState({ color: '#16b800', serialNo: serialNumber });
                } else {
                    // If the ping fails, mark the device as offline
                    setConnectionState({ color: '#ff2323', serialNo: serialNumber });
                }
            } catch (error) {
                // Handle network or other errors
                setConnectionState({ color: '#ff2323', serialNo: serialNumber });
            }
        };
    
        // Start the periodic ping
        pingInterval = setInterval(checkDeviceStatus, 15000); // Ping every 10 seconds
    
        // Perform an initial ping immediately
        checkDeviceStatus();
    
        return () => {
            // Clear the interval on component unmount
            clearInterval(pingInterval);
        };
    }, [serialNumber]);

    useEffect(() => {
        const socket = io("https://transgaz.soniciot.com", {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 20000,
        });
    
        let lastMessageTimestamp = null;
        let connectionCheckInterval = null;

    
        socket.on('connect', () => {
            console.log('WebSocket connected');
        });
    
        socket.on("connect_error", (err) => {
            console.error("Connection error:", err);
        });
    
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
    
        socket.on("reconnect_attempt", () => {
            console.log('Attempting to reconnect...');
        });
    
        socket.on("reconnect", () => {
            console.log('Reconnected successfully');
        });
    
        socket.on("reconnect_failed", () => {
            console.error('Reconnection failed');
        });
    
        socket.on("bivicomdata", (data) => {
            try {
                data = JSON.parse(data);
    
                if (data.serialNumber === serialNumber) {
                    lastMessageTimestamp = Date.now();
    
                    const valueA = data.A;
                    const valueB = data.B;
                    const valueC = data.C;
                    const valueD = data.D;
    
                    console.log(valueA, valueB, valueC, valueD);
    
                    const timestamp = new Date().toLocaleString();
    
                    const newData = [
                        { TIMESTAMP: timestamp, INPUT: 'DI1', MESSAGE: valueA },
                        { TIMESTAMP: timestamp, INPUT: 'DI2', MESSAGE: valueB },
                        { TIMESTAMP: timestamp, INPUT: 'DI3', MESSAGE: valueC },
                        { TIMESTAMP: timestamp, INPUT: 'DI4', MESSAGE: valueD },
                    ];
    
                    setTableData((prevTableData) => [...prevTableData, ...newData]);
    
                    const updatedColors = { ...indicatorColors };
                    const newAlarmData = [];
    
                    if (valueA > thresholdsRef.current.DI1) {
                        updatedColors['DI1'] = '#b10303';
                        newAlarmData.push({ TIMESTAMP: timestamp, INPUT: 'DI1', MESSAGE: valueA });
                    } else {
                        updatedColors['DI1'] = '#16b800';
                    }
    
                    if (valueB > thresholdsRef.current.DI2) {
                        updatedColors['DI2'] = '#b10303';
                        newAlarmData.push({ TIMESTAMP: timestamp, INPUT: 'DI2', MESSAGE: valueB });
                    } else {
                        updatedColors['DI2'] = '#16b800';
                    }
    
                    if (valueC > thresholdsRef.current.DI3) {
                        updatedColors['DI3'] = '#b10303';
                        newAlarmData.push({ TIMESTAMP: timestamp, INPUT: 'DI3', MESSAGE: valueC });
                    } else {
                        updatedColors['DI3'] = '#16b800';
                    }
    
                    if (valueD > thresholdsRef.current.DI4) {
                        updatedColors['DI4'] = '#b10303';
                        newAlarmData.push({ TIMESTAMP: timestamp, INPUT: 'DI4', MESSAGE: valueD });
                    } else {
                        updatedColors['DI4'] = '#16b800';
                    }
    
                    setAlarmData((prevAlarmData) => [...prevAlarmData, ...newAlarmData]);
                    setIndicatorColors(updatedColors);

                    // Save updated colors to the backend
                    ['DI1', 'DI2', 'DI3', 'DI4'].forEach((indicator) => {
                        const newColor = updatedColors[indicator];
                        fetch('https://transgaz.soniciot.com/api/indicatoricons/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                serial_number: serialNumber,
                                indicator,
                                color: newColor,
                            }),
                        }).catch((error) => console.error(`Error saving color for ${indicator}:`, error));
                    });
                }
            } catch (err) {
                console.error("Socket data parsing error:", err);
            }
        });
    
        const interval = setInterval(() => {
            socket.emit("ping");
        }, 15000);
    
    
        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, [serialNumber, thresholds, indicatorColors]);
    

    // Fetch thresholds on mount
    useEffect(() => {
        const fetchThresholds = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/thresholds/${serialNumber}`);
                const data = await response.json();
                setThresholds(data);
            } catch (error) {
                console.error('Error fetching thresholds:', error);
            }
        };
        fetchThresholds();
    }, [serialNumber]);


    //initialize new indicators name if there is no name
    useEffect(() => {
        const initializeIndicators = async () => {
            try {
                await fetch('https://transgaz.soniciot.com/api/initialize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ serial_number: serialNumber }),
                });
            } catch (error) {
                console.error('Error initializing indicators:', error);
            }
        };

        if (serialNumber) {
            initializeIndicators();
        }
    }, [serialNumber]); // Run this when the serial number changes


    // Fetch Indicator Names from Backend
    useEffect(() => {
        const fetchIndicators = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/indicators/${serialNumber}`);
                const data = await response.json();
                console.log(data)
                setIndicatorname(data); // Set the fetched indicator names to state
            } catch (error) {
                console.error('Error fetching indicators:', error);
            }
        };

        if (serialNumber) {
            fetchIndicators();
        }
    }, [serialNumber]); // Fetch indicators whenever the serial number changes

    useEffect(() => {
        const fetchIndicatorColors = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/indicatoricons/${serialNumber}`);
                const data = await response.json();

                // Map the colors from the response
                const colors = {};
                data.forEach(indicator => {
                    colors[indicator.indicator] = indicator.color;
                });

                setIndicatorColors(colors);
            } catch (error) {
                console.error('Error fetching indicator colors:', error);
            }
        };

        if (serialNumber) {
            fetchIndicatorColors();
        }
    }, [serialNumber]);


    useEffect(() => {
        const fetchReverseIndicator = async () => {
            try {
                const response = await fetch(`https://transgaz.soniciot.com/api/reverse-indicator/${serialNumber}`);
                const data = await response.json();
                setIsReversed(data.isReversed);
            } catch (error) {
                console.error('Error fetching reverse indicator:', error);
            }
        };

        fetchReverseIndicator();
    }, [serialNumber]);

    const getIndicatorColor = useCallback(
        (index) => {
            // If the device is offline, return gray for all indicators
            if (connectionState.color !== '#16b800') {
                return 'grey';
            }
    
            // Otherwise, get the color from the indicatorColors state
            const color = indicatorColors[index] || 'grey';
            if (isReversed) {
                return color === '#16b800' ? '#b10303' : color === '#b10303' ? '#16b800' : color;
            }
            return color;
        },
        [indicatorColors, isReversed, connectionState.color]
    );

    const renderRow = useCallback(({ item }) => {
        // Map the INPUT value (DI1, DI2, etc.) to the corresponding indicator name
        const indicatorIndex = parseInt(item.INPUT.replace('DI', ''), 10) - 1; // Extract the number from "DI1", "DI2", etc.
        const indicatorDisplayName = indicatorname[indicatorIndex]?.name || item.INPUT; // Use the indicator name or fallback to INPUT

        // Determine the alarm status
        //const alarmStatus = item.VALUE === '1' ? 'Alarm ON' : 'Alarm OFF';
        return (
            <View style={styles.row}>
                <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
                <Text style={[styles.cell, styles.dataCell]}>{indicatorDisplayName}</Text>
                <Text style={[styles.cell, styles.statusCell]}>{item.MESSAGE}</Text>
            </View>
        );
    }, [indicatorname]);


    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="white" />
                <Text style={styles.loadingtext}>Loading data...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>{error}</Text>
            </View>
        );
    }

    const boxStyle = {
        ...styles.box,
        height: currentView === 'logs' ? '40%' : '43%',
        marginTop: currentView === 'logs' ? 30 : 10
    };
    const handleNextPage = () => {
        // Navigate to the settings page
        navigation.navigate('Settings', {
            serialNumber,
            indicatorNames: indicatorname,
            reverseState: isReversed,
            onUpdate: ({ updatedIndicatornames, updatedReversestate, updatedThresholds }) => {
                if (updatedIndicatornames) {
                    setIndicatorname(updatedIndicatornames); // Update indicator names dynamically
                }
                if (updatedReversestate !== undefined) {
                    setIsReversed(updatedReversestate); // Update reverse state dynamically
                }
                if (updatedThresholds) {
                    setThresholds(updatedThresholds); // Update thresholds dynamically
                }
            },
        });
    };




    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.first}>
                
                    <Image 
                    style={styles.logo} 
                    source={require('../assets/logos.png')} // Change this to your image path
                    resizeMode="contain"
                    />
                    <Icon style={styles.settings} name="settings-outline" size={30} color="gray" onPress={handleNextPage} />
            </View>
            <Text style={[styles.statusText, { color: connectionState.color }]}>
                {connectionState.color === '#16b800' ? 'ONLINE' : 'OFFLINE'}
            </Text>
            <View style={styles.intro}>
                <View style={styles.serialbox}>
                    <Text style={styles.serialno}>{connectionState.serialNo || serialNumber}</Text>
                </View>
                <View style={styles.statusContainer}>
                    {/* Render SignalDisplay only if the device is online */}
                    {connectionState.color === '#16b800' && <SignalDisplay serialNo={serialNumber} />}
                </View>
            </View>

            <View style={styles.indicatorContainer}>
                {/* Row for the icons */}
                <View style={styles.indicatorRow}>
                    {iconNames.map((name, index) => (
                        <View key={index} style={styles.indicatorWrapper}>
                            {/* Outer Bezel */}
                            <View style={styles.outerBezel}>
                                {/* Reflection Effect */}
                                <View style={styles.reflection} />

                                {/* Outer Ring */}
                                <View style={styles.outerRing}>
                                    {/* Inner Glow */}
                                    <View
                                        style={[
                                            styles.innerGlow,
                                            { backgroundColor: getIndicatorColor(name) || 'grey' },
                                        ]}
                                    />

                                    {/* Main Indicator */}
                                    <View
                                        style={[
                                            styles.indicator,
                                            { backgroundColor: getIndicatorColor(name) || 'grey' },
                                        ]}
                                    />
                                </View>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Row for the indicator names */}
                <View style={styles.indicatornameRow}>
                    {indicatorname.map((indicator) => (
                        <View key={indicator.id} style={styles.indicatorWrapper}>
                            <Text style={styles.label}>{indicator.name}</Text>
                        </View>
                    ))}
                </View>

                {/* Row for the labels (PPM, LEL%, mA) aligned with the icons */}
                <View style={styles.indicatorLabelRow}>
                    <View style={styles.indicatorWrapper}>
                        <Text style={styles.label}>PPM</Text>
                    </View>
                    <View style={styles.indicatorWrapper}>
                        <Text style={styles.label}>PPM</Text>
                    </View>
                    <View style={styles.indicatorWrapper}>
                        <Text style={styles.label}>LEL%</Text>
                    </View>
                    <View style={styles.indicatorWrapper}>
                        <Text style={styles.label}>mA</Text>
                    </View>
                </View>
            </View>
            <View style={styles.switchbuttons}>
                <Animated.View style={{ transform: [{ scale: getScaleValue('live') }] }}>
                    <TouchableOpacity
                        onPressIn={() => handlePressIn('live')}
                        onPress={() => handleButtonPress('live')}
                    >
                        <Text style={styles.logs}>Live</Text>
                    </TouchableOpacity>
                </Animated.View>

                <Animated.View style={{ transform: [{ scale: getScaleValue('alarms') }] }}>
                    <TouchableOpacity
                        onPressIn={() => handlePressIn('alarms')}
                        onPress={() => handleButtonPress('alarms')}
                    >
                        <Text style={styles.logs}>Alarms</Text>
                    </TouchableOpacity>
                </Animated.View>
                    <TouchableOpacity style={styles.clearbutton}
                        onPress={clearTableData}
                    >
                        <Text style={styles.cleartext}>Clear</Text>
                    </TouchableOpacity>
            </View>

            <View style={boxStyle}>

                {currentView === 'live' && (
                    <>
                        <View style={styles.header}>
                            <Text style={[styles.heading, styles.dateHead]}>DATE & TIME</Text>
                            <Text style={[styles.heading, styles.dataCell]}>ALARM</Text>
                            <Text style={[styles.heading, styles.statusHead]}>STATUS</Text>
                        </View>

                        <FlatList
                            ref={flatListRef}
                            style={styles.tablebox}
                            data={currentView === 'live' ? tableData : alarmData}
                            renderItem={renderRow}
                            keyExtractor={(item, index) => `${index}-${item.TIMESTAMP}`}
                            contentContainerStyle={styles.body}
                            ListEmptyComponent={() => (
                                <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                                    No data to display
                                </Text>
                            )}
                            initialNumToRender={10}
                            windowSize={5}
                            removeClippedSubviews={false} // Disable to check if this resolves the issue
                        />
                    </>
                )}

                {currentView === 'alarms' && (
                    <>
                        <View style={styles.header}>
                            <Text style={[styles.heading, styles.dateHead]}>DATE & TIME</Text>
                            <Text style={[styles.heading, styles.dataCell]}>ALARM</Text>
                            <Text style={[styles.heading, styles.statusHead]}>STATUS</Text>
                        </View>

                        <FlatList
                            ref={flatListRef}
                            style={styles.tablebox}
                            data={currentView === 'live' ? tableData : alarmData}
                            renderItem={renderRow}
                            keyExtractor={(item, index) => `${index}-${item.TIMESTAMP}`}
                            contentContainerStyle={styles.body}
                            ListEmptyComponent={() => (
                                <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                                    No data to display
                                </Text>
                            )}
                            initialNumToRender={10}
                            windowSize={5}
                            removeClippedSubviews={false} // Disable to check if this resolves the issue
                        />
                    </>
                )}
            </View>
                <Text style={styles.subTextdown}>Powered by SONIC</Text>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#181818',
        padding: 20,
    },
    logo: {
        width: 200,
        height: 70,
        resizeMode: 'contain',
        opacity : 0.8,
    },
    loadingtext: {
        color: 'white'
    },
    subTextdown: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginTop: '1%'  
    },
    first: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    intro: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 50
    },
    serialbox: {
        width: 200, // Adjust width as per your design
        height: 50, // Adjust height for a small display
        marginTop: '8%',
        backgroundColor: '#000', // Display background color
        borderRadius: 10, // Rounded corners
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2, // Border width for a metallic finish
        borderColor: '#888', // Border color
        shadowColor: '#000', // Shadow for depth
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.7,
        shadowRadius: 10,
        elevation: 5, // Elevation for Android
    },
    serialno: {
        fontSize: 18, // Font size for the serial number
        fontWeight: 'bold',
        color: '#fff', // White text color
        textShadowColor: '#16b800', // Green shadow for a glowing effect
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 10, // Create a glowing effect
    },
    statusText: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 5,
        position: 'absolute',
        marginTop: '23%',
        right: '10%',
    },
    statusContainer: {
        alignItems: 'center',
        marginTop: '8%'
    },
    top: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        width: '100%',
        padding: 10,
    },
    editbutton: {
        backgroundColor: '#7da9ff',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 15,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    reverseButton: {
        backgroundColor: '#7da9ff',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5, shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    clearbutton: {
        position: 'absolute',
        right: 0
    },
    cleartext: {
        backgroundColor: '#222',
        width: 70,
        height: 35,
        borderRadius: 5,
        paddingVertical: 10,
        paddingHorizontal: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5, shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
        fontWeight: 'bold',
        color: 'white'
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    indicatorContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicatorRow: {
        flexDirection: 'row',
    },
    indicatornameRow: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    indicatorLabelRow: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    indicatorWrapper: {
        marginHorizontal: '3%',
        alignItems: 'center', 
        width: 70, 
    },
    label: {
        marginTop: 5,
        fontSize: 13,
        color: 'white',
        fontWeight: 'bold',
        width: '100%', 
        textAlign: 'center',
    },
    textInput: {
        borderBottomWidth: 1,
        borderColor: '#000',
        textAlign: 'center',
        fontSize: 14,
        width: 50,
        color: '#000',
    },
    switchbuttons: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '100%'
    },
    logs: {
        backgroundColor: 'gray',
        width: 80,
        height: 40,
        borderRadius: 5,
        paddingVertical: 10,
        paddingHorizontal: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5, shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
        fontWeight: 'bold'
    },
    box: {
        width: '100%',
        alignItems: 'center',
        backgroundColor: '#353535',
        borderRadius: 10,

    },
    header: {
        flexDirection: 'row',
        backgroundColor: '#282828',
        paddingVertical: 10,
        borderRadius: 5,
        marginTop: 5,
        width: '98%'
    },
    tablebox: {
        width: '98%',
        backgroundColor: '#282828',
        borderRadius: 5,
        marginTop: 5,
        marginBottom: 5
    },
    body: {
        marginTop: 10,
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        paddingVertical: 10,
        marginBottom: 5,
        color: 'ffff'

    },
    heading: {
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 10
    },
    statusHead: {
        flex: 2,
    },
    dateHead: {
        flex: 5,
        textAlign: 'left',
        paddingHorizontal: 10,
        color: 'white',
    },
    si: {
        width: '15%',
        textAlign: 'left',
        color: 'white',
    },
    dt: {
        width: '15%',
        textAlign: 'left',
        marginRight : '10%',
        color: 'white',
    },
    al: {
        width: '25%',
        textAlign: 'left',
        color: 'white',
    },
    st: {
        width: '30%',
        textAlign: 'left',
        color: 'white',
        marginRight : '10%'
    },
    cell: {
        textAlign: 'center',
        fontSize: 12,
        color: 'white',
        marginRight: 10
    },
    celll: {
        textAlign: 'center',
        fontSize: 12,
        color: 'white',
    },
    col1: {
        width: '15%'
    },
    col2: {
        width: '30%'
    },
    col3: {
        width: '20%'
    },
    col4: {
        marginLeft : '5%',
        width: '30%'
    },
    dateCell: {
        flex: 3,
        textAlign: 'left',
        paddingHorizontal: 10,
        color: 'white',
        marginLeft : 10
    },
    dataCell: {
        flex: 2,
    },
    statusCell: {
        flex: 1,
    },
    outerBezel: {
        width: 55,
        height: 55,
        borderRadius: 27.5,
        backgroundColor: '#444', // Bezel background
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#666', // Metallic bezel
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.7,
        shadowRadius: 6,
    },
    reflection: {
        position: 'absolute',
        top: 4,
        left: 5,
        width: 42,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(255, 255, 255, 0.3)', // Subtle reflection
    },
    outerRing: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 3,
        borderColor: '#999', // Metallic outer ring
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#444', // Inner ring background
    },
    innerGlow: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        opacity: 0.5,
    },
    indicator: {
        width: 30,
        height: 30,
        borderRadius: 15,
        elevation: 3,
    },


});

export default IndicatorApp;
