import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  Image,
  ImageBackground,
  Platform,
  Alert,
} from 'react-native';

export default function SettingsPage({ route, navigation }) {
  // params sent from IndicatorApp:
  // { serialNumber, indicatorNames, reverseState, onUpdate, host }
  const {
    serialNumber,
    indicatorNames = [], // expected: [{ id: '...', name: '...' }, ...]
    reverseState = false,
    onUpdate,
    host: hostOverride,
  } = route.params || {};

  const [indicatorname, setIndicatorname] = useState(indicatorNames || []);
  const [isReversed, setIsReversed] = useState(reverseState);
  const [thresholds, setThresholds] = useState({}); // DI1, DI2 ... or indicatorName -> value
  const [isEditingNames, setIsEditingNames] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  const [loading, setLoading] = useState(false);

  // pickHost: prefer passed hostOverride, otherwise use default dev IP
  const pickHost = () => {
    if (hostOverride) return hostOverride;
    const defaultHost = '192.168.0.173';
    if (Platform.OS === 'android') {
      // adjust for emulator or physical device as needed
      return defaultHost;
    }
    return defaultHost;
  };

  // load indicators (if not provided) and thresholds + reverse flag
  useEffect(() => {
    if (!serialNumber) return;

    let cancelled = false;
    const host = pickHost();
    const base = `http://${host}:3004`;

    const fetchIndicators = async () => {
      try {
        const res = await fetch(`${base}/api/indicators/${serialNumber}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch (err) {
        console.warn('fetchIndicators error', err);
        return null;
      }
    };

    const fetchThresholds = async () => {
      try {
        const res = await fetch(`${base}/api/thresholds/${serialNumber}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data;
      } catch (err) {
        console.warn('fetchThresholds error', err);
        return null;
      }
    };

    const fetchReverse = async () => {
      // try a couple of possible endpoints / shapes
      try {
        const res = await fetch(`${base}/api/reverse-indicator/${serialNumber}`);
        if (res.ok) {
          const body = await res.json();
          // possible shapes: { reverseIndicator: true } or { isReversed: true } or { reverse_indicator: true }
          if (typeof body.isReversed === 'boolean') return body.isReversed;
          if (typeof body.reverseIndicator === 'boolean') return body.reverseIndicator;
          if (typeof body.reverse_indicator === 'boolean') return body.reverse_indicator;
          // sometimes backend returns { ok:true, serialNumber:..., reverseIndicator: true }
          if (typeof body.reverseIndicator === 'boolean') return body.reverseIndicator;
        }
      } catch (err) {
        // ignore and try fallback
      }

      try {
        const res2 = await fetch(`${base}/api/device_settings/${serialNumber}`);
        if (res2.ok) {
          const b2 = await res2.json();
          if (typeof b2.reverse_indicator === 'boolean') return b2.reverse_indicator;
          if (typeof b2.reverseIndicator === 'boolean') return b2.reverseIndicator;
          if (typeof b2.isReversed === 'boolean') return b2.isReversed;
        }
      } catch (err) {
        // ignore
      }

      return null;
    };

    const loadAll = async () => {
      setLoading(true);
      try {
        // indicators: only fetch when none were passed in route params
        if (!indicatorNames || indicatorNames.length === 0) {
          const fetchedIndicators = await fetchIndicators();
          if (!cancelled && Array.isArray(fetchedIndicators) && fetchedIndicators.length > 0) {
            // normalize to { id, name }
            setIndicatorname(fetchedIndicators.map((r) => ({ id: r.id, name: r.name })));
          }
        }

        // thresholds: backend may return either:
        // - object mapping { DI1: 10, los_ppm: 25 } or
        // - array of rows [{ indicator: 'los_ppm', threshold: 25 }, ...]
        // We want thresholds state to be an object keyed by DI1/DI2 (matching UI),
        // but we'll preserve any keys returned and also map ppm -> DIx if indicators present.
        const fetchedThresholds = await fetchThresholds();
        if (!cancelled && fetchedThresholds) {
          let tObj = {};
          if (Array.isArray(fetchedThresholds)) {
            // convert array rows to mapping by indicator name
            fetchedThresholds.forEach((r) => {
              if (r.indicator) tObj[r.indicator] = r.threshold;
            });
          } else if (typeof fetchedThresholds === 'object') {
            // If backend already returns object mapping, use it
            tObj = { ...fetchedThresholds };
          }

          // If we have indicator list, map any ppm-like key to DI{index}
          const indicators = (indicatorname && indicatorname.length > 0) ? indicatorname : (Array.isArray(fetchedThresholds) ? fetchedThresholds.map(r => ({ id: r.id, name: r.indicator })) : []);
          // build DI keyed thresholds if not already present
          const diMapped = {};
          indicators.forEach((ind, idx) => {
            const diKey = `DI${idx + 1}`;
            // preserve existing DI value if present
            if (tObj[diKey] !== undefined) {
              diMapped[diKey] = tObj[diKey];
              return;
            }
            // check for indicator name matches (ppm)
            const name = (ind && (ind.name || ind.indicator || '')).toString().toLowerCase();
            // prefer explicit los_ppm key
            if (tObj.los_ppm !== undefined && (name.includes('ppm') || name.includes('los'))) {
              diMapped[diKey] = tObj.los_ppm;
              return;
            }
            // search tObj keys for one that contains 'ppm'
            const ppmKey = Object.keys(tObj).find(k => k.toLowerCase().includes('ppm'));
            if (ppmKey && (name.includes('ppm') || name.includes('los'))) {
              diMapped[diKey] = tObj[ppmKey];
              return;
            }
            // otherwise, if tObj has a key exactly matching the indicator name, use that
            const exactKey = Object.keys(tObj).find(k => k.toLowerCase() === name);
            if (exactKey) {
              diMapped[diKey] = tObj[exactKey];
              return;
            }
            // fallback: keep existing DI value if any, else undefined
            if (thresholds[diKey] !== undefined) diMapped[diKey] = thresholds[diKey];
          });

          // merge any other keys (like los_ppm) so user can still edit that key by name if desired
          const merged = { ...tObj, ...diMapped };
          setThresholds(merged);
        }

        // reverse flag
        const rev = await fetchReverse();
        if (!cancelled && typeof rev === 'boolean') {
          setIsReversed(rev);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialNumber]);

  const handleThresholdChange = (key, value) => {
    setThresholds((prev) => ({
      ...prev,
      [key]: value === '' ? '' : parseFloat(value),
    }));
  };

  const handleNameChange = (id, newName) => {
    setIndicatorname((prevNames) =>
      prevNames.map((item) => (item.id === id ? { ...item, name: newName } : item)),
    );
  };

  const handleSubmit = async () => {
    if (!serialNumber) {
      Alert.alert('Error', 'No serialNumber available.');
      return;
    }
    setLoading(true);
    const host = pickHost();
    const base = `http://${host}:3004`;

    try {
      // Update indicator names (if changed)
      const namePromises = indicatorname.map(({ id, name }) =>
        fetch(`${base}/api/indicators/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).then(async (r) => {
          if (!r.ok) {
            const text = await r.text().catch(() => '');
            throw new Error(`Failed updating indicator ${id}: ${r.status} ${text}`);
          }
          return r.json().catch(() => ({}));
        }),
      );
      await Promise.all(namePromises);

      // Update reverse setting
      const reverseRes = await fetch(`${base}/api/reverse-indicator/${serialNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReversed }),
      });
      if (!reverseRes.ok) {
        const t = await reverseRes.text().catch(() => '');
        throw new Error(`Failed to update reverse-indicator: ${reverseRes.status} ${t}`);
      }

      // Update thresholds -- send the thresholds object as-is.
      // Backend expected shape (based on previous server code) is:
      // either mapping { DI1: 10, DI2: 5 } or indicator->value mapping { los_ppm: 25 }
      const thrRes = await fetch(`${base}/api/thresholds/${serialNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      });
      if (!thrRes.ok) {
        const t = await thrRes.text().catch(() => '');
        throw new Error(`Failed to update thresholds: ${thrRes.status} ${t}`);
      }

      // notify caller
      if (typeof onUpdate === 'function') {
        onUpdate({
          updatedIndicatornames: indicatorname,
          updatedReversestate: isReversed,
          updatedThresholds: thresholds,
        });
      }

      Alert.alert('Success', 'Settings saved successfully');
      navigation.goBack();
    } catch (err) {
      console.error('handleSubmit error', err);
      Alert.alert('Save failed', String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('../Assets/bg2.png')} style={styles.background} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          {/* Logo top-left */}
          <View style={styles.logoContainer}>
            <Image style={styles.logo} source={require('../Assets/boreal.png')} resizeMode="contain" />
          </View>

          <Text style={styles.pageTitle}>Settings</Text>

          {/* Indicator Names Section */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>INDICATOR NAMES</Text>
            <View style={styles.indicatorList}>
              {indicatorname.map(({ id, name }, index) => (
                <View key={id || index} style={styles.indicatorWrapper}>
                  {isEditingNames ? (
                    <TextInput
                      style={styles.textInput}
                      value={name}
                      onChangeText={(newName) => handleNameChange(id, newName)}
                      placeholder={`Indicator ${index + 1}`}
                      placeholderTextColor="#888"
                    />
                  ) : (
                    <Text style={styles.indicatorName}>{name}</Text>
                  )}
                </View>
              ))}
              {indicatorname.length === 0 && <Text style={{ color: '#bbb' }}>No indicators available.</Text>}
            </View>
            <View style={styles.buttonRow}>
              {!isEditingNames ? (
                <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditingNames(true)}>
                  <Text style={styles.buttonText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => {
                    setIsEditingNames(false);
                  }}
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
                const diKey = `DI${index + 1}`;
                // prefer DI key, fallback to indicator name key if present in thresholds
                const value = thresholds[diKey] !== undefined ? thresholds[diKey] : (thresholds[name] !== undefined ? thresholds[name] : '');
                return (
                  <View key={id || diKey} style={styles.indicatorWrapper}>
                    <Text style={styles.indicatorName}>{name}</Text>
                    {isEditingThresholds ? (
                      <TextInput
                        style={styles.textInput}
                        keyboardType="numeric"
                        placeholder="Threshold"
                        placeholderTextColor="#888"
                        value={value === undefined || value === null ? '' : String(value)}
                        onChangeText={(val) => handleThresholdChange(diKey, val)}
                      />
                    ) : (
                      <Text style={styles.thresholdValue}>Threshold: {value === '' || value === undefined ? 'Not Set' : String(value)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.buttonRow}>
              {!isEditingThresholds ? (
                <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditingThresholds(true)}>
                  <Text style={styles.buttonText}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionButton} onPress={() => setIsEditingThresholds(false)}>
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

          <View style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Submit'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 12, backgroundColor: '#2b2b2b' }]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subTextdown}>Powered by SONIC</Text>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  scrollContainer: { flexGrow: 1, width: '100%' },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 28,
  },
  logoContainer: {
    position: 'absolute',
    left: 16,
    top: 18,
    width: 140,
    height: 56,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  logo: {
    width: 140,
    height: 56,
    resizeMode: 'contain',
    opacity: 0.95,
  },
  subTextdown: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginVertical: 14,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(31,31,31,0.9)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    fontWeight: '600',
  },
  indicatorList: {
    marginBottom: 6,
  },
  indicatorWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2f2f2f',
    paddingBottom: 8,
  },
  indicatorName: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  textInput: {
    width: '45%',
    backgroundColor: '#333',
    padding: 10,
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  thresholdValue: {
    fontSize: 15,
    color: '#bbb',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
  },
  actionButton: {
    backgroundColor: '#3d3b3b',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 26,
    elevation: 3,
    marginHorizontal: 6,
  },
  submitButton: {
    backgroundColor: '#3d3b3b',
    paddingVertical: 14,
    paddingHorizontal: 44,
    borderRadius: 28,
    marginTop: 12,
    elevation: 4,
  },
  buttonText: {
    fontSize: 15,
    color: '#fff',
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    color: '#bbb',
    marginLeft: 12,
  },
  subTextdown: {
    marginTop: 18,
    color: 'rgba(255,255,255,0.6)',
  },
});