import 'package:flutter/material.dart';

/// 沿用Icon语义与IconData，让已有按钮、主题和测试继续使用原入口。
class BreviaIcon extends Icon {
  const BreviaIcon(
    super.icon, {
    super.key,
    super.size,
    super.color,
    super.semanticLabel,
    super.textDirection,
  });

  @override
  Widget build(BuildContext context) {
    final path = _iconPath(icon);
    if (path == null) return super.build(context);
    final theme = IconTheme.of(context);
    final ink = color ?? theme.color ?? Theme.of(context).colorScheme.onSurface;
    return Semantics(
      label: semanticLabel,
      child: ExcludeSemantics(
        child: Center(
          widthFactor: 1,
          heightFactor: 1,
          child: SizedBox.square(
            dimension: size ?? theme.size ?? 24,
            child: CustomPaint(
              painter: _IconPainter(
                path,
                ink.withValues(alpha: ink.a * (theme.opacity ?? 1)),
                icon == Icons.play_arrow ||
                    icon == Icons.pause ||
                    icon == Icons.stop_rounded,
                (icon?.matchTextDirection ?? false) &&
                    (textDirection ?? Directionality.of(context)) ==
                        TextDirection.rtl,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Path? _iconPath(IconData? icon) {
  final p = Path();
  switch (icon) {
    case Icons.article_outlined || Icons.description_outlined:
      p.moveTo(14, 2);
      p.lineTo(6, 2);
      p.quadraticBezierTo(4, 2, 4, 4);
      p.lineTo(4, 20);
      p.quadraticBezierTo(4, 22, 6, 22);
      p.lineTo(18, 22);
      p.quadraticBezierTo(20, 22, 20, 20);
      p.lineTo(20, 8);
      p.close();
      p.moveTo(14, 2);
      p.lineTo(14, 8);
      p.lineTo(20, 8);
      p.moveTo(8, 13);
      p.lineTo(16, 13);
      p.moveTo(8, 17);
      p.lineTo(14, 17);
    case Icons.mic_none || Icons.mic_none_outlined:
      p.addRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(9, 2, 6, 13),
          const Radius.circular(3),
        ),
      );
      p.moveTo(5, 10);
      p.lineTo(5, 12);
      p.cubicTo(5, 21, 19, 21, 19, 12);
      p.lineTo(19, 10);
      p.moveTo(12, 19);
      p.lineTo(12, 22);
      p.moveTo(8, 22);
      p.lineTo(16, 22);
    case Icons.laptop_outlined || Icons.computer_outlined:
      p.addRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(4, 3, 16, 14),
          const Radius.circular(2),
        ),
      );
      p.moveTo(2, 17);
      p.lineTo(22, 17);
      p.lineTo(22, 20);
      p.lineTo(2, 20);
      p.close();
    case Icons.phone_iphone_outlined || Icons.smartphone_outlined:
      p.addRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(6, 2, 12, 20),
          const Radius.circular(2),
        ),
      );
      p.moveTo(10, 18);
      p.lineTo(14, 18);
    case Icons.search:
      p.addOval(const Rect.fromLTWH(3, 3, 14, 14));
      p.moveTo(15, 15);
      p.lineTo(21, 21);
    case Icons.chevron_left || Icons.arrow_back_ios_new:
      p.moveTo(15, 5);
      p.lineTo(8, 12);
      p.lineTo(15, 19);
    case Icons.chevron_right:
      p.moveTo(9, 5);
      p.lineTo(16, 12);
      p.lineTo(9, 19);
    case Icons.expand_more || Icons.keyboard_arrow_down:
      p.moveTo(5, 9);
      p.lineTo(12, 16);
      p.lineTo(19, 9);
    case Icons.add:
      p.moveTo(12, 4);
      p.lineTo(12, 20);
      p.moveTo(4, 12);
      p.lineTo(20, 12);
    case Icons.close:
      p.moveTo(6, 6);
      p.lineTo(18, 18);
      p.moveTo(18, 6);
      p.lineTo(6, 18);
    case Icons.check:
      p.moveTo(5, 12);
      p.lineTo(10, 17);
      p.lineTo(20, 7);
    case Icons.bookmark_border:
      p.moveTo(6, 3);
      p.lineTo(18, 3);
      p.lineTo(18, 21);
      p.lineTo(12, 17);
      p.lineTo(6, 21);
      p.close();
    case Icons.play_arrow:
      p.moveTo(8, 5);
      p.lineTo(19, 12);
      p.lineTo(8, 19);
      p.close();
    case Icons.pause:
      p.addRect(const Rect.fromLTWH(6, 5, 4, 14));
      p.addRect(const Rect.fromLTWH(14, 5, 4, 14));
    case Icons.stop_rounded:
      p.addRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(5, 5, 14, 14),
          const Radius.circular(2),
        ),
      );
    case Icons.ios_share || Icons.upload_outlined:
      p.moveTo(12, 16);
      p.lineTo(12, 2);
      p.moveTo(7, 7);
      p.lineTo(12, 2);
      p.lineTo(17, 7);
      p.moveTo(4, 12);
      p.lineTo(4, 21);
      p.lineTo(20, 21);
      p.lineTo(20, 12);
    case Icons.storage_outlined:
      p.addOval(const Rect.fromLTWH(4, 2, 16, 6));
      p.moveTo(4, 5);
      p.lineTo(4, 19);
      p.cubicTo(4, 23, 20, 23, 20, 19);
      p.lineTo(20, 5);
      p.moveTo(4, 12);
      p.cubicTo(4, 16, 20, 16, 20, 12);
    case Icons.shield_outlined || Icons.privacy_tip_outlined:
      p.moveTo(12, 2);
      p.lineTo(21, 6);
      p.lineTo(20, 14);
      p.quadraticBezierTo(18, 20, 12, 22);
      p.quadraticBezierTo(6, 20, 4, 14);
      p.lineTo(3, 6);
      p.close();
      p.moveTo(8, 12);
      p.lineTo(11, 15);
      p.lineTo(16, 9);
    case Icons.settings_outlined:
      p.moveTo(9, 2);
      p.lineTo(15, 2);
      p.lineTo(16, 5);
      p.lineTo(19, 6);
      p.lineTo(22, 9);
      p.lineTo(20, 12);
      p.lineTo(22, 15);
      p.lineTo(19, 18);
      p.lineTo(16, 19);
      p.lineTo(15, 22);
      p.lineTo(9, 22);
      p.lineTo(8, 19);
      p.lineTo(5, 18);
      p.lineTo(2, 15);
      p.lineTo(4, 12);
      p.lineTo(2, 9);
      p.lineTo(5, 6);
      p.lineTo(8, 5);
      p.close();
      p.addOval(const Rect.fromLTWH(8, 8, 8, 8));
    case Icons.language:
      p.addOval(const Rect.fromLTWH(2, 2, 20, 20));
      p.addOval(const Rect.fromLTWH(7, 2, 10, 20));
      p.moveTo(2, 12);
      p.lineTo(22, 12);
    case Icons.camera_alt_outlined:
      p.moveTo(3, 6);
      p.lineTo(8, 6);
      p.lineTo(10, 3);
      p.lineTo(14, 3);
      p.lineTo(16, 6);
      p.lineTo(21, 6);
      p.lineTo(21, 21);
      p.lineTo(3, 21);
      p.close();
      p.addOval(const Rect.fromLTWH(8, 9, 8, 8));
    case Icons.info_outline || Icons.help_outline:
      p.addOval(const Rect.fromLTWH(2, 2, 20, 20));
      if (icon == Icons.info_outline) {
        p.moveTo(12, 7);
        p.lineTo(12, 7.2);
        p.moveTo(12, 11);
        p.lineTo(12, 17);
      } else {
        p.moveTo(8, 8);
        p.cubicTo(8, 4, 17, 4, 17, 9);
        p.cubicTo(17, 12, 12, 11, 12, 15);
        p.moveTo(12, 18);
        p.lineTo(12, 18.2);
      }
    default:
      return null;
  }
  return p;
}

class _IconPainter extends CustomPainter {
  final Path path;
  final Color color;
  final bool filled, mirrored;
  const _IconPainter(this.path, this.color, this.filled, this.mirrored);
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    if (mirrored) {
      canvas.translate(24, 0);
      canvas.scale(-1, 1);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = filled ? PaintingStyle.fill : PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_IconPainter old) =>
      old.path != path ||
      old.color != color ||
      old.mirrored != mirrored ||
      old.filled != filled;
}
