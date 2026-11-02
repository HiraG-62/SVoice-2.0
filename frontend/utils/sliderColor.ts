const LEVEL_COLORS = [
  { below: 0.2, color: 'indigo' }, { below: 0.4, color: 'teal' },
  { below: 0.6, color: 'green' }, { below: 0.8, color: 'orange' },
];

export function sliderColor(value: number, maximum: number) {
  if (value === 0) return 'grey';
  return LEVEL_COLORS.find(level => value < maximum * level.below)?.color ?? 'red';
}
