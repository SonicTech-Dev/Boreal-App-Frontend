import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Image,
  FlatList,
  ActivityIndicator,
  Platform,
  ImageBackground,
} from 'react-native';
const { io } = require('socket.io-client');
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

  // The big indicator will reflect the most recent PPM (LOS) reading
  const [indicatorColor, setIndicatorColor] = useState('#16b800');
  const [losReading, setLosReading] = useState(null); // Current Los Value shown in big indicator
  const [threshold, setThreshold] = useState(null); // numeric threshold for los_ppm

  const indicatorBigLabel = 'Gas Finder-PPM'; // Big indicator label (PPM)

  const pickHost = () => {
    if (hostOverride) return hostOverride;
    const defaultHost = '192.168.0.173';
    if (Platform.OS === 'android') {
      return defaultHost;
    }
    return defaultHost;
  };

  // Ping device to check status (simple http ping)
  useEffect(() => {
    let pingInterval = null;
    const host = pickHost();
    const pingPath = (protocol) => `${protocol}://${host}:3004/api/ping/${serialNumber}`;

    const checkDeviceStatus = async () => {
      if (!serialNumber) {
        setConnectionState({ color: '#ff2323', serialNo: serialNumber });
        return;
      }

      try {
        const url = pingPath('http');
        const response = await fetch(url, { method: 'GET' });
        if (response.ok) {
          setConnectionState({ color: '#16b800', serialNo: serialNumber });
          return;
        }
        setConnectionState({ color: '#ff2323', serialNo: serialNumber });
      } catch (err) {
        setConnectionState({ color: '#ff2323', serialNo: serialNumber });
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

    socket.on('mqtt_message', (msg) => {
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
              setIndicatorColor('#25a714ff');
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

  // Fetch threshold from backend (your working snippet)
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
    const rawVal = item.rawValue;
    const numeric = (typeof rawVal === 'number') ? rawVal : Number(rawVal);
    const isPPM = item.INDICATOR === 'Gas Finder-PPM' || String(item.rawKey || '').toLowerCase().includes('ppm');
    const displayValue = isPPM && !Number.isNaN(numeric) ? `${numeric} PPM` : String(item.VALUE);

    let valueStyle = {};
    if (threshold !== null && isPPM && !Number.isNaN(numeric) && numeric > threshold) {
      valueStyle = { color: '#b10303', fontWeight: '700' };
    } else {
      valueStyle = { color: '#fff' };
    }

    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
        <Text style={[styles.cell, styles.dataCell]}>{item.INDICATOR}</Text>
        <Text style={[styles.cell, styles.statusCell, valueStyle]}>{displayValue}</Text>
      </View>
    );
  };

  const renderAlarmRow = ({ item }) => {
    const rawVal = item.rawValue;
    const numeric = (typeof rawVal === 'number') ? rawVal : Number(rawVal);
    const displayValue = !Number.isNaN(numeric) ? `${numeric} PPM` : String(item.VALUE);

    const valueStyle = (threshold !== null && !Number.isNaN(numeric) && numeric > threshold)
      ? { color: '#b10303', fontWeight: '700' }
      : { color: '#fff' };

    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
        <Text style={[styles.cell, styles.dataCell]}>Gas Finder-PPM</Text>
        <Text style={[styles.cell, styles.statusCell, valueStyle]}>{displayValue}</Text>
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
    <ImageBackground source={require('../Assets/bg2.png')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.container}>
        {/* Logo (top-left) */}
        <View style={styles.logoContainer}>
          <Image style={styles.logo} source={require('../Assets/logo.png')} resizeMode="contain" />
        </View>

        {/* Serial number (left) and online/offline (right) in same row */}
        <View style={styles.serialRow}>
          <View style={styles.serialbox}>
            <Text style={styles.serialno}>{connectionState.serialNo || serialNumber || '-'}</Text>
          </View>
          <View style={styles.statusBox}>
            <Text style={[styles.statusText, { color: connectionState.color }]}>
              {connectionState.color === '#156f09ff' ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Big Indicator (PPM) - restored dark design like original */}
        <View style={styles.singleIndicatorContainer}>
          <View style={[styles.outerBezel]}>
            <View style={styles.reflection} />
            <View style={styles.outerRing}>
              <View style={[styles.innerGlow, { backgroundColor: indicatorColor }]} />
              <View style={[styles.indicator, { backgroundColor: indicatorColor }]} />
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

        {/* Tabs and Clear */}
        <View style={styles.switchbuttons}>
          <TouchableOpacity
            style={[styles.logs, tabStyle('live')]}
            onPressIn={() => setActiveButton('live')}
            onPress={() => { setCurrentView('live'); setActiveButton('live'); }}
          >
            <Text style={[styles.buttonText, tabTextStyle('live')]}>Live</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logs, tabStyle('alarms')]}
            onPressIn={() => setActiveButton('alarms')}
            onPress={() => { setCurrentView('alarms'); setActiveButton('alarms'); }}
          >
            <Text style={[styles.buttonText, tabTextStyle('alarms')]}>Alarms</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearbutton}
            onPress={() => setTableData([])}
          >
            <Text style={styles.cleartext}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsIcon} onPress={() => navigation.navigate('Settings', { serialNumber })}>
            <Icon name="settings-outline" size={26} color="#bbb" />
          </TouchableOpacity>
        </View>

        {/* Contained table (fixed size) */}
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
                <Text style={[styles.heading, styles.dataCell]}>ALARM</Text>
                <Text style={[styles.heading, styles.statusHead]}>VALUE</Text>
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
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' ,opacity : 0.7},
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },

  /* logo top-left container */
  logoContainer: {
    position: 'absolute',
    left: 16,
    top: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    padding: 6,
    borderRadius: 8,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  logo: {
    width: 140,
    height: 48,
    resizeMode: 'contain',
  },

  /* serial row: serial (left) and status (right) */
  serialRow: {
    width: '100%',
    marginTop: 80, // leave space for logo
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  serialbox: {
    minWidth: 180,
    height: 46,
    backgroundColor: 'rgba(255,255,255,0.6)',
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
    paddingHorizontal: 10,
  },
  serialno: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: '#16b800',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
  },
  statusBox: {
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
  },

  /* Big indicator (dark style like original) */
  singleIndicatorContainer: {
    alignItems: 'center',
    marginVertical: 24,
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
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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

  /* tabs */
  switchbuttons: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  logs: {
    width: 110,
    height: 40,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  tabActive: {
    backgroundColor: '#92dfb2ff',
  },
  tabInactive: {
    backgroundColor: '#2a4e25ff',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  tabTextInactive: {
    color: '#fff',
  },
  clearbutton: {
    marginLeft: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    width: 70,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleartext: {
    fontWeight: '700',
    color: 'white',
  },
  settingsIcon: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* contained table: fixed width & height, dark themed */
  box: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    marginTop: 6,
  },
  header: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 10,
    borderRadius: 5,
    width: '98%',
    alignItems: 'center',
  },
  tablebox: {
    width: '98%',
    height: '33%', // fixed height for contained table
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 5,
    marginTop: 5,
    marginBottom: 12,
  },
  body: {
    marginTop: 10,
    width: '100%',
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    marginHorizontal: 8,
    marginBottom: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  heading: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 10,
  },
  dateHead: {
    flex: 3,
    textAlign: 'left',
    paddingHorizontal: 10,
    color: 'white',
  },
  dataCell: {
    flex: 2,
    textAlign: 'center',
    color: 'white',
  },
  statusHead: {
    flex: 1,
    textAlign: 'center',
    color: 'white',
  },
  cell: {
    textAlign: 'center',
    fontSize: 12,
    color: 'white',
    marginRight: 10,
  },
  dateCell: {
    flex: 3,
    textAlign: 'left',
    paddingLeft: 10,
    color: 'white',
  },
  dataCell: {
    flex: 2,
    textAlign: 'center',
    color: 'white',
  },
  statusCell: {
    flex: 1,
    textAlign: 'center',
    color: 'white',
  },

  loadingtext: {
    color: 'white',
  },
  errorText: {
    color: 'red',
  },
  subTextdown: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 10,
  },
  buttonText: {
    fontSize: 15,
    color: '#fff',
  },
});

export default IndicatorApp;