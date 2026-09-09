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
          const SizedBox(height: 12),
          ...(bands?.fields.values ?? const <AirQualityField>[])
              .where((f) => f.key != 'Aqi')
              .map((f) => _readingRow(
                    '${f.label}${f.unit.isEmpty ? '' : ' (${f.unit})'}'
                    '${f.derived ? ' · derived' : ''}',
                    f.summary,
                  )),
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

  Widget _readingRow(String label, String breakdown) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF0F172A))),
          const SizedBox(height: 4),
          // Same readable style as the "Connecting a New Sensor" paragraph
          // (was 12.5 / #64748B, which the scanner struggled to detect).
          Text(breakdown,
              style: GoogleFonts.inter(
                  fontSize: 14, color: const Color(0xFF334155), height: 1.5)),
        ],
      ),
    );
  }
}
