export interface MacroTranslationResult {
  code: string;
  changed: boolean;
}

const TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bApplication\.ActiveSheet\b/g, "ActiveSheet"],
  [/\bApplication\.ActiveWorkbook\b/g, "ActiveWorkbook"],
  [/\bActiveWorkbook\.ActiveSheet\b/g, "ActiveSheet"],
  [/\bApplication\.Range\s*\(/g, "Range("],
  [/(?<![\w$.])Cells\s*\(/g, "ActiveSheet.Cells("],
  [/(?<![\w$.])Columns\s*\(/g, "ActiveSheet.Columns("],
  [/(?<![\w$.])Rows\s*\(/g, "ActiveSheet.Rows("],
  [/\.Value\b/g, ".Value2"]
];

export function translateMacroCode(source: string): MacroTranslationResult {
  let code = source;
  for (const [pattern, replacement] of TRANSLATIONS) {
    code = code.replace(pattern, replacement);
  }

  return {
    code,
    changed: code !== source
  };
}
