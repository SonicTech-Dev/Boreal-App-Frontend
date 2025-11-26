import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Text as SvgText, Rect } from 'react-native-svg';

/**
 * PpmGraph - light theme only, axis titles static & always visible
 *
 * Responsive sizing fixes: responsiveHeight now scales up and down with screen width.
 */

const DEFAULT_FLUSH_MS = 200; // ms
const MAX_CANVAS_WIDTH = 4800; // px
const DEFAULT_Y_AXIS_WIDTH = 40; // base space reserved on left for rotated Y title
const DEFAULT_LABEL_AREA_HEIGHT = 56; // base space under chart for x-axis title / labels
const BASE_SCREEN_WIDTH = 375; // design reference width for scaling

const PpmGraph = forwardRef(({
  externalData = null,
  maxPoints = 1000,
  renderPoints = 80,
  pointSpacing = 64,
  maxXLabels = 7,
  height = 340,
  topPadding = 50,
  chartConfig: userChartConfig,
  style,
  flushMs = DEFAULT_FLUSH_MS,
  showAllTimestamps = true,
  containerColor = '#ffffff',
  // axis title props
  xAxisTitle = 'Time',
  yAxisTitle = 'PPM',
  showAxisTitles = true,
  axisTitleFontSize = 12,
  axisTitleColor = '#0b1a1f',
  // optional sizing overrides (base values; will be scaled)
  yAxisWidth = DEFAULT_Y_AXIS_WIDTH,
  labelAreaHeight = DEFAULT_LABEL_AREA_HEIGHT,
}, ref) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // scale factor based on current width relative to a base width
  const widthScale = Math.max(0.6, Math.min(1.6, windowWidth / BASE_SCREEN_WIDTH));

  // responsive computed sizes (you can still override the base props)
  const responsiveHeight = useMemo(() => {
    // keep chart height reasonable on very small/very large screens
    const minH = 160;
    const maxH = Math.max(280, Math.round(windowHeight * 0.45)); // cap on very tall devices

    // Allow scaling both down and up using widthScale (previous bug clamped to <=1)
    const scaled = Math.round(height * widthScale);

    return Math.max(minH, Math.min(maxH, scaled));
  }, [height, windowHeight, widthScale]);

  const effectivePointSpacing = useMemo(() => {
    // scale horizontal spacing with width, clamp to a min
    return Math.max(12, Math.round(pointSpacing * widthScale));
  }, [pointSpacing, widthScale]);

  const effectiveYAxisWidth = useMemo(() => Math.max(28, Math.round(yAxisWidth * widthScale)), [yAxisWidth, widthScale]);
  const effectiveLabelAreaHeight = useMemo(() => Math.max(36, Math.round(labelAreaHeight * widthScale)), [labelAreaHeight, widthScale]);
  const effectiveAxisTitleFontSize = Math.max(10, Math.round(axisTitleFontSize * widthScale));

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

  const hasData = visibleValues.length > 0;

  // Chart sizing with cap & adaptive spacing (responsive)
  const viewportWidth = Math.max(320, Math.round(windowWidth - 32));
  const desiredWidth = Math.max(viewportWidth, Math.max(1, visibleValues.length) * effectivePointSpacing + 40);
  let chartInnerWidth = Math.min(desiredWidth, MAX_CANVAS_WIDTH);
  if (desiredWidth > MAX_CANVAS_WIDTH && visibleValues.length > 0) {
    const spacing = Math.max(12, Math.floor((MAX_CANVAS_WIDTH - 40) / Math.max(1, visibleValues.length)));
    chartInnerWidth = Math.max(viewportWidth, visibleValues.length * spacing + 40);
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
  const chartData = useMemo(() => ({
    labels: new Array(Math.max(1, visibleValues.length)).fill(''),
    datasets: [
      {
        data: hasData ? visibleValues : [0],
        color: (opacity = 1) => `rgba(37,99,235,${opacity})`,
        strokeWidth: 2,
      },
    ],
  }), [visibleValues, hasData]);

  // Light theme defaults (no conditional logic)
  const lightChartConfig = useMemo(() => ({
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#f3f7fb',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(11,26,31,${opacity})`,
    labelColor: (opacity = 1) => `rgba(80,95,102,${Math.max(0.5, opacity)})`,
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#ffffff', fill: '#2563eb' },
    style: { borderRadius: 12 },
    datasetColor: (opacity = 1) => `rgba(37,99,235,${opacity})`,
  }), []);

  const chartConfig = userChartConfig ? { ...lightChartConfig, ...userChartConfig } : lightChartConfig;

  // render labels above/below each dot. Responsive font sizing and widths.
  const renderDotContent = ({ x, y, index }) => {
    const v = visibleValues[index];
    const t = visibleTimes[index];
    if (typeof v === 'undefined' && !t) return null;

    const showTime = showTimeIndices.includes(index);
    const n = visibleValues.length;

    // base sizes, then scale with widthScale
    let labelWidth = 86;
    let fontSizeTime = 10;
    let fontSizePpm = 11;
    if (n > 120) { labelWidth = 56; fontSizeTime = 8; fontSizePpm = 9; }
    else if (n > 80) { labelWidth = 64; fontSizeTime = 9; fontSizePpm = 10; }

    const scaledLabelWidth = Math.max(40, Math.round(labelWidth * widthScale));
    const scaledFontSizeTime = Math.max(8, Math.round(fontSizeTime * widthScale));
    const scaledFontSizePpm = Math.max(9, Math.round(fontSizePpm * widthScale));

    const pad = Math.max(3, Math.round(4 * widthScale));
    const rectW = scaledLabelWidth + pad * 2;
    const rectH = Math.max(14, Math.round(18 * widthScale));

    const ppmY = y - Math.max(12, Math.round(14 * widthScale));
    const timeY = y + Math.max(22, Math.round(28 * widthScale));

    const rectFill = 'rgba(0,0,0,0.55)';
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
              fontSize={scaledFontSizePpm}
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
              y={timeY + (scaledFontSizeTime / 2) + 2}
              fill={timeTextColor}
              fontSize={scaledFontSizeTime}
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
  const wrapperHeight = responsiveHeight + effectiveLabelAreaHeight;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: containerColor, minHeight: topPadding + responsiveHeight + effectiveLabelAreaHeight },
        style,
      ]}
    >
      {/* Static Y axis title (does NOT scroll) */}
      {showAxisTitles && (
        <View
          style={{
            position: 'absolute',
            left: 6,
            top: topPadding + (wrapperHeight - topPadding - effectiveLabelAreaHeight) / 2,
            height: responsiveHeight,
            width: effectiveYAxisWidth,
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
              fontSize: effectiveAxisTitleFontSize,
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
          width: chartInnerWidth + effectiveYAxisWidth,
          paddingRight: 12,
          paddingLeft: effectiveYAxisWidth,
        }}
      >
        <View style={{ width: chartInnerWidth, height: responsiveHeight + effectiveLabelAreaHeight }}>
          <LineChart
            data={chartData}
            width={chartInnerWidth}
            height={responsiveHeight}
            chartConfig={chartConfig}
            bezier
            style={{
              borderRadius: 12,
              marginBottom: 0,
              paddingBottom: effectiveLabelAreaHeight,
              paddingTop: topPadding,
            }}
            withInnerLines={true}
            withOuterLines={false}
            fromZero={true}
            segments={4}
            renderDotContent={renderDotContent}
            withDots={hasData}
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
            top: topPadding + responsiveHeight,
            width: '100%',
            height: effectiveLabelAreaHeight,
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
              fontSize: effectiveAxisTitleFontSize,
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
    overflow: 'visible',
  },
});