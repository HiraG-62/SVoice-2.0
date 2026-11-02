export function useThemeColor() {
  const themeColor = 'teal';
  return {
    themeColor,
    themeColorLight: (level: number) => `${themeColor}-lighten-${level}`,
    themeColorDark: (level: number) => `${themeColor}-darken-${level}`,
  };
}
