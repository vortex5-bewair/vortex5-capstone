import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/pages/splash_page.dart';

/// Keeps the semantics tree built for the whole app lifetime. Flutter builds it
/// lazily — only while an assistive service it recognises is active — so static
/// a11y auditors like Google Accessibility Scanner otherwise see bare pixels and
/// flag every Text as "unexposed". Held in a library-level field so the GC never
/// finalises it: discarding the handle is what disposes it, which would tear the
/// semantics tree back down mid-session.
// ignore: unused_element
late final SemanticsHandle _semanticsHandle;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  _semanticsHandle = SemanticsBinding.instance.ensureSemantics();

  // Poppins + Inter ship under assets/google_fonts/ (see pubspec.yaml), so
  // every GoogleFonts.poppins()/inter() call resolves from the app bundle.
  // Turning runtime fetching off removes the HTTP GET + on-UI-isolate TTF
  // parse that otherwise fired the first time each screen used a weight — a
  // visible CPU spike mid-navigation.
  GoogleFonts.config.allowRuntimeFetching = false;

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
