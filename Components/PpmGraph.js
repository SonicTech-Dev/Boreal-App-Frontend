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
import Svg, { Text as SvgText } from 'react-native-svg';

/**
 * PpmGraph - supports gap on the side where new data appears (newestOnLeft)
 *
 * Changes in this version:
 * - Restores showing the PPM value label for every plotted point (as before).
 * - Keeps previous improvements: responsive scaling, extra bottom padding so X title
 *   doesn't overlap rotated time labels, and Y title rendered inside scrollable content
 *   so it moves with the chart.
 */

const DEFAULT_FLUSH_MS = 200;
const DEFAULT_Y_AXIS_WIDTH = 40;
const DEFAULT_LABEL_AREA_HEIGHT = 56;
const BASE_SCREEN_WIDTH = 375;

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
  xAxisTitle = 'Time',
  yAxisTitle = 'PPM',
  showAxisTitles = true,
  axisTitleFontSize = 12,
  axisTitleColor = '#0b1a1f',
  yAxisWidth = DEFAULT_Y_AXIS_WIDTH,
  labelAreaHeight = DEFAULT_LABEL_AREA_HEIGHT,
  newestOnLeft = false,
}, ref) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // responsiveness scale
  const widthScale = Math.max(0.6, Math.min(1.6, windowWidth / BASE_SCREEN_WIDTH));

  const responsiveHeight = useMemo(() => {
    const minH = 160;
    const maxH = Math.max(280, Math.round(windowHeight * 0.45));
    const scaled = Math.round(height * widthScale);
    return Math.max(minH, Math.min(maxH, scaled));
  }, [height, windowHeight, widthScale]);

  const effectivePointSpacing = useMemo(() => Math.max(12, Math.round(pointSpacing * widthScale)), [pointSpacing, widthScale]);
  const effectiveYAxisWidth = useMemo(() => Math.max(28, Math.round(yAxisWidth * widthScale)), [yAxisWidth, widthScale]);
  const effectiveLabelAreaHeight = useMemo(() => Math.max(36, Math.round(labelAreaHeight * widthScale)), [labelAreaHeight, widthScale]);
  const effectiveAxisTitleFontSize = Math.max(10, Math.round(axisTitleFontSize * widthScale));

  // Extra bottom padding so "Time" title doesn't collide with x-axis readings
  const extraBottomPadding = Math.max(8, Math.round(12 * widthScale));

  const [timesAll, setTimesAll] = useState([]);
  const [valuesAll, setValuesAll] = useState([]);

  const lastExternalLenRef = useRef(0);
  const scrollRef = useRef(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      lastExternalLenRef.current = 0;
      setTimesAll([]);
      setValuesAll([]);
      try { scrollRef.current?.scrollTo?.({ x: 0, animated: true }); } catch (e) {}
    },
  }), []);

  // Process externalData deltas immediately
  useEffect(() => {
    if (!externalData || !Array.isArray(externalData)) return;
    const extLen = externalData.length;
    const lastLen = lastExternalLenRef.current;

    // full replace when data shrinks
    if (extLen < lastLen) {
      const mapped = externalData.slice(-maxPoints).map(d => mapDatumToPoint(d));
      const times = mapped.map(m => formatSmallTime12(m.ts));
      const values = mapped.map(m => m.value);
      lastExternalLenRef.current = extLen;
      setTimesAll(times);
      setValuesAll(values);
      setTimeout(() => {
        try {
          if (newestOnLeft) scrollRef.current?.scrollTo({ x: 0, animated: false });
          else scrollRef.current?.scrollToEnd({ animated: false });
        } catch (e) {}
      }, 0);
      return;
    }

    if (extLen === lastLen) return;

    // append delta
    const added = externalData.slice(lastLen);
    lastExternalLenRef.current = extLen;
    if (added.length === 0) return;

    const mapped = added.map(d => mapDatumToPoint(d));
    const times = mapped.map(m => formatSmallTime12(m.ts));
    const values = mapped.map(m => m.value);

    setValuesAll(prevVals => {
      const next = [...prevVals, ...values];
      if (next.length > maxPoints) return next.slice(next.length - maxPoints);
      return next;
    });
    setTimesAll(prevTimes => {
      const next = [...prevTimes, ...times];
      if (next.length > maxPoints) return next.slice(next.length - maxPoints);
      return next;
    });

    setTimeout(() => {
      try {
        if (newestOnLeft) {
          scrollRef.current?.scrollTo({ x: 0, animated: true });
        } else {
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      } catch (e) {}
    }, 0);
  }, [externalData, maxPoints, newestOnLeft]);

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

  // If newestOnLeft, reverse the visible arrays so newest is plotted at left
  const plottedValues = useMemo(() => {
    return newestOnLeft ? [...visibleValues].reverse() : visibleValues;
  }, [visibleValues, newestOnLeft]);

  const plottedTimes = useMemo(() => {
    return newestOnLeft ? [...visibleTimes].reverse() : visibleTimes;
  }, [visibleTimes, newestOnLeft]);

  // Chart sizing
  const viewportWidth = Math.max(320, Math.round(windowWidth - 32));
  const gapSize = effectivePointSpacing; // gap to reserve on the "newest" side

  let chartInnerWidth = Math.max(
    viewportWidth,
    (plottedValues.length * effectivePointSpacing) + 40 + gapSize
  );

  // Determine which indices to show time labels for (based on plottedTimes)
  const showTimeIndices = useMemo(() => {
    const n = plottedTimes.length;
    if (n === 0) return [];
    if (showAllTimestamps) return Array.from({ length: n }, (_, i) => i);
    const count = Math.min(maxXLabels, n);
    if (count === 1) return [n - 1];
    const step = (n - 1) / (count - 1);
    const idxs = [];
    for (let i = 0; i < count; i++) idxs.push(Math.round(i * step));
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    return Array.from(new Set(idxs));
  }, [plottedTimes, maxXLabels, showAllTimestamps]);

  // Build chart data using plottedValues; labels empty (we draw labels manually)
  const chartData = useMemo(() => ({
    labels: new Array(Math.max(1, plottedValues.length)).fill(''),
    datasets: [
      {
        data: hasData ? plottedValues.map(v => (v === null ? 0 : v)) : [0],
        color: (opacity = 1) => `rgba(37,99,235,${opacity})`,
        strokeWidth: 2,
      },
    ],
  }), [plottedValues, hasData]);

  const lightChartConfig = useMemo(() => ({
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#f3f7fb',
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(11,26,31,${opacity})`,
    labelColor: (opacity = 1) => `rgba(80,95,102,${Math.max(0.5, opacity)})`,
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#ffffff', fill: '#2563eb' },
    style: { borderRadius: 12 },
    datasetColor: (opacity = 1) => `rgba(37,99,235,${opacity})`,
  }), []);

  const chartConfig = userChartConfig ? { ...lightChartConfig, ...userChartConfig } : lightChartConfig;

  // Rotation angle for labels
  const ROT_ANGLE = -45;

  // renderDotContent: uses plottedValues/plottedTimes
  const renderDotContent = ({ x, y, index }) => {
    const v = plottedValues[index];
    const t = plottedTimes[index];
    if (typeof v === 'undefined' && !t) return null;

    const n = plottedValues.length;
    let fontSizePpm = 11;
    if (n > 120) fontSizePpm = 9;
    else if (n > 80) fontSizePpm = 10;
    const scaledFontSizePpm = Math.max(8, Math.round(fontSizePpm * widthScale));

    let fontSizeTime = 10;
    if (n > 120) fontSizeTime = 8;
    else if (n > 80) fontSizeTime = 9;
    const scaledFontSizeTime = Math.max(8, Math.round(fontSizeTime * widthScale));

    // y for ppm label: place it a bit above the point
    const ppmY = y - Math.max(12, Math.round(14 * widthScale));

    // time label Y: place below chart area but above axis title — use effectiveLabelAreaHeight + extraBottomPadding
    const timeY = responsiveHeight + Math.floor((effectiveLabelAreaHeight + extraBottomPadding) * 0.35);

    const ppmTextColor = '#0b1a1f';
    const timeTextColor = '#6b7280';

    const ppmLabel = (v === null || typeof v === 'undefined' || Number.isNaN(Number(v))) ? '-' : String(v);
    const showTime = showTimeIndices.includes(index);

    // Show the PPM reading for every plotted point (restored to previous behavior)
    return (
      <Svg key={`label-${index}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {v !== undefined && (
          <SvgText
            x={x}
            y={ppmY}
            fill={ppmTextColor}
            fontSize={scaledFontSizePpm}
            textAnchor="middle"
            transform={`rotate(${ROT_ANGLE} ${x} ${ppmY})`}
            fontWeight="700"
          >
            {`${ppmLabel} PPM`}
          </SvgText>
        )}

        {showTime && t && (
          <SvgText
            x={x}
            y={timeY}
            fill={timeTextColor}
            fontSize={scaledFontSizeTime}
            textAnchor="middle"
            transform={`rotate(${ROT_ANGLE} ${x} ${timeY})`}
          >
            {t}
          </SvgText>
        )}
      </Svg>
    );
  };

  const wrapperHeight = responsiveHeight + effectiveLabelAreaHeight + extraBottomPadding;

  // When the Y axis title is rendered inside the ScrollView content, compute paddings excluding the axis width.
  const contentTotalWidth = effectiveYAxisWidth + chartInnerWidth;
  const contentPaddingLeft = newestOnLeft ? gapSize : 0;
  const contentPaddingRight = newestOnLeft ? 12 : (gapSize + 12);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: containerColor, minHeight: topPadding + responsiveHeight + effectiveLabelAreaHeight + extraBottomPadding },
        style,
      ]}
    >
      <ScrollView
        horizontal
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          width: contentTotalWidth,
          paddingLeft: contentPaddingLeft,
          paddingRight: contentPaddingRight,
        }}
      >
        {/* Row container so Y axis title is part of the scrollable content and thus moves with the chart */}
        <View style={{ width: contentTotalWidth, flexDirection: 'row', height: wrapperHeight }}>
          {/* Y axis title inside scrollable content (so it scrolls) */}
          {showAxisTitles && (
            <View
              style={{
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

          {/* Chart area */}
          <View style={{ width: chartInnerWidth, height: responsiveHeight + effectiveLabelAreaHeight + extraBottomPadding }}>
            <LineChart
              data={chartData}
              width={chartInnerWidth}
              height={responsiveHeight}
              chartConfig={chartConfig}
              bezier
              style={{
                borderRadius: 12,
                marginBottom: 0,
                paddingBottom: effectiveLabelAreaHeight + extraBottomPadding,
                paddingTop: topPadding,
              }}
              withInnerLines
              withOuterLines={false}
              fromZero
              segments={4}
              renderDotContent={renderDotContent}
              withDots={hasData}
              formatXLabel={() => ''}
              formatYLabel={() => ''}
            />
          </View>
        </View>
      </ScrollView>

      {/* Static X axis title (centered) */}
      {showAxisTitles && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: topPadding + responsiveHeight + Math.round(extraBottomPadding / 0.5),
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
function formatSmallTime12(iso) {
  if (!iso) return '';
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hh = String(hours).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} ${ampm}`;
}

function mapDatumToPoint(d) {
  if (!d) return { ts: null, value: null };
  const ts = d.ts ?? d.TIMESTAMP ?? null;
  const raw = (typeof d.value !== 'undefined') ? d.value : (d.rawValue ?? d.VALUE ?? null);
  let value = null;
  if (raw === null || raw === undefined) value = null;
  else if (typeof raw === 'number') value = raw;
  else {
    const parsed = Number(raw);
    value = Number.isNaN(parsed) ? null : parsed;
  }
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