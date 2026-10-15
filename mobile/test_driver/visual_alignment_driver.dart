import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';

import '../test/visual_capture_provenance.dart';

Future<void> main() async {
  final output = Directory(
    Platform.environment['BREVIA_MOBILE_NATIVE_CAPTURE_DIR'] ??
        '../output/playwright/layout-style-comparison/captures/mobile-native',
  );
  output.createSync(recursive: true);
  final sources = captureSources();
  final screenshots = <String>[];
  final runFile = File('${output.path}/capture-run.json');
  if (runFile.existsSync()) runFile.deleteSync();
  await integrationDriver(
    responseDataCallback: (_) async {
      writeCaptureRun(output, sources, screenshots, {
        'method': 'Flutter integration_test native iOS engine screenshot',
        'simulator': Platform.environment['BREVIA_SIMULATOR_UDID'],
        'font': 'iOS system fonts; no injected host font',
        'systemChrome':
            'host screenshot after test completion is black; system chrome excluded',
        'fixtures': 'isolated AppModel; no recording or pairing traffic',
      });
    },
    onScreenshot: (name, bytes, [args]) async {
      await File('${output.path}/$name.png').writeAsBytes(bytes);
      screenshots.add('$name.png');
      return true;
    },
  );
}
