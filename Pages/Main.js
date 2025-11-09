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
  const [tableData, setTableData] = useState([]); // will store only PPM rows (newest first)
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

  // Keep refs to avoid stale closures in socket handlers
  const thresholdRef = useRef(null);
  const losReadingRef = useRef(null);

  // Keep a set of cleared fingerprints so we ignore replays of cleared rows
  const clearedSetRef = useRef(new Set());
  // Keep a set of seen fingerprints to avoid duplicates in-session
  const seenSetRef = useRef(new Set());

  // Track whether this screen is focused (visible) so we only read/process messages while mounted/visible
  const isFocusedRef = useRef(false);

  // Skip the first PPM row received after mount / focus / clear.
  // When true the next PPM row encountered will be ignored and then this flag is cleared.
  const skipFirstRef = useRef(true);

  const indicatorBigLabel = 'Gas Finder-PPM'; // Big indicator label (PPM)

  const pickHost = () => {
    if (hostOverride) return hostOverride;
    const defaultHost = 'boreal.soniciot.com';
    if (Platform.OS === 'android') {
      return defaultHost;
    }
    return defaultHost;
  };

  // Helper to format time as hh:mm:ss AM/PM
  const formatTime = (d) => {
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hh = String(hours).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss} ${ampm}`;
  };

  // current time state (hh:mm:ss AM/PM) to show below online/offline indicator
  const [currentTime, setCurrentTime] = useState(formatTime(new Date()));

  // Keep refs up to date
  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);
  useEffect(() => {
    losReadingRef.current = losReading;
  }, [losReading]);

  // update clock every second
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTime(formatTime(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Track screen focus state: set isFocusedRef true only when this screen is focused.
  useEffect(() => {
    // initialize focus state
    try {
      isFocusedRef.current = navigation && typeof navigation.isFocused === 'function' ? navigation.isFocused() : true;
    } catch (e) {
      isFocusedRef.current = true;
    }

    const onFocus = () => {
      isFocusedRef.current = true;
      // When returning to the screen, skip the very first incoming PPM row to avoid showing a retained/previous reading.
      skipFirstRef.current = true;
    };
    const onBlur = () => { isFocusedRef.current = false; };

    const focusUnsub = navigation?.addListener?.('focus', onFocus);
    const blurUnsub = navigation?.addListener?.('blur', onBlur);

    return () => {
      if (typeof focusUnsub === 'function') focusUnsub();
      if (typeof blurUnsub === 'function') blurUnsub();
    };
  }, [navigation]);

  // Simple helper to decide if a key/value pair represents a PPM/LOS reading.
  const isPpmKey = (key) => {
    if (!key) return false;
    const k = String(key).toLowerCase();
    return k.includes('ppm') || (k.includes('los') && k.includes('ppm')) || k === 'ppm' || k.includes('ppmvalue');
  };

  // Format display value for PPM (we store numeric if possible)
  const normalizePpmValue = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  // build a fingerprint string for an incoming row
  // Prefer using any server timestamp included in the message payload (payload.ts or payload.timestamp).
  // Fallback to the reception TIMESTAMP (local) if no server timestamp present.
  const makeFingerprint = (serial, key, value, serverTs, localTs) => {
    const s = serial ?? '';
    const k = String(key ?? '');
    const v = String(value ?? '');
    const ts = serverTs ? String(serverTs) : String(localTs ?? '');
    return `${s}|${k}|${v}|${ts}`;
  };

  // SOCKET: subscribe to MQTT forwarding and device_status events, but only push PPM rows into tableData
  useEffect(() => {
    if (!serialNumber) return undefined;
    const host = pickHost();
    const socketUrl = `https://${host}`;
    const socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected to', socketUrl);
    });
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    // device status events
    const handlePingPayload = (payload) => {
      if (!payload) return;
      const serial = payload.serial_number ?? payload.serialNumber ?? payload.serial ?? payload.sn;
      let online = payload.online ?? payload.isOnline ?? payload.is_online ?? payload.status ?? payload.up;
      if (typeof online === 'string') {
        const s = online.toLowerCase();
        online = s === 'online' || s === 'true' || s === '1';
      } else if (typeof online === 'number') {
        online = online === 1;
      } else {
        online = !!online;
      }
      if (!serial) return;
      if (serial === serialNumber) {
        setConnectionState({ color: online ? '#16b800' : '#ff2323', serialNo: serialNumber });
      }
    };

    socket.on('device_status', handlePingPayload);
    socket.on('device_ping', handlePingPayload);
    socket.on('ping_result', handlePingPayload);
    socket.on('ping', handlePingPayload);

    // snapshot (when server sends current statuses on connect)
    socket.on('device_status_snapshot', (snapshot) => {
      try {
        if (!Array.isArray(snapshot)) return;
        const match = snapshot.find(s => s.serial_number === serialNumber);
        if (match) handlePingPayload(match);
      } catch (e) {
        // ignore
      }
    });

    // Only handle PPM entries for the live table and big indicator
    socket.on('mqtt_message', (msg) => {
      // Only process incoming MQTT messages while this screen is focused/mounted.
      // This prevents old/retained messages from populating the table when user isn't viewing the page.
      if (!isFocusedRef.current) {
        // Skip processing when the page is not focused
        return;
      }

      // msg.payload OR msg.params may contain readings
      let params = null;
      if (msg.payload && typeof msg.payload === 'object') {
        params = (msg.payload.params && typeof msg.payload.params === 'object') ? msg.payload.params : msg.payload;
      } else if (msg.params && typeof msg.params === 'object') {
        params = msg.params;
      }
      if (!params || typeof params !== 'object') return;

      // Optionally filter by serial_number in msg if provided
      const msgSerial = msg.serial_number ?? (msg.payload && (msg.payload.serial_number || msg.payload.serial)) ?? undefined;
      if (msgSerial && serialNumber && String(msgSerial) !== String(serialNumber)) {
        // message for another device — ignore
        return;
      }

      // prefer server-provided timestamp inside payload if present
      const serverTsCandidate = (msg.payload && (msg.payload.ts || msg.payload.timestamp)) || msg.ts || msg.timestamp || '';

      const localTimestamp = new Date().toLocaleString();
      const newPpmRows = [];

      // iterate params and only keep ppm entries
      Object.entries(params).forEach(([k, v]) => {
        if (!isPpmKey(k)) return;
        // If skipFirstRef is true, skip the very first PPM entry encountered and clear the flag.
        if (skipFirstRef.current) {
          skipFirstRef.current = false;
          // do not mark as seen, do not add to rows
          return;
        }

        const numeric = normalizePpmValue(v);
        const displayVal = numeric !== null ? numeric : v;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-ppm`;

        // build fingerprint: prefer server timestamp to protect against retained/replayed messages
        const fp = makeFingerprint(msgSerial ?? serialNumber, k, v, serverTsCandidate, localTimestamp);

        // if this fingerprint was previously cleared, ignore it
        if (clearedSetRef.current.has(fp)) {
          return;
        }
        // if we've already seen this fingerprint in-session, skip duplicates
        if (seenSetRef.current.has(fp)) {
          return;
        }
        // mark as seen
        seenSetRef.current.add(fp);

        newPpmRows.push({
          id,
          TIMESTAMP: localTimestamp,
          INDICATOR: 'Gas Finder-PPM',
          VALUE: displayVal,
          rawKey: k,
          rawValue: v,
          _fingerprint: fp,
        });

        // update big indicator
        if (numeric !== null) {
          setLosReading(numeric);
          const currentThreshold = thresholdRef.current;
          const t = Number.isFinite(Number(currentThreshold)) ? Number(currentThreshold) : null;
          setIndicatorColor(t !== null && numeric > t ? '#b10303' : '#16b800');
        } else {
          setLosReading(v);
        }
      });

      if (newPpmRows.length > 0) {
        setTableData(prev => {
          const next = [...newPpmRows, ...prev].slice(0, 1000);
          return next;
        });

        if (currentView === 'live') {
          setTimeout(() => {
            try { flatListRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch (e) { /* ignore */ }
          }, 50);
        }
      }
    });

    return () => {
      try {
        socket.off('device_status', handlePingPayload);
        socket.off('device_ping', handlePingPayload);
        socket.off('ping_result', handlePingPayload);
        socket.off('ping', handlePingPayload);
        socket.off('device_status_snapshot');
        socket.off('mqtt_message');
        socket.disconnect();
      } catch (e) {
        // ignore
      }
    };
  }, [serialNumber, route.params?.host, currentView, navigation]);

  // Fetch threshold when mounted and on focus
  useEffect(() => {
    if (!serialNumber) return;
    let cancelled = false;
    const host = pickHost();

    const fetchThreshold = async () => {
      try {
        const response = await fetch(`https://${host}/api/thresholds/${serialNumber}`);
        if (response.ok) {
          const data = await response.json();
          const losRaw = (data && typeof data === 'object') ? (data.los_ppm ?? data.losPpm ?? data.los_ppm_value ?? null) : null;
          const los = losRaw === null || losRaw === undefined ? null : Number(losRaw);
          if (!cancelled) {
            setThreshold(Number.isFinite(los) ? los : null);
            thresholdRef.current = Number.isFinite(los) ? los : null;
            // recompute indicator color against last reading immediately
            const lastLos = losReadingRef.current;
            if (lastLos !== null && lastLos !== undefined && !Number.isNaN(Number(lastLos))) {
              const t = Number.isFinite(Number(los)) ? Number(los) : null;
              setIndicatorColor(t !== null && Number(lastLos) > t ? '#b10303' : '#16b800');
            }
          }
        } else {
          if (!cancelled) {
            setThreshold(null);
            thresholdRef.current = null;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch threshold:', err);
        if (!cancelled) {
          setThreshold(null);
          thresholdRef.current = null;
        }
      }
    };

    fetchThreshold();
    const unsub = navigation.addListener('focus', () => {
      fetchThreshold();
      // Also fetch device immediate ping when returning to page
      (async () => {
        try {
          const res = await fetch(`https://${pickHost()}/api/ping/${serialNumber}`);
          if (res.ok) {
            const body = await res.json();
            const online = body && (body.status === 'online' || body.online === true || body.isOnline === true);
            setConnectionState({ color: online ? '#16b800' : '#ff2323', serialNo: serialNumber });
          }
        } catch (e) {
          // ignore
        }
      })();
    });

    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, [serialNumber, route.params?.host, navigation]);

  // initial ping when component mounts so status shows immediately
  useEffect(() => {
    if (!serialNumber) return;
    (async () => {
      try {
        const res = await fetch(`https://${pickHost()}/api/ping/${serialNumber}`);
        if (res.ok) {
          const body = await res.json();
          const online = body && (body.status === 'online' || body.online === true || body.isOnline === true);
          setConnectionState({ color: online ? '#16b800' : '#ff2323', serialNo: serialNumber });
        }
      } catch (e) {
        console.warn('initial ping failed', e);
      }
    })();
  }, [serialNumber, route.params?.host]);

  // Recompute indicator color when threshold or last LOS reading changes.
  useEffect(() => {
    if (losReading === null || losReading === undefined) return;
    const numeric = (typeof losReading === 'number') ? losReading : Number(losReading);
    if (Number.isNaN(numeric)) return;
    if (threshold === null || threshold === undefined) {
      setIndicatorColor('#16b800'); // default green if no threshold
      return;
    }
    const t = Number(threshold);
    if (Number.isNaN(t)) {
      setIndicatorColor('#16b800');
      return;
    }
    setIndicatorColor(numeric > t ? '#b10303' : '#16b800');
  }, [threshold, losReading]);

  // Derive alarms list from tableData (tableData now only contains PPM rows)
  const alarms = useMemo(() => {
    if (threshold === null || threshold === undefined) return [];
    return tableData.filter((row) => {
      try {
        const numeric = (typeof row.rawValue === 'number') ? row.rawValue : Number(row.rawValue);
        if (Number.isNaN(numeric)) return false;
        return numeric > threshold;
      } catch (e) {
        return false;
      }
    }).slice(0, 1000);
  }, [tableData, threshold]);

  // Render only Date & Time + PPM value for both Live (Real time) and Alarms
  const renderRow = ({ item }) => {
    const rawVal = item.rawValue;
    const numeric = (typeof rawVal === 'number') ? rawVal : Number(rawVal);
    const displayValue = !Number.isNaN(numeric) ? `${numeric} PPM` : String(item.VALUE);

    const valueStyle = (threshold !== null && !Number.isNaN(numeric) && numeric > threshold)
      ? { color: '#b10303', fontWeight: '700' }
      : { color: '#111' };

    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.dateCell]}>{item.TIMESTAMP}</Text>
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

  // For the live view we use tableData (PPM rows). For alarms use alarms.
  const liveData = tableData;

  return (
    <ImageBackground source={require('../Assets/bg2.png')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.container}>
        {/* Logo (top-left) and Settings (top-right) */}
        <View style={styles.topRow}>
          <View style={styles.logoContainer}>
            <Image style={styles.logo} source={require('../Assets/logo.png')} resizeMode="contain" />
          </View>
          <TouchableOpacity style={styles.topSettings} onPress={() => navigation.navigate('Settings', { serialNumber })}>
            <Icon name="settings-outline" size={28} color="#bbb" />
          </TouchableOpacity>
        </View>

        {/* Serial number (left) and online/offline (right) in same row */}
        <View style={styles.serialRow}>
          <View style={styles.serialbox}>
            <Text style={styles.serialno}>{connectionState.serialNo || serialNumber || '-'}</Text>
          </View>
          <View style={styles.statusBox}> 
            <Text style={[styles.statusText, { color: connectionState.color === '#16b800' ? '#16b800' : '#ff2323' }]}>
              {connectionState.color === '#16b800' ? 'ONLINE' : 'OFFLINE'}
            </Text>
            {/* Current time (hh:mm:ss AM/PM) displayed just below the online/offline indicator */}
            <Text style={styles.timeText}>{currentTime}</Text>
          </View>
        </View>

        {/* Big Indicator (PPM) */}
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
        </View>

        {/* Tabs and Clear */}
        <View style={styles.switchbuttons}>
          <TouchableOpacity
            style={[styles.logs, tabStyle('live')]}
            onPressIn={() => { setActiveButton('live'); }}
            onPress={() => { setCurrentView('live'); setActiveButton('live'); }}
          >
            <Text style={[styles.buttonText, tabTextStyle('live')]}>Real time</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logs, tabStyle('alarms')]}
            onPressIn={() => { setActiveButton('alarms'); }}
            onPress={() => { setCurrentView('alarms'); setActiveButton('alarms'); }}
          >
            <Text style={[styles.buttonText, tabTextStyle('alarms')]}>Alarms</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearbutton}
            onPress={() => {
              // capture current rows' fingerprints so replays of these exact rows are ignored later
              const currentFingerprints = new Set(
                tableData.map(it => makeFingerprint(
                  connectionState.serialNo ?? serialNumber,
                  it.rawKey,
                  it.rawValue,
                  '', // we don't have server timestamp stored per-row, so use local TIMESTAMP part of fingerprint
                  it.TIMESTAMP
                ))
              );
              clearedSetRef.current = currentFingerprints;
              // clear table
              setTableData([]);
              // ensure we skip the first incoming PPM after clearing (to avoid immediate retained replay)
              skipFirstRef.current = true;
              // optional: keep seenSet as-is (so duplicates already seen won't be added),
              // do not clear seenSetRef if you want to keep dedupe for session
            }}
          >
            <Text style={styles.cleartext}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Contained table (fixed size) - headers changed to Date/Time + Value */}
        <View style={styles.box}>
          {currentView === 'live' && (
            <>
              <View style={styles.header}>
                <Text style={[styles.heading, styles.dateHead]}>DATE & TIME</Text>
                <Text style={[styles.heading, styles.statusHead]}>PPM</Text>
              </View>
              <FlatList
                ref={flatListRef}
                style={styles.tablebox}
                data={liveData}
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
                <Text style={[styles.heading, styles.statusHead]}>PPM</Text>
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
                      No alarms
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

        {/* Powered by at bottom */}
        <Text style={styles.powered}>Powered by SONIC</Text>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },

  /* top row contains logo (left) and settings (right) */
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 6,
    borderRadius: 8,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginLeft: 6,
  },
  logo: {
    width: 140,
    height: 48,
    resizeMode: 'contain',
  },
  topSettings: {
    marginRight: 8,
    marginTop: 6,
    padding: 6,
  },

  /* serial row: serial (left) and status (right) */
  serialRow: {
    width: '100%',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  serialbox: {
    minWidth: 180,
    height: 46,
    backgroundColor: 'rgba(0,0,0,0.8)',
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
  timeText: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },

  /* Big indicator (dark style like original) */
  singleIndicatorContainer: {
    alignItems: 'center',
    marginVertical: 18,
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

  /* contained table: fixed width & height, light shaded as requested */
  box: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    marginTop: 6,
    flex: 0,
  },
  header: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 10,
    borderRadius: 5,
    width: '98%',
    alignItems: 'center',
  },
  tablebox: {
    width: '98%',
    height: 360, // fixed height for contained table
    backgroundColor: 'rgba(255,255,255,0.9)',
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
    color: '#111',
    marginLeft: 10,
  },
  dateHead: {
    flex: 3,
    textAlign: 'left',
    paddingHorizontal: 10,
    color: '#111',
  },
  statusHead: {
    flex: 1,
    textAlign: 'center',
    color: '#111',
  },
  cell: {
    textAlign: 'center',
    fontSize: 12,
    color: '#111',
    marginRight: 10,
  },
  dateCell: {
    flex: 3,
    textAlign: 'left',
    paddingLeft: 10,
    color: '#111',
  },
  statusCell: {
    flex: 1,
    textAlign: 'center',
    color: '#111',
  },

  loadingtext: {
    color: 'white',
  },
  errorText: {
    color: 'red',
  },
  powered: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.8)',
  },
  buttonText: {
    fontSize: 15,
    color: '#fff',
  },
});

export default IndicatorApp;