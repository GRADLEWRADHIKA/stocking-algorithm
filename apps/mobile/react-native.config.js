/**
 * Fonts (Public Sans + JetBrains Mono, SIL OFL 1.1 — licences beside the TTFs).
 * Linked with `npx react-native-asset`, which copies them to android/app/src/main/assets/fonts
 * and adds them to the iOS project + Info.plist UIAppFonts.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
