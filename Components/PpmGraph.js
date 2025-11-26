import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, ScrollView, Dimensions, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Text as SvgText, Rect } from 'react-native-svg';

/**
 * PpmGraph - light theme only, axis titles static & always visible
 *
 * Changes:
 * - Y axis numeric tick labels are hidden when there is no data.
 * - They appear only when the graph has data (visibleValues.length > 0).
 *
 * Usage:
 *  <PpmGraph externalData={graphData} />
 */

const DEFAULT_FLUSH_MS = 200; // ms
const MAX_CANVAS_WIDTH = 4800; // px
const DEFAULT_Y_AXIS_WIDTH = 40; // space reserved on left for rotated Y title
const DEFAULT_LABEL_AREA_HEIGHT = 56; // space under chart for x-axis title / labels

const PpmGraph = forwardRef(({
  externalData = null,
  maxPoints = 1000,
  renderPoints = 80,
  pointSpacing = 64,
  maxXLabels = 7, // unused when showAllTimestamps=true
  height = 340,
  topPadding = 50,
  chartConfig: userChartConfig,
  style,
  flushMs = DEFAULT_FLUSH_MS,
  showAllTimestamps = true,
  containerColor = '#ffffff', // light background
  // axis title props
  xAxisTitle = 'Time',
  yAxisTitle = 'PPM',
  showAxisTitles = true,
  axisTitleFontSize = 12,
  axisTitleColor = '#0b1a1f',
  // optional sizing overrides
  yAxisWidth = DEFAULT_Y_AXIS_WIDTH,
  labelAreaHeight = DEFAULT_LABEL_AREA_HEIGHT,
}, ref) => {
  const [timesAll, setTimesAll] = useState([]); // HH:MM:SS strings
  const [valuesAll, setValuesAll] = useState([]); // numeric or null

  const bufferTimesRef = useRef([]);
  const bufferValuesRef = useRef([]);
  const lastExternalLenRef = useRef(0);
  const scrollRef = useRef(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      bufferTimesRef.current = [];
      bufferValuesRef.current = [];
      lastExternalLenRef.current = 0;
      setTimesAll([]);
      setValuesAll([]);
      try { scrollRef.current?.scrollTo?.({ x: 0, animated: true }); } catch (e) {}
    },
  }), []);

  // Process externalData deltas into ephemeral buffers
  useEffect(() => {
    if (!externalData || !Array.isArray(externalData)) return;
    const extLen = externalData.length;
    const lastLen = lastExternalLenRef.current;

    // replace if shrunk
    if (extLen < lastLen) {
      const mapped = externalData.slice(-maxPoints).map(d => mapDatumToPoint(d));
      const times = mapped.map(m => formatSmallTime(m.ts));
      const values = mapped.map(m => m.value);
      bufferTimesRef.current = [];
      bufferValuesRef.current = [];
      lastExternalLenRef.current = extLen;
      setTimesAll(times);
      setValuesAll(values);
      return;
    }

    if (extLen === lastLen) return;

    // append delta
    const added = externalData.slice(lastLen);
    lastExternalLenRef.current = extLen;
    for (let i = 0; i < added.length; i++) {
      const p = mapDatumToPoint(added[i]);
      bufferTimesRef.current.push(formatSmallTime(p.ts));
      bufferValuesRef.current.push(p.value);
    }
  }, [externalData, maxPoints]);

  // Flush buffered points to state periodically
  useEffect(() => {
    const id = setInterval(() => {
      const bt = bufferTimesRef.current;
      const bv = bufferValuesRef.current;
      if (bt.length === 0 && bv.length === 0) return;

      setValuesAll(prevVals => {
        const next = [...prevVals, ...bv];
        if (next.length > maxPoints) return next.slice(next.length - maxPoints);
        return next;
      });
      setTimesAll(prevTimes => {
        const next = [...prevTimes, ...bt];
        if (next.length > maxPoints) return next.slice(next.length - maxPoints);
        return next;
      });

      bufferTimesRef.current = [];
      bufferValuesRef.current = [];

      try { scrollRef.current?.scrollToEnd?.({ animated: true }); } catch (e) {}
    }, flushMs);

    return () => clearInterval(id);
  }, [flushMs, maxPoints]);

  // Visible arrays (last renderPoints)
  const visibleValues = useMemo(() => {
    if (valuesAll.length <= renderPoints) return valuesAll.slice();
    return valuesAll.slice(valuesAll.length - renderPoints);
  }, [valuesAll, renderPoints]);

  const visibleTimes = useMemo(() => {
    if (timesAll.length <= renderPoints) return timesAll.slice();
    return timesAll.slice(timesAll.length - renderPoints);
  }, [timesAll, renderPoints]);

  // whether we have real data to show
  const hasData = visibleValues.length > 0;

  // Chart sizing with cap & adaptive spacing
  const viewportWidth = Math.max(320, Dimensions.get('window').width - 32);
  const desiredWidth = Math.max(viewportWidth, Math.max(1, visibleValues.length) * pointSpacing + 40);
  let chartInnerWidth = Math.min(desiredWidth, MAX_CANVAS_WIDTH);
  let effectivePointSpacing = pointSpacing;
  if (desiredWidth > MAX_CANVAS_WIDTH && visibleValues.length > 0) {
    effectivePointSpacing = Math.max(12, Math.floor((MAX_CANVAS_WIDTH - 40) / visibleValues.length));
    chartInnerWidth = Math.max(viewportWidth, visibleValues.length * effectivePointSpacing + 40);
  }

  // Indices to show timestamps: if showAllTimestamps true -> all indices
  const showTimeIndices = useMemo(() => {
    const n = visibleTimes.length;
    if (n === 0) return [];
    if (showAllTimestamps) return Array.from({ length: n }, (_, i) => i);
    const count = Math.min(maxXLabels, n);
    if (count === 1) return [n - 1];
    const step = (n - 1) / (count - 1);
    const idxs = [];
    for (let i = 0; i < count; i++) idxs.push(Math.round(i * step));
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    return Array.from(new Set(idxs));
  }, [visibleTimes, maxXLabels, showAllTimestamps]);

  // Chart data for visible points
  // keep a safe fallback dataset ([0]) so the chart doesn't crash when empty,
  // but we will hide Y-axis labels when hasData is false.
  const chartData = useMemo(() => ({
    labels: new Array(Math.max(1, visibleValues.length)).fill(''),
    datasets: [
      {
        data: hasData ? visibleValues : [0],
        color: (opacity = 1) => `rgba(37,99,235,${opacity})`, // blue
        strokeWidth: 2,
      },
    ],
  }), [visibleValues, hasData]);

  // Light theme defaults (no conditional logic)
  const lightChartConfig = useMemo(() => ({
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#f3f7fb',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(11,26,31,${opacity})`, // main label color (dark)
    labelColor: (opacity = 1) => `rgba(80,95,102,${Math.max(0.5, opacity)})`,
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#ffffff', fill: '#2563eb' },
    style: { borderRadius: 12 },
    datasetColor: (opacity = 1) => `rgba(37,99,235,${opacity})`,
  }), []);

  const chartConfig = userChartConfig ? { ...lightChartConfig, ...userChartConfig } : lightChartConfig;

  // render labels above/below each dot. Reduced sizing when many visible points.
  const renderDotContent = ({ x, y, index }) => {
    const v = visibleValues[index];
    const t = visibleTimes[index];
    if (typeof v === 'undefined' && !t) return null;

    const showTime = showTimeIndices.includes(index);
    const n = visibleValues.length;
    let labelWidth = 86;
    let fontSizeTime = 10;
    let fontSizePpm = 11;
    if (n > 120) { labelWidth = 56; fontSizeTime = 8; fontSizePpm = 9; }
    else if (n > 80) { labelWidth = 64; fontSizeTime = 9; fontSizePpm = 10; }

    const pad = 4;
    const rectW = labelWidth + pad * 2;
    const rectH = 18;

    const ppmY = y - 14;
    const timeY = y + 28;

    // Light theme colors (fixed)
    const rectFill = 'rgba(0,0,0,0.55)'; // dark semi-transparent bubble
    const ppmTextColor = '#ffffff';
    const timeTextColor = '#ffffff';

    return (
      <Svg key={`label-${index}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {typeof v !== 'undefined' && v !== null && (
          <>
            <Rect
              x={x - rectW / 2}
              y={ppmY - rectH + 2}
              rx={6}
              width={rectW}
              height={rectH}
              fill={rectFill}
            />
            <SvgText
              x={x}
              y={ppmY - 2}
              fill={ppmTextColor}
              fontSize={fontSizePpm}
              fontWeight="700"
              textAnchor="middle"
            >
              {Math.round(Number(v)) + ' PPM'}
            </SvgText>
          </>
        )}

        {showTime && t && (
          <>
            <Rect
              x={x - rectW / 2}
              y={timeY - rectH / 2}
              rx={6}
              width={rectW}
              height={rectH}
              fill={rectFill}
            />
            <SvgText
              x={x}
              y={timeY + (fontSizeTime / 2) + 2}
              fill={timeTextColor}
              fontSize={fontSizeTime}
              textAnchor="middle"
            >
              {t}
            </SvgText>
          </>
        )}
      </Svg>
    );
  };

  // Total wrapper height used to help center Y title vertically
  const wrapperHeight = height + labelAreaHeight;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: containerColor, minHeight: topPadding + height + labelAreaHeight },
        style,
      ]}
    >
      {/* Static Y axis title (does NOT scroll) */}
      {showAxisTitles && (
        <View
          style={{
            position: 'absolute',
            left: 6,
            top: topPadding + (wrapperHeight - topPadding - labelAreaHeight) / 2,
            height: height,
            width: yAxisWidth,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Text
            style={{
              transform: [{ rotate: '-90deg' }],
              color: axisTitleColor,
              fontWeight: '600',
              fontSize: axisTitleFontSize,
            }}
          >
            {yAxisTitle}
          </Text>
        </View>
      )}

      {/* Scrollable chart area */}
      <ScrollView
        horizontal
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          // reserve left space for Y axis title so chart doesn't overlap it
          width: chartInnerWidth + yAxisWidth,
          paddingRight: 12,
          paddingLeft: yAxisWidth,
        }}
      >
        <View style={{ width: chartInnerWidth, height: height + labelAreaHeight }}>
          <LineChart
            data={chartData}
            width={chartInnerWidth}
            height={height}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 12, marginBottom: 0, paddingBottom: labelAreaHeight, paddingTop: topPadding }}
            withInnerLines={true}
            withOuterLines={false}
            fromZero={true}
            segments={4}
            renderDotContent={renderDotContent}
            withDots={hasData}
            // hide Y-axis tick labels when there is no data
            formatXLabel={() => ''}
            formatYLabel={hasData ? (y => `${y}`) : (() => '')}
          />
        </View>
      </ScrollView>

      {/* Static X axis title (centered, does NOT scroll) */}
      {showAxisTitles && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: topPadding + height,
            width: '100%',
            height: labelAreaHeight,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Text
            style={{
              color: axisTitleColor,
              fontWeight: '600',
              fontSize: axisTitleFontSize,
            }}
          >
            {xAxisTitle}
          </Text>
        </View>
      )}
    </View>
  );
});

export default PpmGraph;

/* Helpers */
function formatSmallTime(iso) {
  if (!iso) return '';
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function mapDatumToPoint(d) {
  if (!d) return { ts: null, value: null };
  const ts = d.ts ?? d.TIMESTAMP ?? null;
  const raw = (typeof d.value !== 'undefined') ? d.value : (d.rawValue ?? d.VALUE ?? null);
  const value = (raw === null || raw === undefined) ? null : (typeof raw === 'number' ? raw : (Number(raw) || (raw === 0 ? 0 : (Number.isNaN(Number(raw)) ? null : Number(raw)))));
  return { ts, value };
}

/* Styles */
const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'visible', // allow bottom title to be visible
  },
});