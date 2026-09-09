/// Rewrites unit symbols and typographic characters that screen readers (and
/// OCR-based auditors like Google Accessibility Scanner) handle poorly into a
/// plain spoken form.
///
/// Use the result as a `semanticsLabel:` on a `Text` / `TextSpan` — the visible
/// text keeps the original glyphs (µg/m³, CO₂, °C, ≤, ·, —), only the announced
/// version is plain.
String spokenAirText(String s) {
  return s
      // Compound units first, before the single-glyph fallbacks below.
      .replaceAll('µg/m³', 'micrograms per cubic meter')
      .replaceAll('µg/m3', 'micrograms per cubic meter')
      .replaceAll('μg/m³', 'micrograms per cubic meter') // Greek small mu
      .replaceAll('°C', 'degrees Celsius')
      .replaceAll('CO₂', 'carbon dioxide')
      .replaceAll('CO2', 'carbon dioxide')
      .replaceAll('ppm', 'parts per million')
      // Leftover single glyphs.
      .replaceAll('₂', '2')
      .replaceAll('³', ' cubed')
      .replaceAll('²', ' squared')
      .replaceAll('≤', 'less than or equal to ')
      .replaceAll('≥', 'greater than or equal to ')
      // Typographic separators that screen readers skip or mispronounce.
      .replaceAll(' · ', ', ')
      .replaceAll('·', ', ')
      .replaceAll(' — ', ', ')
      .replaceAll('—', ', ')
      .replaceAll('–', ', ');
}
