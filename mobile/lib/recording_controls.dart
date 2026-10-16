import 'design_icons.dart';

import 'package:flutter/material.dart';

import 'i18n.dart';

/// 只展示状态和发送动作；录音、传输和错误处理仍由会议控制器负责。
class RecordingControls extends StatelessWidget {
  final bool paused, pending;
  final bool localOnly;
  final VoidCallback onPause, onEnd;
  final VoidCallback? onMark;
  const RecordingControls({
    super.key,
    required this.paused,
    required this.pending,
    required this.onPause,
    required this.onEnd,
    this.onMark,
    this.localOnly = false,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    Widget control(
      String label,
      IconData icon,
      VoidCallback? action, {
      bool danger = false,
    }) => IconButton.filledTonal(
      tooltip: label,
      onPressed: pending ? null : action,
      icon: BreviaIcon(icon, size: 28),
      style: IconButton.styleFrom(
        minimumSize: const Size(64, 64),
        backgroundColor: danger
            ? localOnly
                  ? Colors.transparent
                  : dark
                  ? Colors.white
                  : const Color(0xffff3b30)
            : colors.surface,
        foregroundColor: danger
            ? localOnly || dark
                  ? const Color(0xffff3b30)
                  : Colors.white
            : colors.onSurface,
        side: danger
            ? localOnly
                  ? const BorderSide(color: Color(0xffff3b30))
                  : BorderSide.none
            : BorderSide(color: colors.outlineVariant),
      ),
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        control(
          tr(paused ? '继续' : '暂停'),
          paused ? Icons.play_arrow : Icons.pause,
          onPause,
        ),
        control(tr('重点'), Icons.bookmark_border, onMark),
        control(tr('结束'), Icons.stop_rounded, onEnd, danger: true),
      ],
    );
  }
}

class MicrophoneLevel extends StatelessWidget {
  final double level;
  const MicrophoneLevel({super.key, required this.level});

  @override
  Widget build(BuildContext context) {
    final active = (level.clamp(0.0, 1.0) * 16).ceil();
    return Semantics(
      label: tr('输入音量'),
      value: '${(level.clamp(0.0, 1.0) * 100).round()}%',
      child: SizedBox(
        width: 160,
        height: 12,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < 16; i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: ColoredBox(
                    color: i < active
                        ? Theme.of(context).brightness == Brightness.dark
                              ? const Color(0xff80c99a)
                              : const Color(0xff16812e)
                        : Theme.of(context).colorScheme.outline,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
