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
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';

export default function SettingsPage({ route, navigation }) {
  // params: { serialNumber, onUpdate }
  const { serialNumber, onUpdate } = route.params || {};

  const [losPpm, setLosPpm] = useState(''); // string so input stays responsive
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Static backend host
  const HOST_IP = 'boreal.soniciot.com';
  const BASE = `https://${HOST_IP}`;

  useEffect(() => {
    if (!serialNumber) return;
    let cancelled = false;

    const fetchLosPpm = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/api/thresholds/${serialNumber}`);
        if (!res.ok) {
          console.warn('fetch thresholds non-OK status', res.status);
          if (!cancelled) setLosPpm('');
          return;
        }

        const raw = await res.json();

        // Normalize shapes and find los_ppm / ppm-like value
        let value = undefined;

        if (Array.isArray(raw)) {
          const ppmRow = raw.find(
            (r) =>
              r &&
              r.indicator &&
              typeof r.indicator === 'string' &&
              (r.indicator.toLowerCase().includes('ppm') || r.indicator.toLowerCase().includes('los'))
          );
          if (ppmRow) value = ppmRow.threshold;
        } else if (raw && typeof raw === 'object') {
          const obj = raw.thresholds && typeof raw.thresholds === 'object' ? raw.thresholds : raw;
          if (obj.los_ppm !== undefined) value = obj.los_ppm;
          else {
            const ppmKey = Object.keys(obj).find((k) => k.toLowerCase().includes('ppm'));
            if (ppmKey) value = obj[ppmKey];
          }
        }

        if (!cancelled) {
          if (value === undefined || value === null) setLosPpm('');
          else setLosPpm(String(value));
        }
      } catch (err) {
        console.warn('fetch thresholds error', err);
        if (!cancelled) setLosPpm('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLosPpm();
    return () => {
      cancelled = true;
    };
  }, [serialNumber]);

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!serialNumber) {
      Alert.alert('Error', 'No serial number provided.');
      return;
    }

    // validate
    const trimmed = losPpm === null ? '' : String(losPpm).trim();
    const numeric = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && Number.isNaN(numeric)) {
      Alert.alert('Invalid value', 'Please enter a valid number for LOS PPM or leave it empty.');
      return;
    }

    setSaving(true);
    try {
      const payload = trimmed === '' ? {} : { los_ppm: numeric };

      const res = await fetch(`${BASE}/api/thresholds/${serialNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text().catch(() => '');
      let body = text;
      try {
        body = JSON.parse(text);
      } catch (_) {}

      if (!res.ok) {
        console.error('Failed to save los_ppm', res.status, body);
        throw new Error(`Save failed: ${res.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      }

      // Notify main screen via callback (if provided)
      if (typeof onUpdate === 'function') {
        try {
          onUpdate({ los_ppm: numeric === null ? null : numeric });
        } catch (e) {
          console.warn('onUpdate callback error', e);
        }
      }

      // IMPORTANT: per your requirement, use goBack() — do NOT reset or navigate elsewhere.
      navigation.goBack();
    } catch (err) {
      console.error('handleSave error', err);
      Alert.alert('Save failed', String(err.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (!serialNumber) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <Text style={{ color: '#fff' }}>No serial number provided.</Text>
      </View>
    );
  }

  return (
    <ImageBackground source={require('../Assets/bg2.png')} style={styles.background} resizeMode="cover">
      <View style={styles.outer}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          {/* Top: logo row */}
          <View style={styles.logoRow}>
            <Image style={styles.topLogo} source={require('../Assets/boreal.png')} resizeMode="contain" />
          </View>

          {/* Second row: centered, larger heading */}
          <View style={styles.headingRow}>
            <Text style={styles.headingText}>Settings</Text>
          </View>

          <View style={styles.centerWrapper}>
            <View style={styles.card}>
              {/* Visible label change only */}
              <Text style={styles.title}>Gas Finder-PPM Threshold</Text>

              {loading && <ActivityIndicator size="small" color="#fff" style={{ marginVertical: 12 }} />}

              <View style={styles.fieldRow}>
                <Text style={styles.label}>Gas Finder-PPM</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Enter LOS PPM"
                  placeholderTextColor="#bbb"
                  value={losPpm === null ? '' : String(losPpm)}
                  onChangeText={setLosPpm}
                />
              </View>

              {/* Hint removed as requested */}

              <View style={styles.rowButtons}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancel]}
                  onPress={() => {
                    navigation.goBack();
                  }}
                  disabled={saving}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.save]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.btnText}>{saving ? 'Saving...' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.powered}>Powered by SONIC</Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  outer: { flex: 1 },
  scrollContainer: { flexGrow: 1 },
  logoRow: {
    width: '100%',
    paddingTop: 18,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  topLogo: {
    width: 120,
    height: 44,
    opacity: 0.95,
  },
  headingRow: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: {
    fontSize: 22, // a little larger
    color: '#fff',
    fontWeight: '800',
  },
  centerWrapper: {
    flex: 1,
    justifyContent: 'center', // centers vertically
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 22,
    borderRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 14,
    fontWeight: '700',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  input: {
    width: 140,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    textAlign: 'center',
  },
  rowButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  cancel: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  save: {
    backgroundColor: '#2a8f2a',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  powered: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
});