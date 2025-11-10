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
import SignalDisplay from '../Components/signalDisplay';

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

  // Track whether this screen is focused (visible) so we only read/process messages while mounted/visible
  const isFocusedRef = useRef(false);

  // Client-side running clock (real local time)
  const [currentTime, setCurrentTime] = useState(formatTime(new Date()));

  const indicatorBigLabel = 'Gas Finder-PPM'; // Big indicator label (PPM)

  const pickHost = () => {
    if (hostOverride) return hostOverride;
    const defaultHost = 'boreal.soniciot.com';
    if (Platform.OS === 'android') {
      return defaultHost;
    }
    return defaultHost;
  };

  // Helper to format time as hh:mm:ss AM/PM (client-side)
  function formatTime(d) {
    if (!d || !(d instanceof Date)) return '-';
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hh = String(hours).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss} ${ampm}`;
  }

  // update client-side clock every second
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTime(formatTime(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Format row timestamp to dd/mm/yyyy hh:mm:ss AM/PM using server-provided ISO timestamp (converted to device local)
  const formatRowDateTime = (ts) => {
    if (!ts && ts !== 0) return '-';
    let d;
    if (ts instanceof Date) {
      d = ts;
    } else {
      d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hh = String(hours).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mins}:${ss} ${ampm}`;
  };

  // Keep refs up to date
  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);
  useEffect(() => {
    losReadingRef.current = losReading;
  }, [losReading]);

  // Track screen focus state: set isFocusedRef true only when this screen is focused.
  useEffect(() => {
    try {
      isFocusedRef.current = navigation && typeof navigation.isFocused === 'function' ? navigation.isFocused() : true;
    } catch (e) {
      isFocusedRef.current = true;
    }

    const onFocus = () => { isFocusedRef.current = true; };
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

    // Listen for threshold updates broadcasted by the server
    const handleThresholdUpdated = (msg) => {
      try {
        // msg expected shape: { serial_number, indicator, threshold }
        const sn = msg && (msg.serial_number ?? msg.serialNumber);
        const indicator = msg && msg.indicator;
        const thr = msg && msg.threshold;
        if (!sn) return;
        if (String(sn) !== String(serialNumber)) return; // only update if for this serial
        if (!indicator || String(indicator).toLowerCase() !== 'los_ppm') return;
        const n = (typeof thr === 'number') ? thr : Number(thr);
        if (Number.isNaN(n)) {
          setThreshold(null);
          thresholdRef.current = null;
        } else {
          setThreshold(n);
          thresholdRef.current = n;
          // recompute indicator color immediately against last reading
          const lastLos = losReadingRef.current;
          if (lastLos !== null && lastLos !== undefined && !Number.isNaN(Number(lastLos))) {
            setIndicatorColor(Number(lastLos) > n ? '#b10303' : '#16b800');
          }
        }
        setTableData([]);
      } catch (e) {
        // ignore
      }
    };

    socket.on('threshold_updated', handleThresholdUpdated);

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
      if (!isFocusedRef.current) return;

      // prefer server received_at; fallback to ts numeric if present
      let serverReceivedAt = null;
      if (msg.received_at) {
        const parsed = new Date(msg.received_at);
        if (!Number.isNaN(parsed.getTime())) serverReceivedAt = parsed.toISOString();
      } else if (typeof msg.ts !== 'undefined' && msg.ts !== null) {
        const parsed = new Date(Number(msg.ts));
        if (!Number.isNaN(parsed.getTime())) serverReceivedAt = parsed.toISOString();
      }

      // If no server timestamp, skip (avoid using client time for rows)
      if (!serverReceivedAt) return;

      // continue only if payload params exist
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

      const newPpmRows = [];
      // iterate params and only keep ppm entries
      Object.entries(params).forEach(([k, v]) => {
        if (!isPpmKey(k)) return;

        const numeric = normalizePpmValue(v);
        const displayVal = numeric !== null ? numeric : v;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-ppm`;

        // build entry using serverReceivedAt as canonical timestamp
        newPpmRows.push({
          id,
          TIMESTAMP: serverReceivedAt,
          INDICATOR: 'Gas Finder-PPM',
          VALUE: displayVal,
          rawKey: k,
          rawValue: v,
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
        socket.off('threshold_updated', handleThresholdUpdated);
        socket.disconnect();
      } catch (e) {
        // ignore
      }
    };
  }, [serialNumber, route.params?.host, currentView, navigation]);

  // When device goes offline we want:
  // - big indicator to become gray
  // - the gas-finder value beside the indicator set to null
  // - the table cleared (no rows)
  useEffect(() => {
    const isOnline = connectionState && connectionState.color === '#16b800';
    if (!isOnline) {
      setIndicatorColor('#888888');
      setLosReading(null);
      setTableData([]);
      // don't maintain dedupe sets anymore (dedupe removed)
    } else {
      // became online: just ensure indicator color recomputed from threshold/last reading
      const lastLos = losReadingRef.current;
      const t = Number.isFinite(Number(thresholdRef.current)) ? Number(thresholdRef.current) : null;
      if (lastLos !== null && lastLos !== undefined && !Number.isNaN(Number(lastLos)) && t !== null) {
        setIndicatorColor(Number(lastLos) > t ? '#b10303' : '#16b800');
      } else {
        setIndicatorColor('#16b800');
      }
    }
  }, [connectionState]);

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

  // initial ping when component mounts so status shows immediately (no server time returned here)
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
        <Text style={[styles.cell, styles.dateCell]}>{formatRowDateTime(item.TIMESTAMP)}</Text>
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
        <Text style={[styles.cell, styles.dateCell]}>{formatRowDateTime(item.TIMESTAMP)}</Text>
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
            {/* Put online/offline in a light background badge with fixed size */}
            <View style={styles.statusBadge}>
              <Text style={[styles.statusText, { color: connectionState.color === '#16b800' ? '#16b800' : '#ff2323' }]}>
                {connectionState.color === '#16b800' ? 'ONLINE' : 'OFFLINE'}
              </Text>
              <Text style={styles.timeText}>{currentTime}</Text>
            </View>

            <View style={styles.statusContainer}>
              {/* Render SignalDisplay only if the device is online */}
              {connectionState.color === '#16b800' && <SignalDisplay serialNo={serialNumber} />}
            </View>
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
              // clear table
              setTableData([]);
            }}
          >
            <Text style={styles.cleartext}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Contained table (fixed size) - headers show DATE & TIME */}
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
  statusContainer: {
    alignItems: 'flex-end',
    marginTop: '8%',
    // small paddingRight so the SignalDisplay sits a bit more to the right side
    paddingRight: 0,
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
    paddingRight: 0, // increased so status+signal are nudged more to the right
  },
  // Fixed-size badge for status + time
  statusBadge: {
    width: 110,               // fixed width
    height: 56,               // fixed height
    backgroundColor: 'rgba(255,255,255,0.95)', // light background for online/offline text
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    // subtle border/shadow for readability
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: 0,     // remove flexible padding
    paddingVertical: 0,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    marginTop: 0,
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
    height: '30%', // fixed height for contained table
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