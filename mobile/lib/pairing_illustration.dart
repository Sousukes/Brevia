import 'package:flutter/material.dart';

class PairingIllustration extends StatelessWidget {
  const PairingIllustration({super.key});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: CustomPaint(
      size: Size(280, 140),
      painter: _PairingPainter(
        Theme.of(context).colorScheme.onSurface,
        Theme.of(context).dividerColor,
      ),
    ),
  );
}

class _PairingPainter extends CustomPainter {
  final Color ink, line;
  const _PairingPainter(this.ink, this.line);
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(8, 20, 52, 102),
        Radius.circular(8),
      ),
      stroke,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(154, 18, 118, 92),
        Radius.circular(3),
      ),
      stroke,
    );
    canvas.drawPath(
      Path()
        ..moveTo(140, 112)
        ..lineTo(280, 112)
        ..lineTo(274, 119)
        ..lineTo(146, 119)
        ..close(),
      stroke,
    );
    final red = Paint()
      ..color = Color(0xffff3b30)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(30, 55, 9, 21), Radius.circular(5)),
      Paint()..color = red.color,
    );
    canvas.drawArc(Rect.fromLTWH(25, 61, 19, 23), 0, 3.14159, false, red);
    canvas.drawLine(Offset(34.5, 84), Offset(34.5, 91), red);
    canvas.drawLine(Offset(29, 92), Offset(40, 92), red);
    final muted = Paint()
      ..color = ink.withValues(alpha: .25)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < 3; i++) {
      canvas.drawCircle(
        Offset(85 + i * 16, 72),
        2.5,
        Paint()..color = muted.color,
      );
      canvas.drawLine(
        Offset(180, 48 + i * 15),
        Offset(i == 2 ? 232 : 249, 48 + i * 15),
        muted,
      );
    }
  }

  @override
  bool shouldRepaint(_PairingPainter old) => old.ink != ink || old.line != line;
}
