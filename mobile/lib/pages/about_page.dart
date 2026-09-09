import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('About',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.asset(
                'assets/images/bewair_logo_black.png',
                width: 72,
                height: 72,
                fit: BoxFit.contain,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              'BewAir',
              style: GoogleFonts.poppins(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: const Color(0xFF0F172A),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              'Version 1.0.0',
              style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            'What is BewAir?',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'BewAir is an IoT-based indoor air quality monitoring system built '
            'for schools. It helps teachers and administrators track classroom '
            'air quality in real time — particulate matter, CO₂, TVOC, '
            'temperature, and humidity — and respond quickly to health and '
            'safety concerns.',
            style: GoogleFonts.inter(
              color: const Color(0xFF334155),
              fontSize: 14,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'BewAir is a capstone project, developed to give school staff a '
            'simple, connected way to keep an eye on the air their students '
            'and colleagues breathe every day.',
            style: GoogleFonts.inter(
              color: const Color(0xFF334155),
              fontSize: 14,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
