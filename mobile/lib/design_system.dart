import 'dart:io';
import 'package:flutter/material.dart';
import 'design_icons.dart';

// 桌面与手机使用同一语义色板，控件大小遵循原生触控约定。
ThemeData breviaTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final fontFamily = Platform.isIOS ? '.SF Pro Text' : 'Roboto';
  final ink = dark ? Color(0xfff2f2f2) : Color(0xff222222);
  final canvas = dark ? Color(0xff191919) : Color(0xffffffff);
  final muted = dark ? Color(0xffb0b0b0) : Color(0xff666666);
  final line = dark ? Color(0xff4a4a4a) : Color(0xffd6d6d6);
  final sheet = dark ? Color(0xff242424) : Colors.white;
  final scheme = ColorScheme.fromSeed(seedColor: ink, brightness: brightness)
      .copyWith(
        primary: ink,
        onPrimary: canvas,
        primaryContainer: dark ? Color(0xff303030) : Color(0xfff2f2f2),
        onPrimaryContainer: ink,
        secondary: ink,
        onSecondary: canvas,
        secondaryContainer: dark ? Color(0xff303030) : Color(0xfff2f2f2),
        onSecondaryContainer: ink,
        tertiary: ink,
        onTertiary: canvas,
        tertiaryContainer: dark ? Color(0xff303030) : Color(0xfff2f2f2),
        onTertiaryContainer: ink,
        inverseSurface: ink,
        onInverseSurface: canvas,
        surface: canvas,
        surfaceContainerLowest: dark ? Color(0xff151515) : Color(0xfffafafa),
        surfaceContainerLow: dark ? Color(0xff242424) : Color(0xfffafafa),
        surfaceContainer: dark ? Color(0xff242424) : Color(0xfff2f2f2),
        surfaceContainerHigh: dark ? Color(0xff303030) : Color(0xfff2f2f2),
        surfaceContainerHighest: dark ? Color(0xff303030) : Color(0xffeaeaea),
        onSurface: ink,
        onSurfaceVariant: muted,
        outline: line,
        outlineVariant: line,
        surfaceTint: Colors.transparent,
        error: dark ? Color(0xffed9494) : Color(0xffa83b3b),
      );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: canvas,
    fontFamily: fontFamily,
  );
  return base.copyWith(
    iconTheme: IconThemeData(color: ink, size: 24),
    splashFactory: NoSplash.splashFactory,
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) => const BreviaIcon(Icons.chevron_left),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: ink,
      linearTrackColor: dark ? Color(0xff4a4a4a) : Color(0xffe5e5e9),
      linearMinHeight: 6,
      borderRadius: BorderRadius.circular(3),
      trackGap: 0,
      stopIndicatorRadius: 0,
    ),
    sliderTheme: SliderThemeData(
      trackHeight: 3,
      activeTrackColor: ink,
      inactiveTrackColor: line,
      thumbColor: ink,
      thumbShape: const RoundSliderThumbShape(
        enabledThumbRadius: 3,
        disabledThumbRadius: 3,
      ),
      overlayShape: SliderComponentShape.noOverlay,
      trackShape: const RoundedRectSliderTrackShape(),
      padding: EdgeInsets.zero,
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(minimumSize: Size(48, 48)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: sheet,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        side: WidgetStatePropertyAll(BorderSide(color: line)),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: canvas,
      foregroundColor: ink,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontFamily: fontFamily,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    textTheme: base.textTheme
        .copyWith(
          headlineLarge: TextStyle(
            fontSize: 32,
            height: 1.25,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          headlineSmall: TextStyle(
            fontSize: 24,
            height: 1.4,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          titleLarge: TextStyle(
            fontSize: 20,
            height: 1.4,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          bodySmall: TextStyle(
            fontSize: 14,
            height: 1.5,
            fontWeight: FontWeight.w500,
            color: muted,
          ),
          bodyLarge: TextStyle(
            fontSize: 17,
            height: 1.55,
            fontWeight: FontWeight.w500,
            color: ink,
          ),
          bodyMedium: TextStyle(
            fontSize: 16,
            height: 1.5,
            fontWeight: FontWeight.w500,
            color: ink,
          ),
        )
        .apply(fontFamily: fontFamily),
    dividerTheme: DividerThemeData(
      color: dark ? Color(0xff4a4a4a) : Color(0xffd6d6d6),
      thickness: 1,
      space: 32,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: canvas,
      contentPadding: EdgeInsets.all(16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: ink),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: Size(48, 52),
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        textStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: Size(48, 52),
        foregroundColor: ink,
        side: BorderSide(color: line),
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        textStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: Size(48, 48),
        foregroundColor: ink,
        textStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: sheet,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: ink,
      contentPadding: EdgeInsets.zero,
      minVerticalPadding: 14,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: canvas,
      height: 64,
      elevation: 0,
      indicatorColor: Colors.transparent,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected) ? ink : muted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          color: states.contains(WidgetState.selected) ? ink : muted,
        ),
      ),
    ),
  );
}

Widget breviaLogo({double size = 32}) => Image.asset(
  'assets/brevia-logo.png',
  width: size,
  height: size,
  fit: BoxFit.contain,
  semanticLabel: 'Brevia',
);
