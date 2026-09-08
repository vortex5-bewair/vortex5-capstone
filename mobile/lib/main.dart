import 'package:flutter/material.dart';
import 'package:vortex5_application_2/pages/splash_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
