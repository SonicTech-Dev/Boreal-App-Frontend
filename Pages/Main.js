import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Image, FlatList, ActivityIndicator, Platform } from 'react-native';
const { io } = require("socket.io-client");
import Icon from 'react-native-vector-icons/Ionicons';

const IndicatorApp = ({ route, navigation }) => {
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // color indicates device ping status (green/red)
    const [connectionState, setConnectionState] = useState({ color: '#ff2323', serialNo: null });
    const [currentView, setCurrentView] = useState('live'); // 'live' | 'alarms'
    const flatListRef = useRef(null);
    const serialNumber = route.params?.serialNumber;
    const hostOverride = route.params?.host; // optional: allow overriding host from navigation params
    const [activeButton, setActiveButton] = useState('live');
    const [isCleared, setIsCleared] = useState(false);

    // The big indicator will reflect the most recent PPM (LOS) reading
    const [indicatorColor, setIndicatorColor] = useState('#16b800');
    const [losReading, setLosReading] = useState(null); // Current Los Value shown in big indicator
    const [threshold, setThreshold] = useState(null); // numeric threshold for los_ppm

    const indicatorBigLabel = 'Gas Finder-PPM'; // Big indicator label (PPM)

    const handlePressIn = (buttonName) => setActiveButton(buttonName);
    const getScaleValue = (buttonName) => (activeButton === buttonName ? 1.05 : 1);

    const handleButtonPress = (buttonName) => {
        setCurrentView(buttonName);
        setActiveButton(buttonName);
    };

    const clearTableData = () => {
        setTableData([]);
        setIsCleared(true);
        setTimeout(() => setIsCleared(false), 200);
    };

    // Helper - decide host to use based on platform/emulator (optional)
    const pickHost = () => {
        if (hostOverride) return hostOverride;
        const defaultHost = '192.168.0.173';
        if (Platform.OS === 'android') {
            // For Android emulator you'd use 10.0.2.2 (AVD) or 10.0.3.2 (Genymotion).
            // For a physical device, ensure the device and dev machine are on same LAN and use the machine LAN IP.
            return defaultHost;
        }
        return defaultHost;
    };

    // Ping device to check status (improved logging + http fallback)
    useEffect(() => {
        let pingInterval = null;
        const host = pickHost();
        const pingPath = (protocol) => `${protocol}://${host}:3004/api/ping/${serialNumber}`;

        const checkDeviceStatus = async () => {
            if (!serialNumber) {
                console.warn('No serialNumber provided to IndicatorApp ping effect');
                setConnectionState({ color: '#ff2323', serialNo: serialNumber });
                return;
            }

            try {
                const url = pingPath('https');
                const response = await fetch(url, { method: 'GET' });
                if (response.ok) {
                    setConnectionState({ color: '#16b800', serialNo: serialNumber });
                    return;
                } else {
                    setConnectionState({ color: '#ff2323', serialNo: serialNumber });
                    return;
                }
            } catch (err) {
                try {
                    const urlHttp = pingPath('http');
                    const resp2 = await fetch(urlHttp, { method: 'GET' });
                    if (resp2.ok) {
                        setConnectionState({ color: '#16b800', serialNo: serialNumber });
                        return;
                    } else {
                        setConnectionState({ color: '#ff2323', serialNo: serialNumber });
                        return;
                    }
                } catch (err2) {
                    setConnectionState({ color: '#ff2323', serialNo: serialNumber });
                    return;
                }
            }
        };

        checkDeviceStatus();
        pingInterval = setInterval(checkDeviceStatus, 15000);
        return () => {
            if (pingInterval) clearInterval(pingInterval);
        };
    }, [serialNumber, route.params?.host]);

    // Normalize incoming param keys and produce display name + formatted value
    const formatIndicator = (key, rawValue) => {
        const degree = '\u00B0';
        const originalKey = String(key);
        const keyNorm = originalKey.toLowerCase().replace(/[\s\-_()]/g, '');

        // coerce numeric values when possible
        const num = (typeof rawValue === 'number') ? rawValue : (rawValue !== null && rawValue !== undefined ? Number(rawValue) : NaN);
        const isNumber = !Number.isNaN(num);

        // PPM variants -> Gas Finder-PPM
        if (keyNorm.includes('los') && keyNorm.includes('ppm') || keyNorm.includes('losppm') || keyNorm === 'ppm' || keyNorm.includes('ppmvalue')) {
            const displayName = 'Gas Finder-PPM';
            const value = isNumber ? Math.round(num) : rawValue;
            return { displayName, value };
        }

        // Temperature
        if (keyNorm.includes('temp') || keyNorm.includes('temperature') || keyNorm.includes('℃') || keyNorm.includes('celsius')) {
            const displayName = `Temp(${degree}C)`;
            const value = isNumber ? `${num.toFixed(1)}${degree}C` : rawValue;
            return { displayName, value };
        }

        // RX-light variants
        if (keyNorm.includes('rx') && (keyNorm.includes('light') || keyNorm.includes('led') || keyNorm === 'rx')) {
            const displayName = 'RX-light';
            const value = isNumber ? num : rawValue;
            return { displayName, value };
        }

        // R2
        if (keyNorm === 'r2' || keyNorm.includes('r2')) {
            const displayName = 'R2';
            const value = isNumber ? num : rawValue;
            return { displayName, value };
        }

        // HeartBeat variants
        if (keyNorm.includes('heartbeat') || keyNorm.includes('heart') || keyNorm.includes('hb')) {
            const displayName = 'HeartBeat';
            const value = isNumber ? Math.round(num) : rawValue;
            return { displayName, value };
        }

        // Fallback: present a cleaned title (remove los if present)
        let cleaned = originalKey.replace(/los/ig, '').replace(/[_\-]/g, ' ').trim();
        if (!cleaned) cleaned = originalKey;
        // Title case fallback
        const displayName = cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const value = isNumber ? (Number.isInteger(num) ? num : Number(num.toFixed(2))) : rawValue;
        return { displayName, value };
    };

    // WebSocket: receive latest readings (handles multiple params)
    useEffect(() => {
        const host = pickHost();
        // Use http or https depending on your socket server. Set 'http' if running without TLS in dev.
        const protocol = 'http';
        const socketUrl = `${protocol}://${host}:3004`;
        const socket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 20000,
        });

        socket.on('connect', () => console.log('WebSocket connected to', socketUrl));
        socket.on('disconnect', () => console.log('WebSocket disconnected'));
        socket.on("reconnect_attempt", () => console.log('Attempting to reconnect...'));

        socket.on("mqtt_message", (msg) => {
            console.log('Received mqtt_message:', msg);
            // extract params object (supporting payload.params or payload itself)
            let params = null;
            if (msg.payload && typeof msg.payload === 'object') {
                params = (msg.payload.params && typeof msg.payload.params === 'object') ? msg.payload.params : msg.payload;
            } else if (msg.params && typeof msg.params === 'object') {
                params = msg.params;
            }
            if (!params || typeof params !== 'object') return;

            const timestamp = new Date().toLocaleString();
            const newRows = [];

            // iterate all keys from params and map them to display names + formatted values
            Object.entries(params).forEach(([k, v]) => {
                const { displayName, value } = formatIndicator(k, v);
                // push every mapped indicator (including PPM and others)
                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${displayName}`;
                newRows.push({
                    id,
                    TIMESTAMP: timestamp,
                    INDICATOR: displayName,
                    VALUE: value,
                    rawKey: k,
                    rawValue: v
                });

                // If this is the PPM (LOS) reading, update the big indicator and color
                const keyNorm = String(k).toLowerCase();
                if ((keyNorm.includes('los') && keyNorm.includes('ppm')) || keyNorm.includes('ppm') || displayName === 'Gas Finder-PPM') {
                    // prefer numeric if available
                    const numeric = (typeof v === 'number') ? v : Number(v);
                    if (!Number.isNaN(numeric)) {
                        setLosReading(numeric);
                        if (threshold !== null && numeric > threshold) {
                            setIndicatorColor('#b10303');
                        } else {
                            setIndicatorColor('#16b800');
                        }
                    } else {
                        // if not numeric, still set the big indicator raw value as string
                        setLosReading(v);
                    }
                }
            });

            if (newRows.length > 0) {
                // prepend new rows (newest first), and cap the list to last 1000 entries
                setTableData(prev => {
                    const next = [...newRows, ...prev].slice(0, 1000);
                    return next;
                });
                // auto-scroll to top so newest rows are visible (only for live view)
                if (currentView === 'live') {
                    setTimeout(() => {
                        try {
                            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                        } catch (e) {
                            // ignore if scroll fails
                        }
                    }, 50);
                }
            }
        });

        return () => {
            try {
                socket.disconnect();
            } catch (e) {
                console.warn('Error disconnecting socket', e);
            }
        };
    }, [serialNumber, threshold, route.params?.host, currentView]);

    // Fetch threshold from backend. Try /api/thresholds/:serialNumber then fallback to /api/threshold/:serialNumber
    useEffect(() => {
        const fetchThreshold = async () => {
            try {
                const host = pickHost();
                const response = await fetch(`http://${host}:3004/api/thresholds/${serialNumber}`);
                if (response.ok) {
                    const data = await response.json();
                    setThreshold(data.los_ppm ?? null);
                } else {
                    setThreshold(null);
                }
            } catch (error) {
                console.warn('Failed to fetch threshold:', error);
                setThreshold(null);
            }
        };
        fetchThreshold();
    }, [serialNumber, route.params?.host]);

    // Derive alarms list: entries where indicator is Gas Finder-PPM and numeric value > threshold
    const alarms = useMemo(() => {
        if (threshold === null || threshold === undefined) return [];
        return tableData.filter((row) => {
            try {
                const keyNorm = String(row.rawKey || '').toLowerCase();
                const isPPM = row.INDICATOR === 'Gas Finder-PPM' || keyNorm.includes('ppm') || String(row.INDICATOR).toLowerCase().includes('ppm');
                if (!isPPM) return false;
                const numeric = (typeof row.rawValue === 'number') ? row.rawValue : Number(row.rawValue);
                if (Number.isNaN(numeric)) return false;
                return numeric > threshold;
            } catch (e) {
                return false;
            }
        }).slice(0, 1000); // cap
    }, [tableData, threshold]);

    const renderRow = ({ item }) => {
        // color VALUE cell red when above threshold (only meaningful for numeric values)
        let valueStyle = {};
        const rawVal = item.rawValue;
        const numeric = (typeof rawVal === 'number') ? rawVal : Number(rawVal);
        if (threshold !== null && !Number.isNaN(numeric) && numeric > threshold && item.INDICATOR === 'Gas Finder-PPM') {
            valueStyle = { color: '#b10303', fontWeight: '700' };
        }

        return (
            <View style={styles.row}>
                <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
                <Text style={[styles.cell, styles.dataCell]}>{item.INDICATOR}</Text>
                <Text style={[styles.cell, styles.statusCell, valueStyle]}>{String(item.VALUE)}</Text>
            </View>
        );
    };

    const renderAlarmRow = ({ item }) => {
        const rawVal = item.rawValue;
        const numeric = (typeof rawVal === 'number') ? rawVal : Number(rawVal);
        const isAlarm = !Number.isNaN(numeric) && threshold !== null && numeric > threshold;
        const ledColor = isAlarm ? '#b10303' : '#16b800';
        return (
            <View style={styles.row}>
                <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
                <View style={[styles.alarmIndicatorCell]}>
                    <View style={[styles.led, { backgroundColor: ledColor }]} />
                    <Text style={[styles.cell, styles.dataCell, { marginLeft: 8 }]}>{String(item.VALUE)}</Text>
                </View>
            </View>
        );
    };

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

    // Helper to style tab buttons
    const tabStyle = (name) => (activeButton === name ? styles.tabActive : styles.tabInactive);
    const tabTextStyle = (name) => (activeButton === name ? styles.tabTextActive : styles.tabTextInactive);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.first}>
                <Image
                    style={styles.logo}
                    source={require('../Assets/boreal.png')}
                    resizeMode="contain"
                />
                <Icon style={styles.settings} name="settings-outline" size={30} color="gray" onPress={() => navigation.navigate('Settings', { serialNumber })} />
            </View>
            <Text style={[styles.statusText, { color: connectionState.color }]}>
                {connectionState.color === '#16b800' ? 'ONLINE' : 'OFFLINE'}
            </Text>
            <View style={styles.serialbox}>
                <Text style={styles.serialno}>{connectionState.serialNo || serialNumber}</Text>
            </View>

            {/* Big Indicator (PPM) */}
            <View style={styles.singleIndicatorContainer}>
                <View style={[styles.outerBezel]}>
                    <View style={styles.reflection} />
                    <View style={styles.outerRing}>
                        <View
                            style={[
                                styles.innerGlow,
                                { backgroundColor: indicatorColor },
                            ]}
                        />
                        <View
                            style={[
                                styles.indicator,
                                { backgroundColor: indicatorColor },
                            ]}
                        />
                    </View>
                </View>
                <Text style={{ color: 'white', fontSize: 20, marginTop: 10 }}>{indicatorBigLabel}</Text>
                <Text style={{ color: indicatorColor, fontSize: 36, fontWeight: 'bold' }}>
                    {losReading !== null ? (typeof losReading === 'number' ? Math.round(losReading) : String(losReading)) : '-'}
                </Text>
                <Text style={{ color: '#bbb', fontSize: 12, marginTop: 6 }}>
                    {threshold !== null ? `Alarm threshold: ${threshold}` : 'Threshold not set'}
                </Text>
            </View>

            <View style={styles.switchbuttons}>
                <TouchableOpacity
                    style={[styles.logs, tabStyle('live')]}
                    onPressIn={() => handlePressIn('live')}
                    onPress={() => handleButtonPress('live')}
                >
                    <Text style={[styles.buttonText, tabTextStyle('live')]}>Live</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.logs, tabStyle('alarms')]}
                    onPressIn={() => handlePressIn('alarms')}
                    onPress={() => handleButtonPress('alarms')}
                >
                    <Text style={[styles.buttonText, tabTextStyle('alarms')]}>Alarms</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.clearbutton}
                    onPress={clearTableData}
                >
                    <Text style={styles.cleartext}>Clear</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.box}>
                {currentView === 'live' && (
                    <>
                        <View style={styles.header}>
                            <Text style={[styles.heading, styles.dateHead]}>DATE & TIME</Text>
                            <Text style={[styles.heading, styles.dataCell]}>INDICATOR</Text>
                            <Text style={[styles.heading, styles.statusHead]}>VALUE</Text>
                        </View>
                        <FlatList
                            ref={flatListRef}
                            style={styles.tablebox}
                            data={tableData}
                            renderItem={renderRow}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.body}
                            ListEmptyComponent={() => (
                                <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                                    No data to display
                                </Text>
                            )}
                            initialNumToRender={10}
                            windowSize={5}
                            removeClippedSubviews={false}
                        />
                    </>
                )}

                {currentView === 'alarms' && (
                    <>
                        <View style={styles.header}>
                            <Text style={[styles.heading, styles.dateHead]}>DATE & TIME</Text>
                            <Text style={[styles.heading, styles.dataCell]}>PPM VALUE</Text>
                        </View>

                        {threshold === null ? (
                            <View style={{ padding: 20 }}>
                                <Text style={{ color: '#bbb' }}>Threshold not set. Alarms will not be shown until a threshold is configured.</Text>
                            </View>
                        ) : (
                            <FlatList
                                ref={flatListRef}
                                style={styles.tablebox}
                                data={alarms}
                                renderItem={renderAlarmRow}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.body}
                                ListEmptyComponent={() => (
                                    <Text style={{ textAlign: 'center', color: 'gray', marginTop: 20 }}>
                                        No alarms (no PPM readings above threshold)
                                    </Text>
                                )}
                                initialNumToRender={10}
                                windowSize={5}
                                removeClippedSubviews={false}
                            />
                        )}
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
    serialbox: {
        width: 200,
        height: 50,
        marginTop: '8%',
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
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        textShadowColor: '#16b800',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 10,
    },
    statusText: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 5,
        position: 'absolute',
        marginTop: '23%',
        right: '10%',
    },
    singleIndicatorContainer: {
        alignItems: 'center',
        marginVertical: 30,
    },
    outerBezel: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#444',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#666',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.7,
        shadowRadius: 6,
    },
    reflection: {
        position: 'absolute',
        top: 6,
        left: 10,
        width: 62,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    outerRing: {
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 3,
        borderColor: '#999',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#444',
    },
    innerGlow: {
        position: 'absolute',
        width: 62,
        height: 62,
        borderRadius: 31,
        opacity: 0.5,
    },
    indicator: {
        width: 46,
        height: 46,
        borderRadius: 23,
        elevation: 3,
    },
    switchbuttons: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '100%',
        marginBottom: 10,
    },
    logs: {
        backgroundColor: 'gray',
        width: 100,
        height: 40,
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    tabActive: {
        backgroundColor: '#16b800',
    },
    tabInactive: {
        backgroundColor: '#4a4a4a',
    },
    tabTextActive: {
        color: '#000',
        fontWeight: '700',
    },
    tabTextInactive: {
        color: '#fff',
    },
    clearbutton: {
        marginLeft: 15,
        backgroundColor: '#222',
        width: 70,
        height: 35,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cleartext: {
        fontWeight: 'bold',
        color: 'white'
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
        height: '40%',
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
        color: 'ffff',
        alignItems: 'center',
    },
    alarmIndicatorCell: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    led: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: '#111',
        elevation: 2,
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
    cell: {
        textAlign: 'center',
        fontSize: 12,
        color: 'white',
        marginRight: 10
    },
    loadingtext: {
        color: 'white'
    },
    errorText: {
        color: 'red'
    }
});

export default IndicatorApp;