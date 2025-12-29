import { useEffect, useMemo, type CSSProperties, type FC } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import type { MetricKey } from '../../experiments/GraphSettingsModal/GraphSettingsModal.types';
import type { MetricWeightsSliderProps } from './MetricWeightsSlider.types';

const metricColorTokens: Record<MetricKey, { solid: string; soft: string }> = {
  accuracy: { solid: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' },
  f1: { solid: '#10b981', soft: 'rgba(16, 185, 129, 0.16)' },
  rocAuc: { solid: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)' },
  ntps: { solid: '#14b8a6', soft: 'rgba(20, 184, 166, 0.16)' },
};

const clampMetricValue = (value: number): number => Math.min(100, Math.max(0, value));

const roundMetricValue = (value: number): number => Math.round(value * 100) / 100;

const parseMetricValue = (rawValue: string): number => {
  const normalized = rawValue.replace(',', '.').trim();
  if (normalized === '') return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return clampMetricValue(parsed);
};

const formatMetricValue = (value: number): string => {
  const fixed = value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const buildEqualWeights = (count: number): number[] => {
  if (count <= 0) return [];
  const base = roundMetricValue(100 / count);
  const weights = Array.from({ length: count }, () => base);
  const total = roundMetricValue(base * count);
  weights[count - 1] = roundMetricValue(weights[count - 1] + (100 - total));
  return weights;
};

const MetricWeightsSlider: FC<MetricWeightsSliderProps> = ({
  metrics,
  labels,
  metricKeys,
  onChange,
  disabled = false,
}) => {
  const metricCount = metricKeys.length;

  const normalizedWeights = useMemo(() => {
    const rawWeights = metricKeys.map((key) => parseMetricValue(metrics[key]));
    const total = rawWeights.reduce((sum, value) => sum + value, 0);
    if (metricCount === 0) return [];
    if (total <= 0) return buildEqualWeights(metricCount);

    const normalized =
      Math.abs(total - 100) > 0.01 ? rawWeights.map((value) => (value / total) * 100) : rawWeights;
    const rounded = normalized.map((value) => roundMetricValue(value));
    const roundedSum = roundMetricValue(rounded.reduce((sum, value) => sum + value, 0));
    if (roundedSum !== 100) {
      const lastIndex = rounded.length - 1;
      rounded[lastIndex] = clampMetricValue(
        roundMetricValue(rounded[lastIndex] + (100 - roundedSum))
      );
    }
    return rounded;
  }, [metricCount, metricKeys, metrics]);

  const normalizedMetrics = useMemo(() => {
    const result = {} as Record<MetricKey, string>;
    metricKeys.forEach((key, index) => {
      result[key] = formatMetricValue(normalizedWeights[index] ?? 0);
    });
    return result;
  }, [metricKeys, normalizedWeights]);

  const bounds = useMemo(() => {
    const result: number[] = [];
    let total = 0;
    metricKeys.slice(0, -1).forEach((_, index) => {
      total += normalizedWeights[index] ?? 0;
      result.push(total);
    });
    return result;
  }, [metricKeys, normalizedWeights]);

  const gradient = useMemo(() => {
    if (metricCount === 0) return 'rgba(15, 23, 42, 0.08)';
    let start = 0;
    const stops = metricKeys.map((key, index) => {
      const value = normalizedWeights[index] ?? 0;
      const end = Math.min(100, start + value);
      const color = metricColorTokens[key]?.solid ?? '#2563eb';
      const stop = `${color} ${start}% ${end}%`;
      start = end;
      return stop;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [metricCount, metricKeys, normalizedWeights]);

  const points = useMemo(() => {
    let start = 0;
    return metricKeys.map((key, index) => {
      const value = normalizedWeights[index] ?? 0;
      const center = clampMetricValue(start + value / 2);
      start += value;
      return { key, center };
    });
  }, [metricKeys, normalizedWeights]);

  const needsSync = useMemo(
    () =>
      metricKeys.some((key) => {
        const currentValue = formatMetricValue(roundMetricValue(parseMetricValue(metrics[key])));
        return currentValue !== normalizedMetrics[key];
      }),
    [metricKeys, metrics, normalizedMetrics]
  );

  useEffect(() => {
    if (!needsSync) return;
    onChange(normalizedMetrics);
  }, [needsSync, normalizedMetrics, onChange]);

  const handleChange = (value: number | number[]) => {
    if (!Array.isArray(value)) return;
    if (metricCount === 0) return;
    const nextBounds = value as number[];
    if (nextBounds.length !== Math.max(0, metricCount - 1)) return;

    const nextWeights = metricKeys.map((_, index) => {
      if (index === 0) return nextBounds[0] ?? 0;
      if (index < metricCount - 1) {
        return (nextBounds[index] ?? 0) - (nextBounds[index - 1] ?? 0);
      }
      return 100 - (nextBounds[metricCount - 2] ?? 0);
    });

    const roundedWeights = nextWeights.map((value) => roundMetricValue(clampMetricValue(value)));
    const roundedSum = roundMetricValue(roundedWeights.reduce((sum, value) => sum + value, 0));
    if (roundedSum !== 100 && roundedWeights.length > 0) {
      const lastIndex = roundedWeights.length - 1;
      roundedWeights[lastIndex] = clampMetricValue(
        roundMetricValue(roundedWeights[lastIndex] + (100 - roundedSum))
      );
    }

    const nextMetrics = {} as Record<MetricKey, string>;
    metricKeys.forEach((key, index) => {
      nextMetrics[key] = formatMetricValue(roundedWeights[index] ?? 0);
    });
    onChange(nextMetrics);
  };

  return (
    <div className="metric-weights">
      <div className="metric-weights-legend">
        {metricKeys.map((key) => {
          const colors = metricColorTokens[key];
          return (
            <div
              key={key}
              className="metric-weights-item"
              style={
                {
                  '--metric-color': colors.solid,
                  '--metric-soft': colors.soft,
                } as CSSProperties
              }
            >
              <span className="metric-weights-item-label">
                <span className="metric-weight-dot" />
                <span>{labels[key]}</span>
              </span>
              <span className="metric-weights-value">{normalizedMetrics[key]}%</span>
            </div>
          );
        })}
      </div>
      <div className="metric-weights-slider">
        <div className="metric-weights-points">
          {points.map((point) => {
            const colors = metricColorTokens[point.key];
            return (
              <span
                key={point.key}
                className="metric-weights-point"
                style={
                  {
                    left: `${point.center}%`,
                    '--metric-color': colors.solid,
                    '--metric-soft': colors.soft,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
        <Slider
          range
          min={0}
          max={100}
          step={0.01}
          value={bounds}
          allowCross={false}
          included={false}
          railStyle={{ background: gradient, height: 8, borderRadius: 999 }}
          trackStyle={{ backgroundColor: 'transparent' }}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default MetricWeightsSlider;
