import 'package:brevia_mobile/app_model.dart';
import 'package:brevia_mobile/i18n.dart';
import 'package:brevia_mobile/main.dart';
import 'package:brevia_mobile/onboarding.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native mobile layouts use safe areas and production controls', (
    tester,
  ) async {
    uiLanguage = 'zh';
    SharedPreferences.setMockInitialValues({});
    final model = AppModel()..appearance = 'light';
    addTearDown(model.dispose);
    Future<void> capture(String name) async {
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.takeException(), isNull, reason: name);
      // 原生截图需要等GPU完成当前帧，避免捕获前一个状态。
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await binding.takeScreenshot(name);
    }

    Future<void> show(
      Widget child, {
      Brightness brightness = Brightness.light,
    }) async {
      final pushed = child is! OnboardingGate;
      await tester.pumpWidget(
        MaterialApp(
          key: UniqueKey(),
          debugShowCheckedModeBanner: false,
          theme: breviaTheme(brightness),
          home: pushed ? const SizedBox() : child,
        ),
      );
      if (pushed) {
        tester
            .state<NavigatorState>(find.byType(Navigator).first)
            .push(MaterialPageRoute<void>(builder: (_) => child));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
      }
    }

    await show(const OnboardingGate(child: SizedBox()));
    await capture('ios-welcome');
    await tester.tap(find.text('开始使用'));
    await capture('ios-onboarding-privacy');
    await tester.tap(find.text('继续'));
    await capture('ios-onboarding-permissions');
    await tester.pumpWidget(BreviaApp(model: model));
    await capture('ios-library-empty');
    model.meetings = [
      {
        'id': 'visual',
        'title': '产品周会',
        'samples': 40512000,
        'state': 'ended',
        'finished': true,
        'count': 80,
        'uploaded': 80,
        'localOnly': false,
        'created': DateTime.now()
            .copyWith(hour: 10, minute: 0)
            .toIso8601String(),
        'marks': <Map<String, dynamic>>[],
        'snapshot': {
          'notes': '## 决定\n\n核对新用户引导。',
          'segments': [
            {'start_ms': 0, 'text': '先回顾项目进展。'},
          ],
        },
      },
    ];
    model.notifyListeners();
    await capture('ios-library');
    await tester.tap(find.byIcon(Icons.add).first);
    await capture('ios-prepare');
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.laptop_outlined).last);
    await capture('ios-connection');
    await tester.tap(find.byIcon(Icons.settings_outlined).last);
    await capture('ios-settings');
    await show(MeetingPage(model: model, id: 'visual'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('笔记'));
    await capture('ios-review-notes');
    await tester.tap(find.text('转写'));
    await capture('ios-review-transcript');
    model.live = {
      'id': 'native-live',
      'title': '产品周会',
      'samples': 12096000,
      'state': 'recording',
      'connected': true,
      'localOnly': false,
      'count': 24,
      'uploaded': 24,
      'marks': <Map<String, dynamic>>[],
      'snapshot': {
        'samples': 12096000,
        'notes': '## 决定\n\n下周确认发布计划。',
        'segments': [
          {'start_ms': 0, 'text': '先回顾项目进展，再确认下一步计划。'},
        ],
      },
    };
    model.serviceRunning = true;
    await show(MeetingPage(model: model, id: 'native-live'));
    await capture('ios-live');
    await tester.tap(find.text('笔记'));
    await capture('ios-live-notes');
    await tester.tap(find.byTooltip('重点'));
    await capture('ios-bookmark');
    await tester.tap(find.byTooltip('取消'));
    await tester.pump(const Duration(milliseconds: 500));
    model.live!['localOnly'] = true;
    model.live!['snapshot'] = <String, dynamic>{};
    model.notifyListeners();
    await capture('ios-offline');
    model.live!['localOnly'] = false;
    model.live!['snapshot'] = {
      'samples': 12096000,
      'notes': '## 决定\n\n下周确认发布计划。',
      'segments': [
        {'start_ms': 0, 'text': '先回顾项目进展，再确认下一步计划。'},
      ],
    };
    await show(
      MeetingPage(model: model, id: 'native-live'),
      brightness: Brightness.dark,
    );
    await capture('ios-live-dark');
    await show(
      PrepareMeetingPage(
        computer: 'MacBook Pro',
        options: {
          'languages': ['zh'],
          'workspaces': [
            {'id': 'product', 'name': '产品'},
          ],
          'models': [
            {
              'id': 'fun-asr',
              'name': 'Fun-ASR-Nano',
              'status': 'ready',
              'languages': ['zh'],
            },
          ],
        },
      ),
    );
    await capture('ios-prepare-connected');
    await tester.pumpWidget(const SizedBox());
  });
}
