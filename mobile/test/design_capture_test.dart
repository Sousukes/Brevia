import 'dart:io';
import 'dart:ui' as ui;

import 'package:brevia_mobile/app_model.dart';
import 'package:brevia_mobile/i18n.dart';
import 'package:brevia_mobile/main.dart';
import 'package:brevia_mobile/onboarding.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

// 显式启用才输出实际 Flutter 页面；字体路径由本机提供，不影响 CI。
void main() {
  final output = Platform.environment['BREVIA_MOBILE_CAPTURE_DIR'];
  testWidgets('capture implemented mobile surfaces without overflow', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final font = Platform.environment['BREVIA_CAPTURE_FONT'];
      if (font != null) {
        for (final family in ['Roboto', 'Ahem']) {
          await (FontLoader(family)..addFont(
                Future.value(
                  ByteData.sublistView(File(font).readAsBytesSync()),
                ),
              ))
              .load();
        }
      }
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    });
    uiLanguage = 'en';
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final boundary = GlobalKey();
    Future<void> capture(String name) async {
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.takeException(), isNull, reason: name);
      await tester.runAsync(() async {
        final image =
            await (boundary.currentContext!.findRenderObject()
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(
          '$output/$name.png',
        ).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    Future<void> show(Widget child) async {
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: KeyedSubtree(key: UniqueKey(), child: child),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
    }

    Directory(output!).createSync(recursive: true);
    final model = AppModel()..appearance = 'light';
    model.meetings.addAll([
      {
        'id': 'review',
        'title': 'Product review',
        'samples': 40512000,
        'state': 'ended',
        'finished': true,
        'count': 80,
        'uploaded': 80,
        'localOnly': true,
        'marks': [],
        'snapshot': {
          'notes':
              '## Decisions\n\nRelease the new onboarding next Friday.\n\n## Actions\n\n- Review the language choices.\n- Verify the Android download QR.',
          'segments': [
            {'start_ms': 0, 'text': 'Let us review progress from last week.'},
          ],
        },
      },
      {
        'id': 'pending',
        'title': 'Customer interview',
        'samples': 8064000,
        'state': 'ended',
        'finished': false,
        'count': 16,
        'uploaded': 0,
        'localOnly': true,
        'marks': [],
      },
    ]);
    await show(BreviaApp(model: model));
    await capture('mobile-library');
    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pumpAndSettle();
    await capture('mobile-prepare');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.laptop_outlined).last);
    await tester.pumpAndSettle();
    await capture('mobile-connection');
    await tester.tap(find.byIcon(Icons.settings_outlined).last);
    await tester.pumpAndSettle();
    await capture('mobile-settings');
    await tester.scrollUntilVisible(
      find.text('App language'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('App language'));
    await tester.pumpAndSettle();
    await capture('mobile-language');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();
    await capture('mobile-appearance');
    await show(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: breviaTheme(Brightness.light),
        home: SavedMeetingPage(model: model, id: 'review'),
      ),
    );
    await capture('mobile-review');
    model.live = {
      'id': 'live',
      'title': 'Product review',
      'samples': 12096000,
      'state': 'recording',
      'connected': false,
      'localOnly': true,
      'count': 24,
      'uploaded': 0,
      'marks': [],
      'snapshot': {
        'segments': [
          {'start_ms': 0, 'text': 'Let us review progress from last week.'},
          {
            'start_ms': 12000,
            'text':
                'The Android build is ready. We will verify the download QR and complete the onboarding review.',
          },
        ],
      },
    };
    model.serviceRunning = true;
    await show(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: breviaTheme(Brightness.light),
        home: MeetingPage(model: model, id: 'live'),
      ),
    );
    await capture('mobile-live');
    await tester.tap(find.byTooltip('Highlight'));
    await tester.pumpAndSettle();
    await capture('mobile-bookmark');
    await show(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: breviaTheme(Brightness.dark),
        home: MeetingPage(model: model, id: 'live'),
      ),
    );
    await capture('mobile-live-dark');
    await show(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: breviaTheme(Brightness.light),
        home: const OnboardingGate(child: SizedBox()),
      ),
    );
    await tester.pumpAndSettle();
    await capture('mobile-welcome');
    await tester.tap(find.text(tr('下一步')));
    await tester.pumpAndSettle();
    await capture('mobile-onboarding-connection');
    await tester.tap(find.text(tr('下一步')));
    await tester.pumpAndSettle();
    await capture('mobile-permissions');
    await tester.pumpWidget(const SizedBox());
    model.dispose();
  }, skip: output == null);
}
