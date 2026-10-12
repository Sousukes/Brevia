import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'i18n.dart';
import 'pairing_illustration.dart';

/// 引导仅保存本机展示偏好，不请求录音、相机或连接权限。
class OnboardingGate extends StatefulWidget {
  final Widget child;
  const OnboardingGate({super.key, required this.child});
  @override
  State<OnboardingGate> createState() => _OnboardingGateState();
}

class _OnboardingGateState extends State<OnboardingGate> {
  bool? complete;
  int step = 0;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((prefs) {
      if (mounted) {
        setState(() => complete = prefs.getBool('onboardingComplete') ?? false);
      }
    });
  }

  Future<void> finish() async {
    if (saving) return;
    setState(() => saving = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('onboardingComplete', true);
      if (mounted) setState(() => complete = true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(tr('重试'))));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (complete == true) return widget.child;
    if (complete == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final titles = ['手机录音，电脑转写。', '手机采集音频，电脑完成转写', '按需授权'];
    final descriptions = [
      '无需连接电脑。录音保存在本机，连接后由你主动上传。',
      '转写和笔记会回到这里。',
      '仅在需要时申请权限，保护你的隐私。',
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Brevia'),
        centerTitle: false,
        leading: step == 0
            ? null
            : BackButton(onPressed: () => setState(() => step--)),
        actions: [
          TextButton(onPressed: saving ? null : finish, child: Text(tr('稍后'))),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (step == 0) ...[
              Center(
                child: Text(
                  "Brevia",
                  style: Theme.of(
                    context,
                  ).textTheme.headlineLarge?.copyWith(fontSize: 40),
                ),
              ),
              const SizedBox(height: 40),
              const Center(child: PairingIllustration()),
              const SizedBox(height: 40),
            ],
            if (step == 1)
              Icon(
                [
                  Icons.mic_none,
                  Icons.devices_outlined,
                  Icons.shield_outlined,
                ][step],
                size: 64,
              ),
            SizedBox(height: step == 2 ? 16 : 40),
            Text(
              tr(titles[step]),
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 20),
            Text(
              tr(descriptions[step]),
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 40),
            if (step == 1) ...[
              ListTile(
                leading: const Icon(Icons.phone_iphone_outlined),
                title: Text(tr('仅保存在手机')),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.laptop_outlined),
                title: Text(tr('连接电脑')),
              ),
            ],
            if (step == 2) ...[
              for (final permission in [
                (Icons.mic_none, '麦克风', '用于录制会议音频。', '首次录音时申请。'),
                (Icons.wifi_outlined, '本地网络', '用于发现和连接电脑。', '连接电脑时申请。'),
                (Icons.camera_alt_outlined, '相机', '仅用于扫描配对二维码。', '首次扫码时申请。'),
              ])
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    border: Border.all(color: Theme.of(context).dividerColor),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerLow,
                        ),
                        child: Icon(permission.$1, size: 28),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              tr(permission.$2),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              tr(permission.$3),
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              tr(permission.$4),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      tr('可以使用手动配对，不必开启相机。'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: saving
                      ? null
                      : step == 2
                      ? finish
                      : () => setState(() => step++),
                  child: Text(tr(step == 2 ? '我知道了' : '下一步')),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  3,
                  (index) => Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: index == step
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).dividerColor,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
