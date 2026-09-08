import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/pages/splash_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Nothing is bundled, so google_fonts fetches Poppins + Inter over HTTP and
  // parses the TTF the first time a screen uses each weight — a visible CPU
  // spike mid-navigation. Kick those loads off now, during the splash, instead
  // (fire-and-forget; a no-op once they're cached to disk). The proper fix is
  // to bundle the .ttf files and set allowRuntimeFetching = false.
  GoogleFonts.pendingFonts([
    GoogleFonts.poppins(),
    GoogleFonts.poppins(fontWeight: FontWeight.w600),
    GoogleFonts.poppins(fontWeight: FontWeight.w700),
    GoogleFonts.poppins(fontWeight: FontWeight.w800),
    GoogleFonts.inter(),
    GoogleFonts.inter(fontWeight: FontWeight.w600),
    GoogleFonts.inter(fontWeight: FontWeight.w700),
  ]);

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      // The default hint colour (black38) fails WCAG AA contrast on the pale
      // field fills used across the app. One darker default here fixes every
      // TextField placeholder without touching each page's _fieldDeco.
      theme: ThemeData(
        inputDecorationTheme: const InputDecorationTheme(
          hintStyle: TextStyle(color: Color(0xFF5B6674)),
        ),
      ),
      home: const SplashPage(),
    );
  }
}
