import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/air_quality_bands.dart';

class HelpPage extends StatelessWidget {
  const HelpPage({super.key});

  @override
  Widget build(BuildContext context) {
    // Null until the first fetch lands; every section below degrades to a
    // "still loading" line rather than showing numbers this page invented.
    final bands = AirQualityBands.current;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('Help & Support',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _sectionTitle('Understanding AQI'),
          const SizedBox(height: 4),
          Text(
            'The overall Air Quality Index (AQI) shown on Home follows the '
            'Philippine national scale (DENR), grouped into six bands:',
            style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13),
          ),
          const SizedBox(height: 12),
          // Legend and per-sensor ranges both come from the canonical band
          // table the backend serves, so this page cannot describe one scale
          // while the gauge on Home colours by another.
          ...(bands?.categories ?? const <AqiCategory>[])
              .map((c) => _aqiLegendRow(c.color, c.name, c.range)),
          if (bands == null)
            Text(
              'Band details are still loading.',
              style: GoogleFonts.inter(color: const Color(0xFF5B6674), fontSize: 13),
            ),

          const SizedBox(height: 28),
          _sectionTitle('Sensor Readings Explained'),
          const SizedBox(height: 4),
          Text(
            'Tap a reading to see the bands it is graded against.',
            style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13),
          ),
          const SizedBox(height: 12),
          // One collapsible card per sensor field. The expanded body is the
          // same coloured dot + name + range table as "Understanding AQI"
          // above, built straight from the served band definitions.
          ...(bands?.fields.values ?? const <AirQualityField>[])
              .where((f) => f.key != 'Aqi')
              .map(_sensorTile),
          if (bands != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'CO₂ and formaldehyde are estimated by the sensor from its VOC '
                'element rather than measured directly — read them as trends.\n\n'
                'Sources: ${bands.source}',
                style: GoogleFonts.inter(
                    color: const Color(0xFF334155),
                    fontSize: 14,
                    height: 1.5),
              ),
            ),

          const SizedBox(height: 28),
          _sectionTitle('Connecting a New Sensor'),
          const SizedBox(height: 4),
          Text(
            'Go to the Connect tab and follow the setup steps to add a new '
            'BewAir sensor to your account. Connecting a new sensor is '
            'restricted to admin accounts.',
            style: GoogleFonts.inter(color: const Color(0xFF334155), fontSize: 14, height: 1.5),
          ),

          const SizedBox(height: 28),
          _sectionTitle('Need more help?'),
          const SizedBox(height: 4),
          Text(
            'Contact your school administrator for further assistance.',
            style: GoogleFonts.inter(color: const Color(0xFF334155), fontSize: 14, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) => Text(
        text,
        style: GoogleFonts.poppins(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: const Color(0xFF0F172A),
        ),
      );

  Widget _aqiLegendRow(Color color, String label, String range) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label,
                style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600, color: const Color(0xFF0F172A))),
          ),
          Text(range,
              style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF64748B))),
        ],
      ),
    );
  }

  // A tappable dropdown for one sensor reading. ExpansionTile handles the
  // expand/collapse state, the >=48dp tap target and the a11y "expanded /
  // collapsed" announcement on its own — no manual Semantics needed.
  Widget _sensorTile(AirQualityField f) {
    final title = '${f.label}${f.unit.isEmpty ? '' : ' (${f.unit})'}'
        '${f.derived ? ' · derived' : ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: ExpansionTile(
        // Empty borders kill the default divider lines ExpansionTile draws
        // above and below itself when expanded.
        shape: const Border(),
        collapsedShape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 16),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        iconColor: const Color(0xFF64748B),
        collapsedIconColor: const Color(0xFF64748B),
        textColor: const Color(0xFF0F172A),
        collapsedTextColor: const Color(0xFF0F172A),
        title: Text(
          title,
          style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF0F172A)),
        ),
        children: [
          ...f.bands.map((b) => _aqiLegendRow(b.color, b.level, _bandRange(b))),
          if (f.note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              f.note,
              style: GoogleFonts.inter(
                  fontSize: 13, color: const Color(0xFF64748B), height: 1.45),
            ),
          ],
        ],
      ),
    );
  }
}

String _fmtNum(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

// Mirrors AqiCategory.range, but sensor bands can be open-ended on either side
// (JSON has no infinity, so min/max come through as null).
String _bandRange(AirQualityBand b) {
  if (b.min == null) return '< ${_fmtNum(b.max!)}';
  if (b.max == null) return '> ${_fmtNum(b.min!)}';
  return '${_fmtNum(b.min!)}–${_fmtNum(b.max!)}';
}
